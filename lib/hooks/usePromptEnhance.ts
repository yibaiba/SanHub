import { useState, useCallback } from 'react';
import { toast } from '@/components/ui/toaster';

interface UsePromptEnhanceParams {
  prompt: string;
  duration: string;
  onSuccess: (enhanced: string) => void;
}

interface UsePromptEnhanceReturn {
  enhance: () => Promise<void>;
  enhancing: boolean;
  error: string | null;
}

export function usePromptEnhance({
  prompt,
  duration,
  onSuccess,
}: UsePromptEnhanceParams): UsePromptEnhanceReturn {
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhance = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ title: '请先输入提示词', variant: 'destructive' });
      return;
    }

    setEnhancing(true);
    setError(null);

    try {
      // Convert duration to number
      const durationNum = duration === '10s' ? 10 : duration === '15s' ? 15 : undefined;

      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          expansion_level: 'medium',
          duration_s: durationNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '提示词增强失败');
      }

      if (data.data?.enhanced_prompt) {
        onSuccess(data.data.enhanced_prompt);
        toast({ title: '提示词已增强' });
      } else {
        throw new Error('未返回增强后的提示词');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请稍后重试';
      setError(errorMessage);
      toast({
        title: '增强失败',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setEnhancing(false);
    }
  }, [prompt, duration, onSuccess]);

  return {
    enhance,
    enhancing,
    error,
  };
}
