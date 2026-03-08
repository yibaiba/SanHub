import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ExecutionManager,
  StateManager,
  NodeExecutionState,
  NodeExecutionContext
} from '@/lib/workflow-engine';
import { WorkspaceNode, WorkspaceEdge, SafeImageModel, SafeVideoModel, ChatModel } from '@/types';
import { executeNodeAPI } from '../lib/node-execution';
import { getNodeOutputUpdates } from '../lib/node-output';

interface UseWorkflowEngineProps {
  workspaceId: string;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: ChatModel[];
  updateNodeData: (id: string, data: Partial<WorkspaceNode['data']>) => void;
}

interface WorkflowEngineReturn {
  runWorkflow: () => Promise<void>;
  stopWorkflow: () => Promise<void>;
  retryNode: (nodeId: string, cascade?: boolean) => Promise<void>;
  runSingleNode: (nodeId: string, cascade?: boolean) => Promise<void>;
  runBatchNodes: (nodeIds: string[], cascade?: boolean) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  isExecuting: boolean;
  hasFailedNodes: boolean;
  failedNodeIds: string[];
}

export function useWorkflowEngine({
  workspaceId,
  nodes,
  edges,
  imageModels,
  videoModels,
  chatModels,
  updateNodeData
}: UseWorkflowEngineProps): WorkflowEngineReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [failedNodeIds, setFailedNodeIds] = useState<string[]>([]);
  const engineRef = useRef<ExecutionManager | null>(null);
  const stateManagerRef = useRef<StateManager | null>(null);

  // Use refs to always have latest values in callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Initialize engine
  useEffect(() => {
    if (!stateManagerRef.current) {
      stateManagerRef.current = new StateManager();

      // Subscribe to state changes
      stateManagerRef.current.subscribe((wsId, nodeId, state) => {
        if (wsId !== workspaceId) return;

        // Update UI node data
        const updates: Partial<WorkspaceNode['data']> = {
          status: mapStatusToNodeStatus(state.status),
          errorMessage: state.error
        };

        // Handle progress
        if (typeof state.progress === 'number') {
          updates.progress = state.progress;
        }

        if (state.output !== undefined) {
          const node = nodesRef.current.find((item) => item.id === nodeId);
          if (node) {
            Object.assign(updates, getNodeOutputUpdates(node.type, state.output));
          }
        }

        updateNodeData(nodeId, updates);

        // Track failed nodes
        if (state.status === 'failed') {
          setFailedNodeIds(prev => prev.includes(nodeId) ? prev : [...prev, nodeId]);
        } else if (state.status === 'completed' || state.status === 'idle') {
          setFailedNodeIds(prev => prev.filter(id => id !== nodeId));
        }
      });

      // Attempt to restore state from local storage on mount
      stateManagerRef.current.restoreState(workspaceId);
    }

    // Initialize ExecutionManager with latest data getter
    engineRef.current = new ExecutionManager(
      stateManagerRef.current,
      async () => {
        return { nodes: nodesRef.current, edges: edgesRef.current };
      },
      async (node, inputs, context?: NodeExecutionContext) => {
        return executeNodeAPI(node, inputs, {
          imageModels,
          videoModels,
          chatModels
        }, context);
      },
      { maxConcurrency: 3 }
    );
  }, [workspaceId, imageModels, videoModels, chatModels, updateNodeData]);

  const runWorkflow = useCallback(async () => {
    if (!engineRef.current) return;
    setIsExecuting(true);
    setFailedNodeIds([]);
    try {
      await engineRef.current.executeWorkflow(workspaceId);
    } catch (e) {
      console.error('Workflow execution failed', e);
    } finally {
      setIsExecuting(false);
    }
  }, [workspaceId]);

  const stopWorkflow = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.cancelExecution(workspaceId);
    setIsExecuting(false);
  }, [workspaceId]);

  const retryNode = useCallback(async (nodeId: string, cascade: boolean = false) => {
    if (!engineRef.current) return;
    setIsExecuting(true);
    try {
      await engineRef.current.retryNode(workspaceId, nodeId, { cascadeEnabled: cascade });
    } catch (e) {
      console.error('Node retry failed', e);
    } finally {
      setIsExecuting(false);
    }
  }, [workspaceId]);

  const runSingleNode = useCallback(async (nodeId: string, cascade: boolean = false) => {
    if (!engineRef.current) return;
    setIsExecuting(true);
    try {
      await engineRef.current.executeNodeInWorkspace(workspaceId, nodeId, { cascadeEnabled: cascade });
    } catch (e) {
      console.error('Node execution failed', e);
    } finally {
      setIsExecuting(false);
    }
  }, [workspaceId]);

  // Batch execute multiple nodes (for storyboard batch execution)
  const runBatchNodes = useCallback(async (nodeIds: string[], cascade: boolean = true) => {
    if (!engineRef.current || nodeIds.length === 0) return;
    setIsExecuting(true);
    setFailedNodeIds([]);
    try {
      // Execute nodes sequentially to respect dependencies
      for (const nodeId of nodeIds) {
        await engineRef.current.executeNodeInWorkspace(workspaceId, nodeId, { cascadeEnabled: cascade });
      }
    } catch (e) {
      console.error('Batch node execution failed', e);
    } finally {
      setIsExecuting(false);
    }
  }, [workspaceId]);

  // Retry all failed nodes
  const retryAllFailed = useCallback(async () => {
    if (!engineRef.current || failedNodeIds.length === 0) return;
    setIsExecuting(true);
    const nodesToRetry = [...failedNodeIds];
    try {
      for (const nodeId of nodesToRetry) {
        await engineRef.current.retryNode(workspaceId, nodeId, { cascadeEnabled: true });
      }
    } catch (e) {
      console.error('Retry all failed nodes failed', e);
    } finally {
      setIsExecuting(false);
    }
  }, [workspaceId, failedNodeIds]);

  return {
    runWorkflow,
    stopWorkflow,
    retryNode,
    runSingleNode,
    runBatchNodes,
    retryAllFailed,
    isExecuting,
    hasFailedNodes: failedNodeIds.length > 0,
    failedNodeIds
  };
}

// Map engine status to node display status
function mapStatusToNodeStatus(status: NodeExecutionState['status']): WorkspaceNode['data']['status'] {
  switch (status) {
    case 'running':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'idle':
    case 'waiting':
    default:
      return 'idle';
  }
}
