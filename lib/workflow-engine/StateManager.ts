import { IStateManager, NodeExecutionState, WorkspaceExecutionState } from './types';
import { WorkspaceNode } from '@/types';

export type StateChangeListener = (workspaceId: string, nodeId: string, state: NodeExecutionState) => void;

// Persisted state format (Map -> Object conversion)
interface PersistedWorkflowState {
  workspaceId: string;
  isExecuting: boolean;
  nodeStates: Record<string, NodeExecutionState>;
  executionOrder?: string[];
  lastUpdated: number;
}

const STORAGE_PREFIX = 'workflow_state_';
const PERSIST_DEBOUNCE_MS = 500;

export class StateManager implements IStateManager {
  private states: Map<string, WorkspaceExecutionState> = new Map();
  private listeners: Set<StateChangeListener> = new Set();
  private persistDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {}

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
    // Search all workspaces for this node
    this.states.forEach((wsState, wsId) => {
      if (wsState.nodeStates.has(nodeId)) {
        wsState.nodeStates.set(nodeId, state);
        this.schedulePersist(wsId);
      }
    });
  }

  async setNodeState(workspaceId: string, nodeId: string, state: NodeExecutionState): Promise<void> {
    const wsState = this.ensureWorkspaceState(workspaceId);

    // Merge with existing state to preserve fields
    const existingState = wsState.nodeStates.get(nodeId) || {};
    const mergedState: NodeExecutionState = {
      ...existingState,
      ...state,
    };

    // Update timestamps if running/completed
    if (mergedState.status === 'running' && !mergedState.startTime) {
      mergedState.startTime = Date.now();
    }
    if ((mergedState.status === 'completed' || mergedState.status === 'failed' || mergedState.status === 'cancelled') && !mergedState.endTime) {
      mergedState.endTime = Date.now();
    }

    wsState.nodeStates.set(nodeId, mergedState);
    this.notifyListeners(workspaceId, nodeId, mergedState);
    this.schedulePersist(workspaceId);
  }

  async getExecutionState(workspaceId: string): Promise<WorkspaceExecutionState> {
    return this.ensureWorkspaceState(workspaceId);
  }

  /**
   * Schedule debounced persist to localStorage
   */
  private schedulePersist(workspaceId: string) {
    const existingTimer = this.persistDebounceTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.persistStateSync(workspaceId);
      this.persistDebounceTimers.delete(workspaceId);
    }, PERSIST_DEBOUNCE_MS);

    this.persistDebounceTimers.set(workspaceId, timer);
  }

  /**
   * Immediately persist state to localStorage
   */
  private persistStateSync(workspaceId: string) {
    const state = this.states.get(workspaceId);
    if (!state) return;

    try {
      // Convert Map to Object for JSON serialization
      const persistedState: PersistedWorkflowState = {
        workspaceId: state.workspaceId,
        isExecuting: state.isExecuting,
        nodeStates: Object.fromEntries(state.nodeStates),
        executionOrder: state.executionOrder,
        lastUpdated: Date.now(),
      };

      const key = `${STORAGE_PREFIX}${workspaceId}`;

      // Check if we're in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, JSON.stringify(persistedState));
      }
    } catch (error) {
      console.warn('[StateManager] Failed to persist state:', error);
    }
  }

  async persistState(workspaceId: string): Promise<void> {
    // Cancel any pending debounced persist
    const existingTimer = this.persistDebounceTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.persistDebounceTimers.delete(workspaceId);
    }

    this.persistStateSync(workspaceId);
  }

  async restoreState(workspaceId: string): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const key = `${STORAGE_PREFIX}${workspaceId}`;
      const stored = localStorage.getItem(key);

      if (!stored) {
        return;
      }

      const persistedState: PersistedWorkflowState = JSON.parse(stored);

      // Validate and restore
      if (persistedState.workspaceId !== workspaceId) {
        console.warn('[StateManager] Workspace ID mismatch, ignoring stored state');
        return;
      }

      // Check if state is stale (older than 24 hours)
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      if (Date.now() - persistedState.lastUpdated > MAX_AGE_MS) {
        console.log('[StateManager] Stored state is stale, clearing');
        localStorage.removeItem(key);
        return;
      }

      // Restore to memory
      const wsState = this.ensureWorkspaceState(workspaceId);
      wsState.isExecuting = false; // Always reset executing flag on restore
      wsState.executionOrder = persistedState.executionOrder;
      wsState.nodeStates = new Map(Object.entries(persistedState.nodeStates));

      // Reset any 'running' states to 'idle' since execution was interrupted
      wsState.nodeStates.forEach((nodeState, nodeId) => {
        if (nodeState.status === 'running' || nodeState.status === 'waiting') {
          wsState.nodeStates.set(nodeId, {
            ...nodeState,
            status: 'idle',
            error: 'Execution interrupted - page refreshed'
          });
        }
      });

      console.log(`[StateManager] Restored state for workspace ${workspaceId}`);
    } catch (error) {
      console.warn('[StateManager] Failed to restore state:', error);
    }
  }

  async resetWorkflow(workspaceId: string): Promise<void> {
    const state = this.ensureWorkspaceState(workspaceId);
    state.isExecuting = false;
    state.nodeStates.clear();
    state.executionOrder = undefined;
    state.abortController = undefined;

    // Clear from localStorage
    this.clearPersistedState(workspaceId);
  }

  /**
   * Clear persisted state from localStorage
   */
  clearPersistedState(workspaceId: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `${STORAGE_PREFIX}${workspaceId}`;
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[StateManager] Failed to clear persisted state:', error);
    }
  }

  /**
   * Check if there's persisted state for a workspace
   */
  hasPersistedState(workspaceId: string): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const key = `${STORAGE_PREFIX}${workspaceId}`;
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get summary of persisted state without fully restoring
   */
  getPersistedStateSummary(workspaceId: string): {
    exists: boolean;
    lastUpdated?: Date;
    nodeCount?: number;
    hasIncompleteNodes?: boolean;
  } {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return { exists: false };
      }

      const key = `${STORAGE_PREFIX}${workspaceId}`;
      const stored = localStorage.getItem(key);

      if (!stored) {
        return { exists: false };
      }

      const persistedState: PersistedWorkflowState = JSON.parse(stored);
      const nodeStates = Object.values(persistedState.nodeStates);
      const hasIncompleteNodes = nodeStates.some(s =>
        s.status === 'running' || s.status === 'waiting' || s.status === 'failed'
      );

      return {
        exists: true,
        lastUpdated: new Date(persistedState.lastUpdated),
        nodeCount: nodeStates.length,
        hasIncompleteNodes
      };
    } catch {
      return { exists: false };
    }
  }

  async initializeWorkflow(workspaceId: string, nodes: WorkspaceNode[]): Promise<void> {
    const state = this.ensureWorkspaceState(workspaceId);
    nodes.forEach(node => {
      state.nodeStates.set(node.id, {
        status: 'idle'
      });
    });
    this.schedulePersist(workspaceId);
  }
}
