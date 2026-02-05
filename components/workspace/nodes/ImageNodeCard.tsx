'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, ChevronDown, Upload, X } from 'lucide-react';
import { BaseNodeCard } from './BaseNodeCard';
import { ParamHighlight } from '../ui';
import type { WorkspaceNode, SafeImageModel } from '@/types';

interface ImageNodeCardProps {
  node: WorkspaceNode;
  imageModels: SafeImageModel[];
  isSelected: boolean;
  isDragging?: boolean;
  zoom?: number;
  highlightedParams?: Set<string>;
  referenceImageUrl?: string;
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

export function ImageNodeCard({
  node,
  imageModels,
  isSelected,
  isDragging,
  zoom,
  highlightedParams,
  referenceImageUrl,
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
}: ImageNodeCardProps) {
  const model = imageModels.find((m) => m.id === node.data.modelId) || imageModels[0];

  const handleModelChange = useCallback(
    (modelId: string) => {
      const nextModel = imageModels.find((m) => m.id === modelId) || imageModels[0];
      const defaultSize =
        nextModel?.defaultImageSize ||
        (nextModel?.imageSizes && nextModel.imageSizes.length > 0
          ? nextModel.imageSizes[0]
          : '1K');

      onUpdateData({
        modelId,
        aspectRatio: nextModel?.defaultAspectRatio || '1:1',
        imageSize: defaultSize,
      });
    },
    [imageModels, onUpdateData]
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

  return (
    <BaseNodeCard
      node={node}
      title={node.name || '图片生成'}
      icon={<ImageIcon className="w-4 h-4" />}
      iconColor="text-purple-400"
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
            {imageModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-card/95">
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Aspect Ratio & Resolution */}
      <div className="grid grid-cols-2 gap-2">
        <ParamHighlight highlight={!!isAspectRatioHighlighted}>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
              比例
            </label>
            <select
              value={node.data.aspectRatio || '1:1'}
              onChange={(e) => onUpdateData({ aspectRatio: e.target.value })}
              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border appearance-none cursor-pointer"
            >
              {model?.aspectRatios?.map((ratio: string) => (
                <option key={ratio} value={ratio} className="bg-card/95">
                  {ratio}
                </option>
              ))}
            </select>
          </div>
        </ParamHighlight>

        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            分辨率
          </label>
          <select
            value={node.data.imageSize || '1K'}
            onChange={(e) => onUpdateData({ imageSize: e.target.value })}
            disabled={!model?.features?.imageSize}
            className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-sm focus:outline-none focus:border-border disabled:opacity-40 appearance-none cursor-pointer"
          >
            {model?.imageSizes?.map((size: string) => (
              <option key={size} value={size} className="bg-card/95">
                {size}
              </option>
            )) || (
              <option value="1K" className="bg-card/95">
                1K
              </option>
            )}
          </select>
        </div>
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

      {/* Upload Reference Image */}
      {model?.features?.imageToImage && !referenceImageUrl && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            参考图 (可选)
          </label>
          <div className="flex flex-wrap gap-1">
            {(node.data.uploadedImages || []).map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img}
                  alt=""
                  className="w-12 h-12 rounded object-cover border border-border/70"
                />
                <button
                  onClick={() =>
                    onUpdateData({
                      uploadedImages: (node.data.uploadedImages || []).filter(
                        (_, i) => i !== idx
                      ),
                    })
                  }
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {(node.data.uploadedImages?.length || 0) < (model.features.multipleImages ? 4 : 1) && (
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
      )}

      {/* Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
          提示词
        </label>
        <textarea
          value={node.data.prompt || ''}
          onChange={(e) => onUpdateData({ prompt: e.target.value })}
          className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
          placeholder="描述你想生成的图片..."
        />
      </div>

      {/* Output Preview */}
      {node.data.outputUrl && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-foreground/40">
            生成结果
          </label>
          <div className="relative rounded-lg overflow-hidden border border-border/70">
            <img
              src={node.data.outputUrl}
              alt="Generated"
              className="w-full h-auto max-h-48 object-contain bg-black/20"
            />
          </div>
        </div>
      )}
    </BaseNodeCard>
  );
}
