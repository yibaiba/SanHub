'use client';

import {
  Loader2,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Save,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkspaceToolbarProps {
  workspaceName: string;
  onNameChange: (name: string) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomReset: () => void;
  // 批量执行相关
  onExecuteAll?: () => void;
  onStopAll?: () => void;
  onRetryAllFailed?: () => void;
  isExecuting?: boolean;
  pendingCount?: number;
  runningCount?: number;
  failedCount?: number;
  completedCount?: number;
  // 时间和成本估算
  timeDisplay?: string;
  costDisplay?: string;
}

export function WorkspaceToolbar({
  workspaceName,
  onNameChange,
  dirty,
  saving,
  onSave,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomReset,
  onExecuteAll,
  onStopAll,
  onRetryAllFailed,
  isExecuting = false,
  pendingCount = 0,
  runningCount = 0,
  failedCount = 0,
  completedCount = 0,
  timeDisplay,
  costDisplay,
}: WorkspaceToolbarProps) {
  const hasNodes = pendingCount > 0 || runningCount > 0 || failedCount > 0 || completedCount > 0;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex flex-col gap-2">
          <input
            value={workspaceName}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-2xl font-light text-foreground bg-transparent border border-border/70 rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* 批量执行按钮组 */}
          {hasNodes && (
            <div className="flex items-center gap-2 mr-4">
              {/* 执行全部 / 停止 */}
              {isExecuting ? (
                <button
                  onClick={onStopAll}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                >
                  <Square className="w-4 h-4" />
                  停止
                  {runningCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500/30 rounded">
                      {runningCount}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={onExecuteAll}
                  disabled={pendingCount === 0 && failedCount === 0}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                    pendingCount > 0 || failedCount > 0
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                      : 'bg-card/70 text-foreground/40 cursor-not-allowed border border-border/50'
                  )}
                >
                  <Play className="w-4 h-4" />
                  执行全部
                  {pendingCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-500/30 rounded">
                      {pendingCount}
                    </span>
                  )}
                </button>
              )}

              {/* 重试失败 */}
              {failedCount > 0 && !isExecuting && (
                <button
                  onClick={onRetryAllFailed}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  重试失败
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500/30 rounded">
                    {failedCount}
                  </span>
                </button>
              )}

              {/* 状态统计 */}
              <div className="flex items-center gap-2 text-xs text-foreground/50 border-l border-border/50 pl-3 ml-1">
                {completedCount > 0 && (
                  <span className="text-green-400">✓ {completedCount}</span>
                )}
                {runningCount > 0 && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {runningCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="text-foreground/40">待执行 {pendingCount}</span>
                )}
                {failedCount > 0 && (
                  <span className="text-red-400">✗ {failedCount}</span>
                )}
              </div>

              {/* 预估时间和成本 */}
              {(timeDisplay || costDisplay) && (
                <div className="flex items-center gap-2 text-xs text-foreground/40 border-l border-border/50 pl-3">
                  {timeDisplay && <span>⏱ {timeDisplay}</span>}
                  {costDisplay && <span>💰 {costDisplay}</span>}
                </div>
              )}
            </div>
          )}

          {/* 保存按钮 */}
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition shrink-0',
              dirty
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-card/70 text-foreground/40 cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {/* Canvas toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/70 text-foreground/60 text-sm">
        <div className="flex items-center gap-3">
          <MousePointer2 className="w-4 h-4" />
          右键添加节点，拖拽布局，点击节点右侧圆点开始连线（Alt/Option + 滚轮缩放）
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onZoomOut}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-14 text-center text-xs text-foreground/50">{Math.round(zoom * 100)}%</div>
          <button
            onClick={onZoomIn}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={onZoomFit}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="适配视图"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onZoomReset}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="还原缩放"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
