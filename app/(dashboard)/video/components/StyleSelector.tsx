'use client';

import { cn } from '@/lib/utils';

interface VideoStyle {
  id: string;
  name: string;
  image: string;
}

interface StyleSelectorProps {
  selectedStyle: string | null;
  onChange: (style: string | null) => void;
  styles: VideoStyle[];
}

export function StyleSelector({ selectedStyle, onChange, styles }: StyleSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          Video Style
        </label>
        {selectedStyle && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
          >
            Clear Selection
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onChange(selectedStyle === style.id ? null : style.id)}
            className={cn(
              'relative w-20 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0',
              selectedStyle === style.id
                ? 'border-sky-400 ring-2 ring-sky-400/30'
                : 'border-border/70 hover:border-border'
            )}
          >
            <img
              src={style.image}
              alt={style.name}
              className="w-full h-full object-cover"
            />
            <div
              className={cn(
                'absolute inset-0 flex items-end justify-center pb-1.5 bg-gradient-to-t from-black/80 to-transparent',
                selectedStyle === style.id && 'from-sky-900/70'
              )}
            >
              <span className="text-[10px] font-medium text-foreground">
                {style.name}
              </span>
            </div>
            {selectedStyle === style.id && (
              <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-sky-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-2 h-2 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-foreground/40">
        Optional: Select a style to apply to generation
      </p>
    </div>
  );
}
