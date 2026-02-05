'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseParamHighlightReturn {
  /** Map of nodeId -> Set of highlighted param names */
  highlightedNodes: Map<string, Set<string>>;
  /** Trigger highlight animation for specific params on a node */
  triggerHighlight: (nodeId: string, params: string[]) => void;
  /** Clear highlight for a specific node */
  clearHighlight: (nodeId: string) => void;
  /** Clear all highlights */
  clearAllHighlights: () => void;
}

interface HighlightEntry {
  params: Set<string>;
  timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_HIGHLIGHT_DURATION = 3000; // 3 seconds

export function useParamHighlight(
  duration: number = DEFAULT_HIGHLIGHT_DURATION
): UseParamHighlightReturn {
  const [highlightedNodes, setHighlightedNodes] = useState<Map<string, Set<string>>>(
    () => new Map()
  );

  // Track timeout IDs for cleanup
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutsRef.current.clear();
    };
  }, []);

  const triggerHighlight = useCallback(
    (nodeId: string, params: string[]) => {
      if (params.length === 0) return;

      // Clear existing timeout for this node if any
      const existingTimeout = timeoutsRef.current.get(nodeId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Add highlight
      setHighlightedNodes((prev) => {
        const next = new Map(prev);
        const existingParams = next.get(nodeId) || new Set<string>();
        const newParams = new Set<string>([...Array.from(existingParams), ...params]);
        next.set(nodeId, newParams);
        return next;
      });

      // Set timeout to clear highlight
      const timeoutId = setTimeout(() => {
        setHighlightedNodes((prev) => {
          const next = new Map(prev);
          next.delete(nodeId);
          return next;
        });
        timeoutsRef.current.delete(nodeId);
      }, duration);

      timeoutsRef.current.set(nodeId, timeoutId);
    },
    [duration]
  );

  const clearHighlight = useCallback((nodeId: string) => {
    // Clear timeout
    const timeoutId = timeoutsRef.current.get(nodeId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutsRef.current.delete(nodeId);
    }

    // Remove from state
    setHighlightedNodes((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const clearAllHighlights = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutsRef.current.clear();

    // Clear state
    setHighlightedNodes(new Map());
  }, []);

  return {
    highlightedNodes,
    triggerHighlight,
    clearHighlight,
    clearAllHighlights,
  };
}
