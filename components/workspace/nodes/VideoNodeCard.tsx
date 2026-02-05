'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Video, ChevronDown, Upload, X, Image as ImageIcon, FileText } from 'lucide-react';
import { BaseNodeCard } from './BaseNodeCard';
import { ParamHighlight } from '../ui';
import type { WorkspaceNode, SafeVideoModel } from '@/types';

interface VideoNodeCardProps {
  node: WorkspaceNode;
  videoModels: SafeVideoModel[];
  isSelected: boolean;
  isDragging?: boolean;
  zoom?: number;
  highlightedParams?: Set<string>;
  referenceImageUrl?: string;
  hasImageInput?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onUpdateData: (data: Partial<WorkspaceNode['data']>) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onConnectStart?: () => void;
  onUploadImage?: (files: FileList) => void;
}

export function VideoNodeCard({
  node,
  videoModels,
  isSelected,
  isDragging,
  zoom,
  highlightedParams,
  referenceImageUrl,
  hasImageInput = false,
  onSelect,
  onDelete,
  onDuplicate,
  onRun,
  onStop,
  onRetry,
  onUpdateData,
  onDragStart,
  onConnectStart,
  onUploadImage,
}: VideoNodeCardProps) {
  const model = videoModels.find((m) => m.id === node.data.modelId) || videoModels[0];

  const handleModelChange = useCallback(
    (modelId: string) => {
      const nextModel = videoModels.find((m) => m.id === modelId) || videoModels[0];
      onUpdateData({
        modelId,
        aspectRatio: nextModel?.defaultAspectRatio || 'landscape',
        duration: nextModel?.defaultDuration || '10s',
      });
    },
    [videoModels, onUpdateData]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && onUploadImage) {
        onUploadImage(e.target.files);
      }
    },
    [onUploadImage]
  );

  const isAspectRatioHighlighted = highlightedParams?.has('aspectRatio');
  const isDurationHighlighted = highlightedParams?.has('duration');

  // 检测模式：图生视频 vs 文生视频
  const isImageToVideo = hasImageInput || (node.data.uploadedImages && node.data.uploadedImages.length > 0);

  return (
    <BaseNodeCard
      node={node}
      title={node.name || '视频生成'}
      icon={<Video className="w-4 h-4" />}
      iconColor="text-blue-400"
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
            value={node.data.modelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
          >
            {videoModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-card/95">
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Mode Indicator */}
      <div className="flex items-center gap-2 text-[10px] bg-card/40 px-2 py-1.5 rounded-lg border border-border/50">
        {isImageToVideo ? (
          <span className="text-blue-400 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> 图生视频模式 (Image-to-Video)
          </span>
        ) : (
          <span className="text-foreground/60 flex items-center gap-1">
            <FileText className="w-3 h-3" /> 文生视频模式 (Text-to-Video)
          </span>
        )}
      </div>

      {/* Aspect Ratio & Duration */}
      <div className="grid grid-cols-2 gap-2">
        <ParamHighlight highlight={!!isAspectRatioHighlighted}>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
              比例
            </label>
            <select
              value={node.data.aspectRatio || 'landscape'}
              onChange={(e) => onUpdateData({ aspectRatio: e.target.value })}
              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
            >
              {model?.aspectRatios?.map((ratio: { value: string; label: string }) => (
                <option key={ratio.value} value={ratio.value} className="bg-card/95">
                  {ratio.label}
                </option>
              ))}
            </select>
          </div>
        </ParamHighlight>

        <ParamHighlight highlight={!!isDurationHighlighted}>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
              时长
            </label>
            <select
              value={node.data.duration || model?.defaultDuration || '10s'}
              onChange={(e) => onUpdateData({ duration: e.target.value })}
              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
            >
              {model?.durations?.map((duration: { value: string; label: string }) => (
                <option key={duration.value} value={duration.value} className="bg-card/95">
                  {duration.label}
                </option>
              ))}
            </select>
          </div>
        </ParamHighlight>
      </div>

      {/* Reference Image Preview */}
      {referenceImageUrl && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            参考图
          </label>
          <div className="relative w-16 h-16">
            <img
              src={referenceImageUrl}
              alt="Reference"
              className="w-full h-full rounded-lg object-cover border border-border/70"
            />
          </div>
        </div>
      )}

      {/* Upload Reference Image - only when no connected image node */}
      {!hasImageInput && (() => {
        // Veo 模型: i2v=2张, r2v=3张; Sora 模型: 1张
        // 通过模型名称或 channelType 识别 Veo 模型
        const isVeoModel = model?.channelType === 'gemini' ||
          model?.name?.toLowerCase().includes('veo');
        const maxImages = model?.features?.maxReferenceImages ??
          (isVeoModel ? 2 : 1);
        const currentImages = node.data.uploadedImages || [];
        return (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            参考图 ({maxImages === 1 ? '1张' : `最多${maxImages}张`})
          </label>
          <div className="flex flex-wrap gap-1">
            {currentImages.slice(0, maxImages).map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img}
                  alt=""
                  className="w-12 h-12 rounded object-cover border border-border/70"
                />
                <button
                  onClick={() => onUpdateData({
                    uploadedImages: currentImages.filter((_, i) => i !== idx)
                  })}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {currentImages.length < maxImages && (
              <label className="w-12 h-12 border border-dashed border-border/70 rounded flex items-center justify-center cursor-pointer hover:border-foreground/50 transition">
                <Upload className="w-4 h-4 text-foreground/40" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            )}
          </div>
        </div>
        );
      })()}

      {/* Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
          提示词
        </label>
        <textarea
          value={node.data.prompt || ''}
          onChange={(e) => onUpdateData({ prompt: e.target.value })}
          className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
          placeholder="描述视频内容和运动效果..."
        />
      </div>

      {/* Output Preview */}
      {node.data.outputUrl && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            生成结果
          </label>
          <div className="relative rounded-lg overflow-hidden border border-border/70">
            <video
              src={node.data.outputUrl}
              controls
              className="w-full h-auto max-h-48 bg-black/20"
            />
          </div>
        </div>
      )}
    </BaseNodeCard>
  );
}
