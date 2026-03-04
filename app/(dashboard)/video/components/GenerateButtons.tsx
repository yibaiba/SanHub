'use client';

import { Sparkles, Dices, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerateButtonsProps {
  onGenerate: () => void;
  onGachaMode: () => void;
  submitting: boolean;
  disabled?: boolean;
  keepPrompt: boolean;
  onKeepPromptChange: (keep: boolean) => void;
  keepImages?: boolean;
  onKeepImagesChange?: (keep: boolean) => void;
  error?: string;
  isLimitReached?: boolean;
  limitWarning?: string;
}

export function GenerateButtons({
  onGenerate,
  onGachaMode,
  submitting,
  disabled = false,
  keepPrompt,
  onKeepPromptChange,
  keepImages,
  onKeepImagesChange,
  error,
  isLimitReached = false,
  limitWarning,
}: GenerateButtonsProps) {
  const isDisabled = submitting || disabled || isLimitReached;

  return (
    <div className="space-y-3">
      {/* Limit Warning */}
      {isLimitReached && limitWarning && (
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-300">{limitWarning}</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Keep Options */}
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={keepPrompt}
            onChange={(e) => onKeepPromptChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-2 focus:ring-sky-500/30 cursor-pointer"
          />
          <span className="text-foreground/60 group-hover:text-foreground/80 transition-colors">
            Keep prompt after generation
          </span>
        </label>

        {onKeepImagesChange !== undefined && (
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={keepImages || false}
              onChange={(e) => onKeepImagesChange(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border/70 bg-card/60 text-sky-500 focus:ring-2 focus:ring-sky-500/30 cursor-pointer"
            />
            <span className="text-foreground/60 group-hover:text-foreground/80 transition-colors">
              Keep images after generation
            </span>
          </label>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {/* Primary Generate Button */}
        <button
          onClick={onGenerate}
          disabled={isDisabled}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
            'text-sm font-medium transition-all duration-300 ease-out',
            isDisabled
              ? 'bg-card/40 text-foreground/40 cursor-not-allowed'
              : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:from-sky-600 hover:to-emerald-600 hover:shadow-lg hover:shadow-sky-500/30 active:scale-[0.96] hover:scale-[1.02]'
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
              <span>Start Generation</span>
            </>
          )}
        </button>

        {/* Gacha Mode Button */}
        <button
          onClick={onGachaMode}
          disabled={isDisabled}
          title="Gacha Mode: Submit 3 identical tasks at once for variety"
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
            'text-sm font-medium transition-all duration-300 ease-out group relative',
            isDisabled
              ? 'bg-card/40 text-foreground/40 cursor-not-allowed'
              : 'bg-card/60 border border-border/70 text-foreground/70 hover:bg-card/80 hover:text-foreground hover:border-border hover:shadow-md active:scale-[0.96] hover:scale-[1.02]'
          )}
        >
          <Dices className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
          <span className="hidden sm:inline">Gacha</span>

          {/* Tooltip */}
          {!isDisabled && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              Submit 3 identical tasks for variety
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/90" />
            </div>
          )}
        </button>
      </div>

      {/* Info Text */}
      <p className="text-[10px] text-foreground/40 text-center">
        Gacha mode submits 3 identical tasks to get different results
      </p>
    </div>
  );
}
