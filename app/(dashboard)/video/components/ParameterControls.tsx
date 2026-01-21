'use client';

import { cn } from '@/lib/utils';
import type { SafeVideoModel } from '@/types';

interface ParameterControlsProps {
  model: SafeVideoModel | undefined;
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  duration: string;
  onDurationChange: (duration: string) => void;
}

export function ParameterControls({
  model,
  aspectRatio,
  onAspectRatioChange,
  duration,
  onDurationChange,
}: ParameterControlsProps) {
  if (!model) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          画面比例
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[...model.aspectRatios]
            .sort((a, b) => {
              // landscape first, then portrait
              if (a.value === 'landscape') return -1;
              if (b.value === 'landscape') return 1;
              if (a.value === 'portrait') return -1;
              if (b.value === 'portrait') return 1;
              return 0;
            })
            .map((r) => (
              <button
                key={r.value}
                onClick={() => onAspectRatioChange(r.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                  aspectRatio === r.value
                    ? 'bg-foreground text-background border-white'
                    : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                )}
              >
                <span className="text-sm">
                  {r.value === 'landscape' ? '▬' : '▮'}
                </span>
                <span className="text-xs font-medium">{r.label}</span>
              </button>
            ))}
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          视频时长
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {model.durations.map((d) => (
            <button
              key={d.value}
              onClick={() => onDurationChange(d.value)}
              className={cn(
                'px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                duration === d.value
                  ? 'bg-foreground text-background border-white'
                  : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
