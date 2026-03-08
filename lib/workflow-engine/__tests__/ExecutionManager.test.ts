import { describe, expect, it, vi } from 'vitest';
import { ExecutionManager } from '../ExecutionManager';
import { StateManager } from '../StateManager';
import type { WorkspaceEdge, WorkspaceNode } from '@/types';

function createNode(id: string, type: WorkspaceNode['type'] = 'chat'): WorkspaceNode {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    data: { prompt: id },
  };
}

describe('ExecutionManager cascade', () => {
  it('waits for all parent nodes before cascading to a shared child', async () => {
    const stateManager = new StateManager();
    const nodes = [createNode('a'), createNode('b'), createNode('c')];
    const edges: WorkspaceEdge[] = [
      { id: 'e1', from: 'a', to: 'c' },
      { id: 'e2', from: 'b', to: 'c' },
    ];
    await stateManager.initializeWorkflow('ws-1', nodes);

    const executeSpy = vi.fn(async (node: WorkspaceNode, inputs: Record<string, unknown>) => {
      if (node.id === 'c') {
        return JSON.stringify(inputs);
      }
      return `${node.id}-output`;
    });

    const manager = new ExecutionManager(
      stateManager,
      async () => ({ nodes, edges }),
      executeSpy,
      { maxConcurrency: 1 }
    );

    await manager.executeNodeInWorkspace('ws-1', 'a', { cascadeEnabled: true });
    expect(executeSpy).toHaveBeenCalledTimes(1);

    await manager.executeNodeInWorkspace('ws-1', 'b', { cascadeEnabled: true });
    expect(executeSpy).toHaveBeenCalledTimes(3);

    const childCall = executeSpy.mock.calls.find((call) => call[0].id === 'c');
    expect(childCall?.[1]).toEqual({ a: 'a-output', b: 'b-output' });
  });
});
