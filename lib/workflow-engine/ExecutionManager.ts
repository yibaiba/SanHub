import {
  IExecutionManager,
  IDependencyResolver,
  IStateManager,
  ExecutionOptions,
  ExecutionResult,
  WorkflowExecutionResult,
  NodeExecutionContext
} from './types';
import { WorkspaceNode, WorkspaceEdge } from '@/types';
import { DependencyResolver } from './DependencyResolver';
import { StateManager } from './StateManager';

export interface ExecutionManagerOptions {
  maxConcurrency?: number;  // Max concurrent node executions (default: 3)
}

export class ExecutionManager implements IExecutionManager {
  private resolver: IDependencyResolver;
  private stateManager: StateManager;
  private getWorkspaceData: (workspaceId: string) => Promise<{ nodes: WorkspaceNode[], edges: WorkspaceEdge[] }>;
  private executeNodeFn: (node: WorkspaceNode, inputs: any, context?: NodeExecutionContext) => Promise<any>;
  private maxConcurrency: number;

  constructor(
    stateManager: StateManager,
    getWorkspaceData: (workspaceId: string) => Promise<{ nodes: WorkspaceNode[], edges: WorkspaceEdge[] }>,
    executeNodeFn: (node: WorkspaceNode, inputs: any, context?: NodeExecutionContext) => Promise<any>,
    options?: ExecutionManagerOptions
  ) {
    this.resolver = new DependencyResolver();
    this.stateManager = stateManager;
    this.getWorkspaceData = getWorkspaceData;
    this.executeNodeFn = executeNodeFn;
    this.maxConcurrency = options?.maxConcurrency ?? 3;
  }

  async executeWorkflow(workspaceId: string): Promise<WorkflowExecutionResult> {
    const { nodes, edges } = await this.getWorkspaceData(workspaceId);

    // 1. Validate
    const validation = this.resolver.validateWorkflow(nodes, edges);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // 2. Compute order
    const executionOrder = this.resolver.computeTopologicalOrder(nodes, edges);

    // 3. Initialize state with AbortController
    await this.stateManager.initializeWorkflow(workspaceId, nodes);
    const wsState = await this.stateManager.getExecutionState(workspaceId);
    const abortController = new AbortController();
    wsState.isExecuting = true;
    wsState.executionOrder = executionOrder;
    wsState.abortController = abortController;
    await this.stateManager.persistState(workspaceId);

    const startTime = Date.now();
    const errors: Array<{ nodeId: string; error: string }> = [];

    const executionPromises = new Map<string, Promise<void>>();
    const completedNodes = new Set<string>();
    const failedNodes = new Set<string>();
    const cancelledNodes = new Set<string>();
    let activeCount = 0;
    const pendingQueue: string[] = [];

    const isReady = (nodeId: string): boolean => {
      const upstream = this.resolver.getUpstreamNodes(nodeId, edges);
      return upstream.every(pid => completedNodes.has(pid));
    };

    const roots = nodes.filter(n => this.resolver.getUpstreamNodes(n.id, edges).length === 0);

    return new Promise<WorkflowExecutionResult>((resolve) => {
      const checkCompletion = () => {
        if (activeCount === 0 && pendingQueue.length === 0 && executionPromises.size === 0) {
          wsState.isExecuting = false;
          wsState.abortController = undefined;
          this.stateManager.persistState(workspaceId);
          resolve({
            workspaceId,
            totalNodes: nodes.length,
            completedNodes: completedNodes.size,
            failedNodes: failedNodes.size + cancelledNodes.size,
            duration: Date.now() - startTime,
            errors
          });
        }
      };

      const tryRunNext = () => {
        while (activeCount < this.maxConcurrency && pendingQueue.length > 0) {
          const nodeId = pendingQueue.shift()!;
          if (!completedNodes.has(nodeId) && !executionPromises.has(nodeId) && !failedNodes.has(nodeId) && !cancelledNodes.has(nodeId)) {
            runNode(nodeId);
          }
        }
      };

      const runNode = async (nodeId: string) => {
        // Check if cancelled
        if (abortController.signal.aborted) {
          cancelledNodes.add(nodeId);
          await this.stateManager.setNodeState(workspaceId, nodeId, { status: 'cancelled' });
          checkCompletion();
          return;
        }

        // Check if failure occurred (stop downstream propagation)
        if (failedNodes.size > 0 && !executionPromises.has(nodeId)) {
          return;
        }

        activeCount++;
        const executionContext: NodeExecutionContext = {
          abortSignal: abortController.signal,
          onProgress: async (progress, message) => {
            await this.stateManager.setNodeState(workspaceId, nodeId, {
              status: 'running',
              progress,
              progressMessage: message
            });
          }
        };

        const promise = this.executeNodeInternal(workspaceId, nodeId, nodes, edges, executionContext);
        executionPromises.set(nodeId, promise);

        try {
          await promise;

          // Check again after execution
          if (abortController.signal.aborted) {
            cancelledNodes.add(nodeId);
            return;
          }

          completedNodes.add(nodeId);

          // Queue downstream nodes
          const downstream = this.resolver.getDownstreamNodes(nodeId, edges);
          downstream.forEach(childId => {
            if (!completedNodes.has(childId) && !executionPromises.has(childId) && !failedNodes.has(childId) && isReady(childId)) {
              pendingQueue.push(childId);
            }
          });

          tryRunNext();
        } catch (e: any) {
          if (abortController.signal.aborted || e.name === 'AbortError') {
            cancelledNodes.add(nodeId);
            errors.push({ nodeId, error: 'Execution cancelled' });
          } else {
            failedNodes.add(nodeId);
            errors.push({ nodeId, error: e.message });

            // 积分不足时暂停整个工作流
            const errorMsg = (e.message || '').toLowerCase();
            if (errorMsg.includes('余额不足') ||
                errorMsg.includes('insufficient') ||
                errorMsg.includes('balance')) {
              // 取消所有待执行的节点
              abortController.abort();
              pendingQueue.forEach(pid => {
                if (!completedNodes.has(pid) && !failedNodes.has(pid)) {
                  cancelledNodes.add(pid);
                  this.stateManager.setNodeState(workspaceId, pid, {
                    status: 'cancelled',
                    error: '因积分不足暂停'
                  });
                }
              });
              pendingQueue.length = 0; // 清空队列
            }
          }
        } finally {
          activeCount--;
          executionPromises.delete(nodeId);
          checkCompletion();
          tryRunNext();
        }
      };

      if (roots.length === 0 && nodes.length > 0) {
        resolve({
          workspaceId,
          totalNodes: nodes.length,
          completedNodes: 0,
          failedNodes: 0,
          duration: 0,
          errors: [{ nodeId: 'root', error: 'No start nodes found' }]
        });
        return;
      }

      // Queue all root nodes
      roots.forEach(r => pendingQueue.push(r.id));
      tryRunNext();
    });
  }

  private async executeNodeInternal(
    workspaceId: string,
    nodeId: string,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[],
    context?: NodeExecutionContext
  ): Promise<void> {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    // Check if aborted before starting
    if (context?.abortSignal?.aborted) {
      throw new DOMException('Execution cancelled', 'AbortError');
    }

    // 1. Update State -> Running
    await this.stateManager.setNodeState(workspaceId, nodeId, { status: 'running', progress: 0 });

    try {
      // 2. Gather Inputs
      const upstreamIds = this.resolver.getUpstreamNodes(nodeId, edges);
      const wsState = await this.stateManager.getExecutionState(workspaceId);

      const inputs: Record<string, any> = {};
      upstreamIds.forEach(pid => {
        const pState = wsState.nodeStates.get(pid);
        if (pState && pState.output) {
          inputs[pid] = pState.output;
        }
      });

      // 3. Execute Logic with context
      const output = await this.executeNodeFn(node, inputs, context);

      // Check if aborted after execution
      if (context?.abortSignal?.aborted) {
        throw new DOMException('Execution cancelled', 'AbortError');
      }

      // 4. Update State -> Completed
      await this.stateManager.setNodeState(workspaceId, nodeId, {
        status: 'completed',
        output,
        progress: 100
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || context?.abortSignal?.aborted) {
        await this.stateManager.setNodeState(workspaceId, nodeId, {
          status: 'cancelled',
          error: 'Execution cancelled'
        });
      } else {
        await this.stateManager.setNodeState(workspaceId, nodeId, {
          status: 'failed',
          error: err.message
        });
      }
      throw err;
    }
  }

  async executeNode(nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    throw new Error("executeNode requires workspaceId - use executeNodeInWorkspace instead");
  }

  async executeNodeInWorkspace(workspaceId: string, nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const { nodes, edges } = await this.getWorkspaceData(workspaceId);
    const start = Date.now();

    // Create a dedicated abort controller for single node execution
    const abortController = new AbortController();
    const context: NodeExecutionContext = {
      abortSignal: abortController.signal
    };

    try {
      await this.executeNodeInternal(workspaceId, nodeId, nodes, edges, context);
      const state = (await this.stateManager.getExecutionState(workspaceId)).nodeStates.get(nodeId);

      if (options?.cascadeEnabled) {
        await this.triggerCascadeInternal(workspaceId, nodeId, nodes, edges);
      }

      return {
        nodeId,
        status: state?.status === 'completed' ? 'completed' : 'failed',
        output: state?.output,
        error: state?.error,
        duration: Date.now() - start
      };
    } catch (e: any) {
      return {
        nodeId,
        status: 'failed',
        error: e.message,
        duration: Date.now() - start
      };
    }
  }

  /**
   * Retry a failed node execution
   */
  async retryNode(workspaceId: string, nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const wsState = await this.stateManager.getExecutionState(workspaceId);
    const nodeState = wsState.nodeStates.get(nodeId);

    // Only allow retry for failed or cancelled nodes
    if (nodeState && nodeState.status !== 'failed' && nodeState.status !== 'cancelled') {
      if (nodeState.status === 'completed' && !options?.forceRerun) {
        return {
          nodeId,
          status: 'completed',
          output: nodeState.output,
          duration: 0
        };
      }
    }

    // Reset node state before retry
    await this.stateManager.setNodeState(workspaceId, nodeId, { status: 'idle' });

    return this.executeNodeInWorkspace(workspaceId, nodeId, options);
  }

  async cancelExecution(workspaceId: string): Promise<void> {
    const wsState = await this.stateManager.getExecutionState(workspaceId);

    // Abort all running operations
    if (wsState.abortController) {
      wsState.abortController.abort();
    }

    wsState.isExecuting = false;

    // Mark all running nodes as cancelled
    const cancelPromises: Promise<void>[] = [];
    wsState.nodeStates.forEach((state, nodeId) => {
      if (state.status === 'running' || state.status === 'waiting') {
        cancelPromises.push(
          this.stateManager.setNodeState(workspaceId, nodeId, {
            status: 'cancelled',
            error: 'Execution cancelled by user'
          })
        );
      }
    });
    await Promise.all(cancelPromises);

    await this.stateManager.persistState(workspaceId);
  }

  async triggerCascade(nodeId: string): Promise<void> {
    throw new Error("triggerCascade requires workspaceId context");
  }

  private async areUpstreamNodesCompleted(workspaceId: string, nodeId: string, edges: WorkspaceEdge[]): Promise<boolean> {
    const upstreamIds = this.resolver.getUpstreamNodes(nodeId, edges);
    if (upstreamIds.length === 0) {
      return true;
    }

    const wsState = await this.stateManager.getExecutionState(workspaceId);
    return upstreamIds.every((parentId) => wsState.nodeStates.get(parentId)?.status === 'completed');
  }

  private async triggerCascadeInternal(workspaceId: string, nodeId: string, nodes: WorkspaceNode[], edges: WorkspaceEdge[]) {
    const downstream = this.resolver.getDownstreamNodes(nodeId, edges);
    for (const childId of downstream) {
      if (!(await this.areUpstreamNodesCompleted(workspaceId, childId, edges))) {
        continue;
      }

      const wsState = await this.stateManager.getExecutionState(workspaceId);
      const childState = wsState.nodeStates.get(childId);
      if (childState?.status === 'running' || childState?.status === 'waiting') {
        continue;
      }

      await this.executeNodeInWorkspace(workspaceId, childId, { cascadeEnabled: true });
    }
  }
}
