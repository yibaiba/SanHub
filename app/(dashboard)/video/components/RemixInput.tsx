'use client';

import { useRef } from 'react';
import { Link as LinkIcon, Wand2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RemixInputProps {
  url: string;
  onUrlChange: (url: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onEnhance: () => void;
  enhancing: boolean;
  urlError?: string;
  promptError?: string;
}

export function RemixInput({
  url,
  onUrlChange,
  prompt,
  onPromptChange,
  onEnhance,
  enhancing,
  urlError,
  promptError,
}: RemixInputProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(e.target.value);
    // Auto-resize textarea
    if (promptRef.current) {
      promptRef.current.style.height = 'auto';
      promptRef.current.style.height = `${promptRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Video URL Input */}
      <div className="space-y-2">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          Video Share Link or ID
        </label>
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="Paste video share link or ID (e.g., s_abc123...)"
            className={cn(
              'w-full pl-10 pr-3 py-2.5 bg-card/60 border',
              'rounded-lg text-sm text-foreground placeholder:text-foreground/40',
              'focus:outline-none focus:ring-2 focus:border-border',
              'transition-all',
              urlError
                ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
                : 'border-border/70 focus:ring-ring/30'
            )}
          />
        </div>
        {urlError ? (
          <div className="flex items-start gap-1.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{urlError}</span>
          </div>
        ) : (
          <p className="text-[10px] text-foreground/40">
            Enter the video share link or ID to remix
          </p>
        )}
      </div>

      {/* Modification Prompt */}
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground/50 uppercase tracking-wider">
            Modification Description
          </label>
          <button
            type="button"
            onClick={onEnhance}
            disabled={enhancing || !prompt.trim()}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
              enhancing || !prompt.trim()
                ? 'text-foreground/40 cursor-not-allowed'
                : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
            )}
          >
            {enhancing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            <span>Enhance</span>
          </button>
        </div>
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={handlePromptChange}
          placeholder="Describe how you want to modify the video..."
          rows={3}
          className={cn(
            'w-full px-3 py-2.5 bg-card/60 border rounded-lg',
            'text-sm text-foreground placeholder:text-foreground/40',
            'focus:outline-none focus:ring-2 focus:border-border',
            'resize-none transition-all',
            promptError
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
              : 'border-border/70 focus:ring-ring/30'
          )}
        />
        {promptError ? (
          <div className="flex items-start gap-1.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{promptError}</span>
          </div>
        ) : (
          <p className="text-[10px] text-foreground/40">
            Describe the changes you want to make to the original video
          </p>
        )}
      </div>
    </div>
  );
}
