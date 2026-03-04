'use client';

import { useRef, useEffect } from 'react';
import { Wand2, Loader2, User, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharacterCard } from '@/types';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnhance: () => void;
  enhancing: boolean;
  characterCards?: CharacterCard[];
  onAddCharacter?: (name: string) => void;
  placeholder?: string;
  label?: string;
  showEnhance?: boolean;
  error?: string;
}

export function PromptInput({
  value,
  onChange,
  onEnhance,
  enhancing,
  characterCards = [],
  onAddCharacter,
  placeholder = '描述你想要生成的内容，越详细效果越好...',
  label = '创作描述',
  showEnhance = true,
  error,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const handleAddCharacter = (characterName: string) => {
    if (onAddCharacter) {
      onAddCharacter(characterName);
    } else {
      const mention = `@${characterName}`;
      onChange(value ? `${value} ${mention}` : mention);
    }
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          {label}
        </label>
        {showEnhance && (
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
            <span>增强</span>
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full min-h-[80px] px-3 py-2.5 bg-input/70 border text-foreground rounded-lg resize-none focus:outline-none focus:ring-2 placeholder:text-muted-foreground/60 text-sm',
          error
            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
            : 'border-border/70 focus:border-border focus:ring-ring/30'
        )}
      />
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {characterCards.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-foreground/50 uppercase tracking-wider">
              角色卡
            </span>
            <span className="text-[10px] text-foreground/40">点击添加到描述</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {characterCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleAddCharacter(card.characterName)}
                className="flex items-center gap-2 px-2 py-1.5 bg-card/60 hover:bg-card/80 border border-border/70 hover:border-emerald-400/30 rounded-full text-xs text-foreground/80 transition-all shrink-0"
              >
                <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500/20 to-sky-500/20 shrink-0">
                  {card.avatarUrl ? (
                    <img
                      src={card.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-3 h-3 text-emerald-300/60" />
                    </div>
                  )}
                </div>
                <span className="max-w-[120px] truncate">@{card.characterName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
