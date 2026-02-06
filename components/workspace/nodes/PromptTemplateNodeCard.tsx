'use client';

import { useCallback } from 'react';
import { FileText, ChevronDown, Copy, Check, Edit3, List } from 'lucide-react';
import { BaseNodeCard } from './BaseNodeCard';
import type { WorkspaceNode } from '@/types';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

interface PromptTemplateNodeCardProps {
  node: WorkspaceNode;
  templates: PromptTemplate[];
  isSelected: boolean;
  isDragging?: boolean;
  zoom?: number;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onUpdateData: (data: Partial<WorkspaceNode['data']>) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onConnectStart?: () => void;
}

export function PromptTemplateNodeCard({
  node,
  templates,
  isSelected,
  isDragging,
  zoom,
  onSelect,
  onDelete,
  onDuplicate,
  onRun,
  onStop,
  onRetry,
  onUpdateData,
  onDragStart,
  onConnectStart,
}: PromptTemplateNodeCardProps) {
  // 自定义模式：templateId 为 '__custom__' 时启用
  const isCustomMode = node.data.templateId === '__custom__';
  const selectedTemplate = !isCustomMode
    ? templates.find((t) => t.id === node.data.templateId)
    : null;

  const handleModeChange = useCallback(
    (mode: 'template' | 'custom') => {
      if (mode === 'custom') {
        onUpdateData({
          templateId: '__custom__',
          templateOutput: node.data.templateOutput || '',
          status: node.data.templateOutput ? 'completed' : 'idle',
        });
      } else {
        onUpdateData({
          templateId: '',
          templateOutput: '',
          status: 'idle',
        });
      }
    },
    [node.data.templateOutput, onUpdateData]
  );

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      onUpdateData({
        templateId,
        templateOutput: template?.content || '',
        status: template ? 'completed' : 'idle',
      });
    },
    [templates, onUpdateData]
  );

  const handleCustomPromptChange = useCallback(
    (value: string) => {
      onUpdateData({
        templateOutput: value,
        status: value.trim() ? 'completed' : 'idle',
      });
    },
    [onUpdateData]
  );

  const handleCopyOutput = useCallback(() => {
    if (node.data.templateOutput) {
      navigator.clipboard.writeText(node.data.templateOutput);
    }
  }, [node.data.templateOutput]);

  return (
    <BaseNodeCard
      node={node}
      title={node.name || '提示词'}
      icon={<FileText className="w-4 h-4" />}
      iconColor="text-amber-400"
      isSelected={isSelected}
      isDragging={isDragging}
      zoom={zoom}
      onSelect={onSelect}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onRun={onRun}
      onStop={onStop}
      onRetry={onRetry}
      onDragStart={onDragStart}
      onConnectStart={onConnectStart}
    >
      {/* Mode Toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => handleModeChange('template')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition ${
            !isCustomMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-card/40 text-foreground/50 border border-border/50 hover:text-foreground/70'
          }`}
        >
          <List className="w-3 h-3" />
          预设模板
        </button>
        <button
          onClick={() => handleModeChange('custom')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition ${
            isCustomMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-card/40 text-foreground/50 border border-border/50 hover:text-foreground/70'
          }`}
        >
          <Edit3 className="w-3 h-3" />
          自定义
        </button>
      </div>

      {/* Template Mode: Selector */}
      {!isCustomMode && (
        <>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
              选择模板
            </label>
            <div className="relative">
              <select
                value={node.data.templateId || ''}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
              >
                <option value="" className="bg-card/95">
                  -- 选择模板 --
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id} className="bg-card/95">
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                  模板内容
                </label>
                <button
                  onClick={handleCopyOutput}
                  className="text-foreground/40 hover:text-foreground transition p-1"
                  title="复制内容"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-32 overflow-auto whitespace-pre-wrap border border-border/50">
                {selectedTemplate.content.slice(0, 500)}
                {selectedTemplate.content.length > 500 && '...'}
              </div>
            </div>
          )}
        </>
      )}

      {/* Custom Mode: Editable Textarea */}
      {isCustomMode && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
              自定义提示词
            </label>
            {node.data.templateOutput && (
              <button
                onClick={handleCopyOutput}
                className="text-foreground/40 hover:text-foreground transition p-1"
                title="复制内容"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
          <textarea
            value={node.data.templateOutput || ''}
            onChange={(e) => handleCustomPromptChange(e.target.value)}
            placeholder="输入提示词，连接到视频/图片节点后自动使用..."
            className="w-full h-28 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
          />
        </div>
      )}

      {/* Status Indicator */}
      {node.data.templateOutput && node.data.status === 'completed' && (
        <div className="flex items-center gap-1 text-[10px] text-green-400">
          <Check className="w-3 h-3" />
          {isCustomMode ? '提示词已就绪' : '模板已加载'}
        </div>
      )}
    </BaseNodeCard>
  );
}
