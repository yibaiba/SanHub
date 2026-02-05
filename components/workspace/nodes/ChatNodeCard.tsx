'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  ChevronDown,
  Send,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Film,
  Image as ImageIcon,
  Link2,
} from 'lucide-react';
import { BaseNodeCard } from './BaseNodeCard';
import type { WorkspaceNode, ChatModel, StoryboardData, WorkspaceEdge } from '@/types';

const CHAT_MAX_LENGTH = 2000;

interface ChatNodeCardProps {
  node: WorkspaceNode;
  chatModels: ChatModel[];
  isSelected: boolean;
  isDragging?: boolean;
  zoom?: number;
  incomingEdges?: WorkspaceEdge[];
  nodes?: WorkspaceNode[];
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onUpdateData: (data: Partial<WorkspaceNode['data']>) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onConnectStart?: () => void;
  onRemoveEdge?: (edgeId: string) => void;
  onExplodeStoryboard?: (storyboardData: StoryboardData) => void;
}

export function ChatNodeCard({
  node,
  chatModels,
  isSelected,
  isDragging,
  zoom,
  incomingEdges = [],
  nodes = [],
  onSelect,
  onDelete,
  onDuplicate,
  onRun,
  onStop,
  onRetry,
  onUpdateData,
  onDragStart,
  onConnectStart,
  onRemoveEdge,
  onExplodeStoryboard,
}: ChatNodeCardProps) {
  const handleModelChange = useCallback(
    (modelId: string) => {
      onUpdateData({ chatModelId: modelId });
    },
    [onUpdateData]
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (e.target.value.length <= CHAT_MAX_LENGTH) {
        onUpdateData({ prompt: e.target.value });
      }
    },
    [onUpdateData]
  );

  const toggleStoryboardMode = useCallback(() => {
    onUpdateData({
      storyboardMode: !node.data.storyboardMode,
      pureMode: false,
    });
  }, [node.data.storyboardMode, onUpdateData]);

  const togglePureMode = useCallback(() => {
    onUpdateData({
      pureMode: !node.data.pureMode,
      storyboardMode: false,
    });
  }, [node.data.pureMode, onUpdateData]);

  const isRunning = node.data.status === 'pending' || node.data.status === 'processing';

  return (
    <BaseNodeCard
      node={node}
      title={node.name || '聊天节点'}
      icon={<MessageSquare className="w-4 h-4" />}
      iconColor="text-green-400"
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
      {/* Model Selector */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
          模型
        </label>
        <div className="relative">
          <select
            value={node.data.chatModelId || ''}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
          >
            {chatModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-card/95">
                {m.name} {m.supportsVision ? '(支持图片)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Input Images from connections */}
      {incomingEdges.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            <ImageIcon className="w-3 h-3 inline mr-1" />
            输入图片 ({incomingEdges.length})
          </label>
          <div className="flex flex-wrap gap-1">
            {incomingEdges.map((edge) => {
              const fromNode = nodes.find((n) => n.id === edge.from);
              return (
                <span
                  key={edge.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60 text-[10px]"
                >
                  <Link2 className="w-3 h-3" />
                  {fromNode?.name || '节点'}
                  {onRemoveEdge && (
                    <button
                      onClick={() => onRemoveEdge(edge.id)}
                      className="text-foreground/40 hover:text-foreground ml-1"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            提示词
          </label>
          <div className="flex items-center gap-2">
            {/* Storyboard Mode Toggle */}
            <button
              onClick={toggleStoryboardMode}
              className={cn(
                'flex items-center gap-1 text-[10px] transition-colors',
                node.data.storyboardMode
                  ? 'text-blue-400'
                  : 'text-foreground/30 hover:text-foreground/50'
              )}
              title="分镜模式：开启后使用分镜导演系统提示词，生成结构化分镜数据"
            >
              {node.data.storyboardMode ? (
                <ToggleRight className="w-3 h-3" />
              ) : (
                <ToggleLeft className="w-3 h-3" />
              )}
              <Film className="w-3 h-3" />
              分镜
            </button>

            {/* Pure Mode Toggle */}
            <button
              onClick={togglePureMode}
              className={cn(
                'flex items-center gap-1 text-[10px] transition-colors',
                node.data.pureMode
                  ? 'text-green-400'
                  : 'text-foreground/30 hover:text-foreground/50'
              )}
              title="纯净模式：开启后仅输出提示词内容，不包含对话废话"
            >
              {node.data.pureMode ? (
                <ToggleRight className="w-3 h-3" />
              ) : (
                <ToggleLeft className="w-3 h-3" />
              )}
              纯净
            </button>

            <span className="text-[10px] text-foreground/30">
              {(node.data.prompt || '').length}/{CHAT_MAX_LENGTH}
            </span>
          </div>
        </div>
        <textarea
          value={node.data.prompt || ''}
          onChange={handlePromptChange}
          maxLength={CHAT_MAX_LENGTH}
          className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
          placeholder="输入聊天内容..."
        />
      </div>

      {/* Output */}
      {node.data.chatOutput && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            输出
          </label>
          <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-40 overflow-auto whitespace-pre-wrap">
            {node.data.chatOutput}
          </div>
        </div>
      )}
    </BaseNodeCard>
  );
}
