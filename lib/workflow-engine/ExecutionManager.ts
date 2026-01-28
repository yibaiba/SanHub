import {
  IExecutionManager,
  IDependencyResolver,
  IStateManager,
  ExecutionOptions,
  ExecutionResult,
  WorkflowExecutionResult
} from './types';
import { WorkspaceNode, WorkspaceEdge } from '@/types';
import { DependencyResolver } from './DependencyResolver';
import { StateManager } from './StateManager';

export class ExecutionManager implements IExecutionManager {
  private resolver: IDependencyResolver;
  private stateManager: StateManager; // Concrete type to access extended methods
  private getWorkspaceData: (workspaceId: string) => Promise<{ nodes: WorkspaceNode[], edges: WorkspaceEdge[] }>;
  private executeNodeFn: (node: WorkspaceNode, inputs: any) => Promise<any>;

  constructor(
    stateManager: StateManager,
    getWorkspaceData: (workspaceId: string) => Promise<{ nodes: WorkspaceNode[], edges: WorkspaceEdge[] }>,
    executeNodeFn: (node: WorkspaceNode, inputs: any) => Promise<any>
  ) {
    this.resolver = new DependencyResolver();
    this.stateManager = stateManager;
    this.getWorkspaceData = getWorkspaceData;
    this.executeNodeFn = executeNodeFn;
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

    // 3. Initialize state
    await this.stateManager.initializeWorkflow(workspaceId, nodes);
    const wsState = await this.stateManager.getExecutionState(workspaceId);
    wsState.isExecuting = true;
    wsState.executionOrder = executionOrder;
    await this.stateManager.persistState(workspaceId);

    const startTime = Date.now();
    const errors: Array<{ nodeId: string; error: string }> = [];

    // 4. Execute nodes
    // In a topological sort, we can technically run strictly in order.
    // For concurrency (Requirement 8.1), we should actually check which nodes are ready.
    // But adhering to topological order sequentially is the simplest correct implementation.
    // To support concurrency, we would use a queue of "ready" nodes.

    // Let's implement concurrent execution where possible.
    // We will use a Promise map.

    const executionPromises = new Map<string, Promise<void>>();
    const completedNodes = new Set<string>();
    const failedNodes = new Set<string>();

    // Helper to check if a node is ready (all dependencies completed)
    const isReady = (nodeId: string): boolean => {
        const upstream = this.resolver.getUpstreamNodes(nodeId, edges);
        return upstream.every(pid => completedNodes.has(pid));
    };

    // Main execution loop driver
    // Since this is async, we can't just loop. We need to trigger "roots" and then trigger children.

    // Find roots
    const roots = nodes.filter(n => this.resolver.getUpstreamNodes(n.id, edges).length === 0);

    // We need to manage the overall completion.
    // Simple approach: Iterate through topological order, await if needed? No, that's sequential.

    // Better approach:
    // 1. Trigger all roots.
    // 2. When a node completes, trigger its downstream neighbors IF they are ready.

    // We need a way to wait for the whole workflow.
    return new Promise<WorkflowExecutionResult>((resolve) => {
        let pendingCount = 0;

        const checkCompletion = () => {
             if (pendingCount === 0 && executionPromises.size === 0) {
                 // All done
                 wsState.isExecuting = false;
                 resolve({
                     workspaceId,
                     totalNodes: nodes.length,
                     completedNodes: completedNodes.size,
                     failedNodes: failedNodes.size,
                     duration: Date.now() - startTime,
                     errors
                 });
             }
        };

        const runNode = async (nodeId: string) => {
             if (failedNodes.size > 0 && !executionPromises.has(nodeId)) {
                 // If failure occurred, we might stop? Or continue independent branches?
                 // Requirement 2.4: "Halt execution and mark all dependent... blocked"
                 // For now, simple stop propagation.
                 return;
             }

             pendingCount++;
             const promise = this.executeNodeInternal(workspaceId, nodeId, nodes, edges);
             executionPromises.set(nodeId, promise);

             try {
                 await promise;
                 completedNodes.add(nodeId);

                 // Trigger downstream
                 const downstream = this.resolver.getDownstreamNodes(nodeId, edges);
                 downstream.forEach(childId => {
                     if (!completedNodes.has(childId) && !executionPromises.has(childId) && isReady(childId)) {
                         runNode(childId);
                     }
                 });
             } catch (e: any) {
                 failedNodes.add(nodeId);
                 errors.push({ nodeId, error: e.message });
                 // Stop downstream propagation
             } finally {
                 pendingCount--;
                 executionPromises.delete(nodeId);
                 checkCompletion();
             }
        };

        if (roots.length === 0 && nodes.length > 0) {
             // Should verify topological order for cycles, but we did that.
             // If valid DAG, there must be roots.
             resolve({
                 workspaceId,
                 totalNodes: nodes.length,
                 completedNodes: 0,
                 failedNodes: 0,
                 duration: 0,
                 errors: [{ nodeId: 'root', error: 'No start nodes found' }]
             });
        }

        roots.forEach(r => runNode(r.id));
    });
  }

  private async executeNodeInternal(
    workspaceId: string,
    nodeId: string,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[]
  ): Promise<void> {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found`);

      // 1. Update State -> Running
      await this.stateManager.setNodeState(workspaceId, nodeId, { status: 'running' });

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

          // 3. Execute Logic
          const output = await this.executeNodeFn(node, inputs);

          // 4. Update State -> Completed
          await this.stateManager.setNodeState(workspaceId, nodeId, {
              status: 'completed',
              output
          });
      } catch (err: any) {
          // 5. Update State -> Failed
           await this.stateManager.setNodeState(workspaceId, nodeId, {
              status: 'failed',
              error: err.message
          });
          throw err;
      }
  }

  async executeNode(nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult> {
     // Single node execution (Manual trigger)
     // NOTE: This usually needs the workspace context.
     // We will need to look up workspaceId from somewhere or require it in the method signature.
     // Assuming for now we can't easily do this without workspaceId.
     throw new Error("executeNode requires workspaceId - method signature update needed in interface or implementation context");
  }

  async executeNodeInWorkspace(workspaceId: string, nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult> {
      const { nodes, edges } = await this.getWorkspaceData(workspaceId);
      const start = Date.now();

      try {
          await this.executeNodeInternal(workspaceId, nodeId, nodes, edges);
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

  async cancelExecution(workspaceId: string): Promise<void> {
    const wsState = await this.stateManager.getExecutionState(workspaceId);
    wsState.isExecuting = false;
    // Real cancellation would require abort signals passed to executeNodeFn
  }

  async triggerCascade(nodeId: string): Promise<void> {
     // Requires workspaceId context
     throw new Error("triggerCascade requires workspaceId context");
  }

  private async triggerCascadeInternal(workspaceId: string, nodeId: string, nodes: WorkspaceNode[], edges: WorkspaceEdge[]) {
      const downstream = this.resolver.getDownstreamNodes(nodeId, edges);
      // Trigger execution for downstream nodes
      // This is a simplified recursive trigger
      for (const childId of downstream) {
          await this.executeNodeInWorkspace(workspaceId, childId, { cascadeEnabled: true });
      }
  }
}
