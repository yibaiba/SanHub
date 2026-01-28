import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ExecutionManager,
  StateManager,
  NodeExecutionState
} from '@/lib/workflow-engine';
import { WorkspaceNode, WorkspaceEdge, SafeImageModel, SafeVideoModel, ChatModel } from '@/types';
import { executeNodeAPI } from '../lib/node-execution';

interface UseWorkflowEngineProps {
  workspaceId: string;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: ChatModel[];
  updateNodeData: (id: string, data: Partial<WorkspaceNode['data']>) => void;
}

export function useWorkflowEngine({
  workspaceId,
  nodes,
  edges,
  imageModels,
  videoModels,
  chatModels,
  updateNodeData
}: UseWorkflowEngineProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const engineRef = useRef<ExecutionManager | null>(null);
  const stateManagerRef = useRef<StateManager | null>(null);

  // Initialize engine
  useEffect(() => {
    if (!stateManagerRef.current) {
      stateManagerRef.current = new StateManager();

      // Subscribe to state changes
      stateManagerRef.current.subscribe((wsId, nodeId, state) => {
        if (wsId !== workspaceId) return;

        // Update UI node data
        const updates: Partial<WorkspaceNode['data']> = {
          status: state.status,
          errorMessage: state.error
        };

        if (state.output) {
          if (typeof state.output === 'string' && (state.output.startsWith('http') || state.output.startsWith('data:'))) {
             updates.outputUrl = state.output;
             // Try to infer type
             if (state.output.endsWith('.mp4')) updates.outputType = 'video';
             else updates.outputType = 'image';
          } else if (typeof state.output === 'string') {
             updates.chatOutput = state.output;
             updates.templateOutput = state.output;
          }
        }

        updateNodeData(nodeId, updates);
      });

      // Attempt to restore state from local storage on mount
      stateManagerRef.current.restoreState(workspaceId);
    }

    // Initialize ExecutionManager
    engineRef.current = new ExecutionManager(
      stateManagerRef.current,
      async (wsId) => {
        // Return current nodes/edges state
        // Note: In a real async scenario, we might fetch from DB to ensure latest.
        // But here we use the props which are kept in sync by the parent.
        return { nodes, edges };
      },
      async (node, inputs) => {
        return executeNodeAPI(node, inputs, {
          imageModels,
          videoModels,
          chatModels
        });
      }
    );
  }, [workspaceId, nodes, edges, imageModels, videoModels, chatModels, updateNodeData]);

  const runWorkflow = useCallback(async () => {
    if (!engineRef.current) return;
    setIsExecuting(true);
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

  return {
    runWorkflow,
    stopWorkflow,
    isExecuting
  };
}
