'use client';

import * as React from 'react';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';

export interface MagicWandProps {
  prompt: string;
  onPromptChange: (newPrompt: string) => void;
  disabled?: boolean;
  className?: string;
}

export function MagicWand({ prompt, onPromptChange, disabled, className }: MagicWandProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleMagic = async (style: 'default' | 'noir' | 'action') => {
    if (!prompt.trim()) {
      toast({
        title: '提示词为空',
        description: '请先输入一些基础描述',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    let currentText = '';

    try {
      const response = await fetch('/api/magic-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
      });

      if (!response.ok) throw new Error('Request failed');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // 清空当前输入框准备接收流式输出（或者保留原意？通常是替换）
      // Google VideoFX 行为是替换/扩写
      onPromptChange('');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        currentText += chunk;
        onPromptChange(currentText);
      }
    } catch (error) {
      console.error('Magic prompt failed:', error);
      toast({
        title: '魔法棒调用失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
      // 恢复原始内容
      onPromptChange(prompt);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10 gap-1", className)}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span className="text-xs font-medium">魔法棒</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleMagic('default')}>
          🎬 电影感 (Cinematic)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleMagic('noir')}>
          🎞️ 黑色电影 (Noir)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleMagic('action')}>
          🧸 动作人偶 (Action)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
