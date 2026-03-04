import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, CANVAS_WIDTH, CANVAS_HEIGHT } from '../types';
import type { DragState, ContextMenuPosition } from '../types';
import type { WorkspaceNode } from '@/types';

interface UseCanvasInteractionOptions {
  zoom: number;
  setZoom: (zoom: number) => void;
  setNodesDirty: (updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => void;
}

interface UseCanvasInteractionReturn {
  scrollRef: React.RefObject<HTMLDivElement>;
  dragging: DragState;
  connectingFrom: string | null;
  cursorPos: { x: number; y: number } | null;
  contextMenu: ContextMenuPosition | null;
  
  // Canvas helpers
  getCanvasPoint: (event: PointerEvent | MouseEvent | React.PointerEvent<Element> | React.MouseEvent<Element>) => { x: number; y: number };
  
  // Drag handlers
  startDrag: (event: React.PointerEvent, node: WorkspaceNode) => void;
  
  // Connection handlers
  setConnectingFrom: (nodeId: string | null) => void;
  setCursorPos: (pos: { x: number; y: number } | null) => void;
  
  // Context menu
  setContextMenu: (pos: ContextMenuPosition | null) => void;
  handleCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  
  // Zoom handlers
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomFit: () => void;
  handleCanvasWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  clampZoom: (value: number) => number;
}

export function useCanvasInteraction({
  zoom,
  setZoom,
  setNodesDirty,
}: UseCanvasInteractionOptions): UseCanvasInteractionReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const getCanvasPoint = useCallback(
    (event: PointerEvent | MouseEvent | React.PointerEvent<Element> | React.MouseEvent<Element>) => {
      const container = scrollRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left + container.scrollLeft) / zoom;
      const y = (event.clientY - rect.top + container.scrollTop) / zoom;
      return { x, y };
    },
    [zoom]
  );

  const startDrag = useCallback(
    (event: React.PointerEvent, node: WorkspaceNode) => {
      if (event.button !== 0) return;
      const point = getCanvasPoint(event);
      setDragging({
        id: node.id,
        offsetX: point.x - node.position.x,
        offsetY: point.y - node.position.y,
      });
      setContextMenu(null);
    },
    [getCanvasPoint]
  );

  // Handle pointer move and up
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragging) {
        const point = getCanvasPoint(event);
        setNodesDirty((prev) =>
          prev.map((node) =>
            node.id === dragging.id
              ? {
                  ...node,
                  position: {
                    x: Math.max(0, point.x - dragging.offsetX),
                    y: Math.max(0, point.y - dragging.offsetY),
                  },
                }
              : node
          )
        );
      }
      if (connectingFrom) {
        setCursorPos(getCanvasPoint(event));
      }
    };
    
    const handleUp = () => {
      setDragging(null);
      setCursorPos(null);
    };
    
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [connectingFrom, dragging, getCanvasPoint, setNodesDirty]);

  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const point = getCanvasPoint(event);
      setContextMenu(point);
    },
    [getCanvasPoint]
  );

  const clampZoom = useCallback((value: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(clampZoom(zoom + ZOOM_STEP));
  }, [zoom, setZoom, clampZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(clampZoom(zoom - ZOOM_STEP));
  }, [zoom, setZoom, clampZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  const handleZoomFit = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const padding = 80;
    const nextZoom = clampZoom(
      Math.min(
        (container.clientWidth - padding) / CANVAS_WIDTH,
        (container.clientHeight - padding) / CANVAS_HEIGHT
      )
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const scrollLeft = Math.max(0, (CANVAS_WIDTH * nextZoom - container.clientWidth) / 2);
        const scrollTop = Math.max(0, (CANVAS_HEIGHT * nextZoom - container.clientHeight) / 2);
        scrollRef.current.scrollLeft = scrollLeft;
        scrollRef.current.scrollTop = scrollTop;
      });
    });
  }, [setZoom, clampZoom]);

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.altKey) return;
      event.preventDefault();
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const canvasX = (container.scrollLeft + offsetX) / zoom;
      const canvasY = (container.scrollTop + offsetY) / zoom;
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = clampZoom(zoom + delta);
      if (nextZoom === zoom) return;
      container.scrollLeft = canvasX * nextZoom - offsetX;
      container.scrollTop = canvasY * nextZoom - offsetY;
      setZoom(nextZoom);
    },
    [zoom, setZoom, clampZoom]
  );

  return {
    scrollRef,
    dragging,
    connectingFrom,
    cursorPos,
    contextMenu,
    getCanvasPoint,
    startDrag,
    setConnectingFrom,
    setCursorPos,
    setContextMenu,
    handleCanvasContextMenu,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleZoomFit,
    handleCanvasWheel,
    clampZoom,
  };
}
