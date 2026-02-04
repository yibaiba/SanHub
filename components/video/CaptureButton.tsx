'use client';

import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaptureButtonProps {
  current: number;
  max: number;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * 视频帧截图按钮
 * 显示截图图标、计数器和各种状态
 */
export function CaptureButton({
  current,
  max,
  loading = false,
  disabled = false,
  onClick,
}: CaptureButtonProps) {
  const isLimitReached = current >= max;
  const isDisabled = disabled || loading || isLimitReached;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
        isDisabled
          ? 'bg-card/40 text-foreground/40 cursor-not-allowed'
          : 'bg-amber-500 text-white hover:bg-amber-400 active:scale-95'
      )}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>截取中</span>
        </>
      ) : (
        <>
          <Camera className="w-4 h-4" />
          <span>截图</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-mono',
              isLimitReached
                ? 'bg-red-500/30 text-red-200'
                : 'bg-white/20 text-white'
            )}
          >
            {current}/{max}
          </span>
        </>
      )}
    </button>
  );
}
