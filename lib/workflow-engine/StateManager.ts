import { IStateManager, NodeExecutionState, WorkspaceExecutionState } from './types';
import { WorkspaceNode } from '@/types';

export type StateChangeListener = (workspaceId: string, nodeId: string, state: NodeExecutionState) => void;

export class StateManager implements IStateManager {
  // In-memory store for execution states
  // Key: workspaceId, Value: WorkspaceExecutionState
  private states: Map<string, WorkspaceExecutionState> = new Map();
  private listeners: Set<StateChangeListener> = new Set();

  constructor() {
    // Should ideally initialize from DB or persistent store
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(workspaceId: string, nodeId: string, state: NodeExecutionState) {
    this.listeners.forEach(listener => listener(workspaceId, nodeId, state));
  }

  private ensureWorkspaceState(workspaceId: string) {
    if (!this.states.has(workspaceId)) {
      this.states.set(workspaceId, {
        workspaceId,
        isExecuting: false,
        nodeStates: new Map(),
      });
    }
    return this.states.get(workspaceId)!;
  }

  async updateNodeState(nodeId: string, state: NodeExecutionState): Promise<void> {
    // Note: In a real app, we need the workspaceId to locate the correct state context.
    // The current interface in design.md `updateNodeState(nodeId, state)` assumes global uniqueness or implied context.
    // For this implementation, we'll need to find which workspace contains this node or assume a singleton/current context context.

    // To make this robust, we should probably pass workspaceId.
    // However, adhering to the interface:

    // Strategy: We'll search all workspaces. (Inefficient, but fits the interface if nodeId is unique).
    // BETTER: Fix the interface in a future iteration. For now, let's assume we can pass workspaceId
    // OR we change the interface to `updateNodeState(workspaceId: string, nodeId: string, state: NodeExecutionState)`

    // Let's modify the implementation to accept workspaceId implicitly or update all matching (assuming UUIDs).
    for (const [wsId, wsState] of this.states.entries()) {
      if (wsState.nodeStates.has(nodeId)) {
        wsState.nodeStates.set(nodeId, state);
        return;
      }
    }

    // If not found, we can't update.
    console.warn(`Node state not updated: Node ${nodeId} not found in any active execution state.`);
  }

  // Extended method to support workspaceId explicitly
  async setNodeState(workspaceId: string, nodeId: string, state: NodeExecutionState): Promise<void> {
    const wsState = this.ensureWorkspaceState(workspaceId);
    wsState.nodeStates.set(nodeId, state);

    // Update timestamps if running/completed
    if (state.status === 'running' && !state.startTime) {
       state.startTime = Date.now();
    }
    if ((state.status === 'completed' || state.status === 'failed') && !state.endTime) {
       state.endTime = Date.now();
    }

    this.notifyListeners(workspaceId, nodeId, state);
  }

  async getExecutionState(workspaceId: string): Promise<WorkspaceExecutionState> {
    return this.ensureWorkspaceState(workspaceId);
  }

  async persistState(workspaceId: string): Promise<void> {
    const state = this.states.get(workspaceId);
    if (!state) return;

    // TODO: Implement DB persistence
    // For now, we simulate persistence by keeping it in memory (which this class already does).
    // In a real implementation, we would write to the `workflow_execution_state` table defined in the proposal.
    console.log(`[StateManager] Persisting state for workspace ${workspaceId}`);
  }

  async restoreState(workspaceId: string): Promise<void> {
    // TODO: Implement DB restoration
    // For now, assume state is already in memory or empty
    console.log(`[StateManager] Restoring state for workspace ${workspaceId}`);
  }

  async resetWorkflow(workspaceId: string): Promise<void> {
    const state = this.ensureWorkspaceState(workspaceId);
    state.isExecuting = false;
    state.nodeStates.clear();
    state.executionOrder = undefined;

    // TODO: Clear from DB
  }

  // Helper to initialize states for a workflow
  async initializeWorkflow(workspaceId: string, nodes: WorkspaceNode[]): Promise<void> {
    const state = this.ensureWorkspaceState(workspaceId);
    nodes.forEach(node => {
        state.nodeStates.set(node.id, {
            status: 'idle'
        });
    });
  }
}
