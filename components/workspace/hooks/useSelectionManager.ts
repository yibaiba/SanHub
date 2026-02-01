import { useState, useCallback, useEffect, useMemo } from 'react';
import { WorkspaceNode, WorkspaceEdge } from '@/types';

interface UseSelectionManagerProps {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  setNodes: React.Dispatch<React.SetStateAction<WorkspaceNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<WorkspaceEdge[]>>;
}

interface UseSelectionManagerReturn {
  // Selection state
  selectedNodeIds: Set<string>;
  selectedCount: number;
  hasSelection: boolean;

  // Selection actions
  selectNode: (nodeId: string, multi?: boolean) => void;
  selectNodes: (nodeIds: string[]) => void;
  toggleSelection: (nodeId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (nodeId: string) => boolean;

  // Batch operations
  deleteSelectedNodes: () => void;
  duplicateSelectedNodes: () => void;

  // Selection box (for drag selection)
  handleSelectionBox: (nodeIds: string[]) => void;

  // Keyboard handler
  handleKeyDown: (event: KeyboardEvent) => void;
}

// Generate UUID for new nodes
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useSelectionManager({
  nodes,
  edges,
  setNodes,
  setEdges
}: UseSelectionManagerProps): UseSelectionManagerReturn {
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Derived values
  const selectedCount = selectedNodeIds.size;
  const hasSelection = selectedCount > 0;

  // Check if a node is selected
  const isSelected = useCallback(
    (nodeId: string) => selectedNodeIds.has(nodeId),
    [selectedNodeIds]
  );

  // Select a single node (optionally add to selection with multi=true)
  const selectNode = useCallback((nodeId: string, multi = false) => {
    setSelectedNodeIds(prev => {
      if (multi) {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      } else {
        return new Set([nodeId]);
      }
    });
  }, []);

  // Select multiple nodes
  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds(new Set(nodeIds));
  }, []);

  // Toggle selection of a single node
  const toggleSelection = useCallback((nodeId: string) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Select all nodes
  const selectAll = useCallback(() => {
    setSelectedNodeIds(new Set(nodes.map(n => n.id)));
  }, [nodes]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
  }, []);

  // Handle selection box (drag selection)
  const handleSelectionBox = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds(new Set(nodeIds));
  }, []);

  // Delete selected nodes and their connected edges
  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) return;

    // Remove nodes
    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));

    // Remove edges connected to deleted nodes
    setEdges(prev => prev.filter(e =>
      !selectedNodeIds.has(e.from) && !selectedNodeIds.has(e.to)
    ));

    // Clear selection
    setSelectedNodeIds(new Set());
  }, [selectedNodeIds, setNodes, setEdges]);

  // Duplicate selected nodes with their internal edges
  const duplicateSelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) return;

    const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    const idMapping = new Map<string, string>();

    // Create new nodes with offset position
    const newNodes: WorkspaceNode[] = selectedNodes.map(node => {
      const newId = generateId();
      idMapping.set(node.id, newId);

      return {
        ...node,
        id: newId,
        name: `${node.name} (copy)`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50
        },
        data: {
          ...node.data,
          // Reset output-related fields
          status: 'idle' as const,
          outputUrl: undefined,
          outputType: undefined,
          chatOutput: undefined,
          templateOutput: undefined,
          errorMessage: undefined
        }
      };
    });

    // Create edges between duplicated nodes
    const internalEdges = edges.filter(e =>
      selectedNodeIds.has(e.from) && selectedNodeIds.has(e.to)
    );

    const newEdges: WorkspaceEdge[] = internalEdges.map(edge => {
      const newFrom = idMapping.get(edge.from)!;
      const newTo = idMapping.get(edge.to)!;
      return {
        id: `${newFrom}-${newTo}`,
        from: newFrom,
        to: newTo
      };
    });

    // Add new nodes and edges
    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);

    // Select the new nodes
    setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
  }, [selectedNodeIds, nodes, edges, setNodes, setEdges]);

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if focused on input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Ctrl+A: Select all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      selectAll();
      return;
    }

    // Ctrl+D: Duplicate
    if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
      event.preventDefault();
      duplicateSelectedNodes();
      return;
    }

    // Delete/Backspace: Delete selected
    if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
      event.preventDefault();
      deleteSelectedNodes();
      return;
    }

    // Escape: Clear selection
    if (event.key === 'Escape') {
      clearSelection();
      return;
    }
  }, [selectAll, duplicateSelectedNodes, deleteSelectedNodes, clearSelection, hasSelection]);

  // Auto-register keyboard handler
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Clean up selection when nodes are removed externally
  useEffect(() => {
    const nodeIds = new Set(nodes.map(n => n.id));
    setSelectedNodeIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (nodeIds.has(id)) {
          next.add(id);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [nodes]);

  return {
    selectedNodeIds,
    selectedCount,
    hasSelection,
    selectNode,
    selectNodes,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    handleSelectionBox,
    handleKeyDown
  };
}
