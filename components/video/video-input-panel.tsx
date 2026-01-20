'use client';

import { useState } from 'react';
import { Upload, Sparkles, Loader2, AlertCircle, Dices, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SafeVideoModel } from '@/types';

interface VideoInputPanelProps {
  videoEngine: 'sora' | 'veo';
  availableModels: SafeVideoModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  files: Array<{ file: File; preview: string }>;
  onFilesChange: (files: Array<{ file: File; preview: string }>) => void;
  submitting: boolean;
  compressing: boolean;
  error: string;
  onGenerate: () => void;
  onGachaMode: () => void;
  disabled?: boolean;
}

export function VideoInputPanel({
  videoEngine,
  availableModels,
  selectedModelId,
  onModelChange,
  prompt,
  onPromptChange,
  files,
  onFilesChange,
  submitting,
  compressing,
  error,
  onGenerate,
  onGachaMode,
  disabled = false,
}: VideoInputPanelProps) {
  const [creationMode, setCreationMode] = useState<'normal' | 'remix' | 'storyboard'>('normal');
  
  const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles = selectedFiles
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
      }));
    onFilesChange([...files, ...newFiles]);
    e.target.value = '';
  };

  const clearFiles = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    onFilesChange([]);
  };

  return (
    <div className={cn(
      "surface shrink-0",
      disabled && "opacity-50 pointer-events-none"
    )}>
      <div className="p-4">
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-3 border-b border-border/50 pb-2">
          <button
            onClick={() => setCreationMode('normal')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              creationMode === 'normal'
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:text-foreground/80'
            )}
          >
            普通生成
          </button>
          <button
            onClick={() => setCreationMode('remix')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              creationMode === 'remix'
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:text-foreground/80'
            )}
          >
            视频Remix
          </button>
          <button
            onClick={() => setCreationMode('storyboard')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              creationMode === 'storyboard'
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:text-foreground/80'
            )}
          >
            视频分镜
          </button>
        </div>

        {/* Input row */}
        <div className="flex gap-3 mb-3">
          {creationMode === 'normal' && (
            <label className="w-16 h-16 shrink-0 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:border-border hover:bg-card/60">
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*"
                onChange={handleFileUpload}
              />
              {files.length > 0 ? (
                <div className="relative w-full h-full">
                  <img src={files[0].preview} alt="" className="w-full h-full object-cover rounded-md" />
                  {files.length > 1 && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                      +{files.length - 1}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      clearFiles();
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-foreground/40 mb-0.5" />
                  <span className="text-[9px] text-foreground/40">参考图</span>
                </>
              )}
            </label>
          )}

          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={
              creationMode === 'remix' 
                ? '输入视频分享链接或ID (如 s_xxx)' 
                : creationMode === 'storyboard'
                ? '[5.0s]猫猫从飞机上跳伞\n[5.0s]猫猫降落'
                : '描述视频动态，或拖入图片生成图生视频...'
            }
            className="flex-1 h-16 px-3 py-2 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none text-sm focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedModelId}
              onChange={(e) => onModelChange(e.target.value)}
              className="appearance-none px-3 py-1.5 pr-8 bg-card/60 border border-border/70 rounded-lg text-xs text-foreground cursor-pointer hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/50 pointer-events-none" />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={onGachaMode}
            disabled={submitting || compressing}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
              submitting || compressing
                ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
            )}
          >
            {compressing || submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Dices className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onGenerate}
            disabled={submitting || compressing}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-lg font-medium text-sm transition-all',
              submitting || compressing
                ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:opacity-90'
            )}
          >
            {submitting || compressing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{compressing ? '处理中' : '提交中'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>立即生成</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
