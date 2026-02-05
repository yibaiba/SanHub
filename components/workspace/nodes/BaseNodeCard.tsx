'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Trash2, Copy, GripVertical } from 'lucide-react';
import { NodeStatusBadge, NodeProgressBar, NodeActionButtons } from '../ui';
import type { WorkspaceNode } from '@/types';

export interface BaseNodeCardProps {
  node: WorkspaceNode;
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  isSelected: boolean;
  isDragging?: boolean;
  zoom?: number;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onConnectStart?: () => void;
  children: React.ReactNode;
  className?: string;
}

// 节点尺寸常量
export const NODE_WIDTH = 320;
export const NODE_MIN_HEIGHT = 200;
export const HANDLE_OFFSET_Y = 40;

export function BaseNodeCard({
  node,
  title,
  icon,
  iconColor = 'text-foreground/60',
  isSelected,
  isDragging = false,
  zoom = 1,
  onSelect,
  onDelete,
  onDuplicate,
  onRun,
  onStop,
  onRetry,
  onDragStart,
  onConnectStart,
  children,
  className,
}: BaseNodeCardProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 点击选中
      onSelect();
      // 开始拖拽
      if (onDragStart && e.button === 0) {
        onDragStart(e);
      }
    },
    [onSelect, onDragStart]
  );

  const status = node.data.status || 'idle';
  const progress = node.data.progress ?? 0;
  const progressMessage = node.data.progressMessage || '';
  const errorMessage = node.data.errorMessage;

  const isRunning = status === 'pending' || status === 'processing' || status === 'running';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    <div
      ref={nodeRef}
      data-workspace-node={node.id}
      data-node-type={node.type}
      className={cn(
        'absolute rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg transition-all duration-150',
        'hover:shadow-xl',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isDragging && 'opacity-80 cursor-grabbing',
        isFailed && 'border-red-500/50',
        isCompleted && 'border-green-500/30',
        className
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        minHeight: NODE_MIN_HEIGHT,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Drag Handle */}
          <div className="cursor-grab active:cursor-grabbing text-foreground/30 hover:text-foreground/50">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Icon */}
          <div className={cn('shrink-0', iconColor)}>
            {icon}
          </div>

          {/* Title */}
          <span className="text-sm font-medium text-foreground truncate">
            {title}
          </span>

          {/* Status Badge */}
          <NodeStatusBadge
            status={status as any}
            size="sm"
            onRetry={isFailed ? onRetry : undefined}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 text-foreground/40 hover:text-foreground transition"
            title="复制节点"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-foreground/40 hover:text-red-500 transition"
            title="删除节点"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {children}

        {/* Error Message */}
        {errorMessage && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">
            {errorMessage}
          </div>
        )}

        {/* Progress Bar - 只在运行时显示 */}
        {isRunning && (
          <NodeProgressBar
            progress={progress}
            message={progressMessage}
            size="sm"
          />
        )}
      </div>

      {/* Footer - Action Buttons */}
      <div className="px-3 pb-3">
        <NodeActionButtons
          status={status as any}
          onRun={onRun}
          onStop={onStop}
          onRetry={onRetry || onRun}
          size="md"
          variant="default"
        />
      </div>

      {/* Connection Handles */}
      {/* Input Handle (Left) */}
      {node.type !== 'prompt-template' && (
        <div
          className="absolute w-3 h-3 bg-foreground/20 border-2 border-foreground/40 rounded-full cursor-crosshair hover:bg-primary hover:border-primary transition-colors"
          style={{
            left: -6,
            top: HANDLE_OFFSET_Y,
          }}
          title="输入连接点"
        />
      )}

      {/* Output Handle (Right) */}
      <div
        className="absolute w-3 h-3 bg-foreground/20 border-2 border-foreground/40 rounded-full cursor-crosshair hover:bg-primary hover:border-primary transition-colors"
        style={{
          right: -6,
          top: HANDLE_OFFSET_Y,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onConnectStart?.();
        }}
        title="输出连接点 - 点击开始连接"
      />
    </div>
  );
}
