'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileText, ChevronDown, Copy, Check } from 'lucide-react';
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
  const selectedTemplate = templates.find((t) => t.id === node.data.templateId);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      onUpdateData({
        templateId,
        templateOutput: template?.content || '',
      });
    },
    [templates, onUpdateData]
  );

  const handleCopyOutput = useCallback(() => {
    if (node.data.templateOutput) {
      navigator.clipboard.writeText(node.data.templateOutput);
    }
  }, [node.data.templateOutput]);

  return (
    <BaseNodeCard
      node={node}
      title={node.name || '提示词模板'}
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
      {/* Template Selector */}
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

      {/* Output */}
      {node.data.templateOutput && node.data.status === 'completed' && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-green-400">
            <Check className="w-3 h-3" />
            模板已加载
          </div>
        </div>
      )}
    </BaseNodeCard>
  );
}
