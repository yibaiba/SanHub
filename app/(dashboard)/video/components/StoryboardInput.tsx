'use client';

import { useRef } from 'react';
import { Film, Wand2, Loader2, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoryboardInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnhance: () => void;
  enhancing: boolean;
  error?: string;
}

export function StoryboardInput({
  value,
  onChange,
  onEnhance,
  enhancing,
  error,
}: StoryboardInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  // Validate storyboard format
  const hasValidFormat = value.includes('[') && value.includes(']');
  const showFormatHint = value.length > 0 && !hasValidFormat;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" />
          Storyboard Script
        </label>
        <button
          type="button"
          onClick={onEnhance}
          disabled={enhancing || !value.trim()}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
            enhancing || !value.trim()
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
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="[5.0s]A cat dancing in the moonlight&#10;[3.0s]The cat jumps onto a table&#10;[4.0s]Close-up of the cat's face"
        rows={6}
        className={cn(
          'w-full px-3 py-2.5 bg-card/60 border rounded-lg',
          'text-sm text-foreground placeholder:text-foreground/40',
          'focus:outline-none focus:ring-2',
          'resize-none transition-all font-mono',
          error
            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
            : showFormatHint
            ? 'border-yellow-500/50 focus:ring-ring/30'
            : 'border-border/70 focus:border-border focus:ring-ring/30'
        )}
      />

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Format Hint */}
      <div className="space-y-2">
        <div className="flex items-start gap-2 p-2.5 bg-sky-500/5 border border-sky-500/20 rounded-lg">
          <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-sky-300/80 space-y-1">
            <p className="font-medium">Format: [duration]description</p>
            <p className="text-sky-300/60">
              Each line represents a shot. Duration must be in format like [5.0s] or [3.5s]
            </p>
          </div>
        </div>

        {showFormatHint && (
          <div className="flex items-start gap-2 p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <Info className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-yellow-300/80">
              Invalid format detected. Please use [duration]description format for each shot.
            </p>
          </div>
        )}

        {/* Example */}
        <div className="p-2.5 bg-card/40 border border-border/50 rounded-lg">
          <p className="text-[10px] text-foreground/50 mb-1.5 font-medium">Example:</p>
          <pre className="text-[10px] text-foreground/60 font-mono leading-relaxed">
            {`[5.0s]A cat dancing in the moonlight
[3.0s]The cat jumps onto a table
[4.0s]Close-up of the cat's face`}
          </pre>
        </div>
      </div>
    </div>
  );
}
