'use client';

import React from 'react';
import type { SafeVideoModel, CharacterCard } from '@/types';
import ModeSelector from '@/app/(dashboard)/video/components/ModeSelector';
import ModelSelector from '@/app/(dashboard)/video/components/ModelSelector';
import { ParameterControls } from '@/app/(dashboard)/video/components/ParameterControls';
import { ReferenceImageUploader } from '@/app/(dashboard)/video/components/ReferenceImageUploader';
import { PromptInput } from '@/app/(dashboard)/video/components/PromptInput';
import { StyleSelector } from '@/app/(dashboard)/video/components/StyleSelector';
import { RemixInput } from '@/app/(dashboard)/video/components/RemixInput';
import { StoryboardInput } from '@/app/(dashboard)/video/components/StoryboardInput';
import { GenerateButtons } from '@/app/(dashboard)/video/components/GenerateButtons';

type VideoEngine = 'sora' | 'veo';
type CreationMode = 'normal' | 'remix' | 'storyboard';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

interface VideoStyle {
  id: string;
  name: string;
  image: string;
}

interface VideoInputPanelProps {
  // Engine & Mode
  engine: VideoEngine;
  mode: CreationMode | Veo3Mode;
  onModeChange: (mode: CreationMode | Veo3Mode) => void;
  
  // Models
  models: SafeVideoModel[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  
  // Parameters
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  duration: string;
  onDurationChange: (duration: string) => void;
  
  // Content - Normal/T2V/I2V/R2V
  prompt: string;
  onPromptChange: (prompt: string) => void;
  
  // Files
  files: FileData[];
  onFilesChange: (files: FileData[]) => void;
  maxImages: number;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDrop: (e: React.DragEvent) => Promise<void>;
  
  // Style (Sora normal mode only)
  selectedStyle: string | null;
  onStyleChange: (style: string | null) => void;
  styles: VideoStyle[];
  
  // Remix (Sora remix mode only)
  remixUrl: string;
  onRemixUrlChange: (url: string) => void;
  remixPrompt: string;
  onRemixPromptChange: (prompt: string) => void;
  
  // Storyboard (Sora storyboard mode only)
  storyboardPrompt: string;
  onStoryboardPromptChange: (prompt: string) => void;
  
  // Actions
  onGenerate: () => void;
  onGachaMode: () => void;
  onEnhancePrompt: () => void;
  
  // UI State
  submitting: boolean;
  enhancing: boolean;
  error: string;
  keepPrompt: boolean;
  onKeepPromptChange: (keep: boolean) => void;
  keepImages: boolean;
  onKeepImagesChange: (keep: boolean) => void;
  
  // Daily Limit
  isLimitReached?: boolean;
  limitWarning?: string;
  
  // Character Cards (Sora only)
  characterCards?: CharacterCard[];
  onAddCharacter?: (name: string) => void;
}

export function VideoInputPanel({
  engine,
  mode,
  onModeChange,
  models,
  selectedModelId,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  duration,
  onDurationChange,
  prompt,
  onPromptChange,
  files,
  onFilesChange,
  maxImages,
  onFileUpload,
  onDrop,
  selectedStyle,
  onStyleChange,
  styles,
  remixUrl,
  onRemixUrlChange,
  remixPrompt,
  onRemixPromptChange,
  storyboardPrompt,
  onStoryboardPromptChange,
  onGenerate,
  onGachaMode,
  onEnhancePrompt,
  submitting,
  enhancing,
  error,
  keepPrompt,
  onKeepPromptChange,
  keepImages,
  onKeepImagesChange,
  characterCards,
  onAddCharacter,
  isLimitReached = false,
  limitWarning,
}: VideoInputPanelProps) {
  const selectedModel = models.find((m) => m.id === selectedModelId);

  // Determine if we should show reference image uploader
  const showImageUploader = engine === 'veo' && (mode === 'i2v' || mode === 'r2v');

  // Determine which mode-specific component to show
  const isSoraNormal = engine === 'sora' && mode === 'normal';
  const isSoraRemix = engine === 'sora' && mode === 'remix';
  const isSoraStoryboard = engine === 'sora' && mode === 'storyboard';

  return (
    <div className="flex flex-col h-full">
      {/* Card with gradient header */}
      <div className="flex-1 flex flex-col bg-card/50 backdrop-blur-md border border-border/60 rounded-xl overflow-hidden shadow-lg shadow-black/5">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-sky-500/10 via-emerald-500/10 to-purple-500/10 border-b border-border/50 px-6 py-5">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">创作参数</h2>
          <p className="text-xs text-foreground/50 mt-1">Configure your video generation</p>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 transition-all duration-300">
          {/* Mode Selector */}
          <div className="animate-in fade-in slide-in-from-top-1 duration-300">
            <ModeSelector engine={engine} mode={mode} onChange={onModeChange} />
          </div>

          {/* Model Selector */}
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 delay-75">
            <ModelSelector
              models={models}
              selectedId={selectedModelId}
              onChange={onModelChange}
            />
          </div>

          {/* Parameter Controls */}
          <div className="animate-in fade-in slide-in-from-top-3 duration-300 delay-150">
            <ParameterControls
              model={selectedModel}
              aspectRatio={aspectRatio}
              onAspectRatioChange={onAspectRatioChange}
              duration={duration}
              onDurationChange={onDurationChange}
            />
          </div>

          {/* Reference Image Uploader (Veo I2V/R2V only) */}
          {showImageUploader && (() => {
            const uploaderProps = {
              engine,
              mode: mode as Veo3Mode,
              files,
              onChange: onFilesChange,
              maxImages,
              onFileUpload,
              onDrop,
            };
            return <ReferenceImageUploader {...uploaderProps as any} />;
          })()}

          {/* Mode-Specific Components */}
          {isSoraNormal && (
            <>
              {/* Style Selector */}
              <StyleSelector
                selectedStyle={selectedStyle}
                onChange={onStyleChange}
                styles={styles}
              />

              {/* Prompt Input */}
              <PromptInput
                value={prompt}
                onChange={onPromptChange}
                onEnhance={onEnhancePrompt}
                enhancing={enhancing}
                characterCards={characterCards}
                onAddCharacter={onAddCharacter}
              />
            </>
          )}

          {isSoraRemix && (
            <RemixInput
              url={remixUrl}
              onUrlChange={onRemixUrlChange}
              prompt={remixPrompt}
              onPromptChange={onRemixPromptChange}
              onEnhance={onEnhancePrompt}
              enhancing={enhancing}
            />
          )}

          {isSoraStoryboard && (
            <StoryboardInput
              value={storyboardPrompt}
              onChange={onStoryboardPromptChange}
              onEnhance={onEnhancePrompt}
              enhancing={enhancing}
            />
          )}

          {/* Default Prompt Input (Veo modes) */}
          {engine === 'veo' && (
            <PromptInput
              value={prompt}
              onChange={onPromptChange}
              onEnhance={onEnhancePrompt}
              enhancing={enhancing}
              placeholder="描述你想要生成的视频内容..."
              label="视频描述"
              showEnhance={true}
            />
          )}
        </div>

        {/* Fixed Action Buttons at Bottom */}
        <div className="border-t border-border/50 px-6 py-5 bg-card/70 backdrop-blur-sm">
          <GenerateButtons
            onGenerate={onGenerate}
            onGachaMode={onGachaMode}
            submitting={submitting}
            disabled={false}
            keepPrompt={keepPrompt}
            onKeepPromptChange={onKeepPromptChange}
            keepImages={keepImages}
            onKeepImagesChange={onKeepImagesChange}
            error={error}
            isLimitReached={isLimitReached}
            limitWarning={limitWarning}
          />
        </div>
      </div>
    </div>
  );
}
