'use client';

import { cn } from '@/lib/utils';

interface NodeProgressBarProps {
  progress: number; // 0-100
  message?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CONFIG = {
  sm: { height: 'h-1', text: 'text-xs' },
  md: { height: 'h-1.5', text: 'text-xs' },
  lg: { height: 'h-2', text: 'text-sm' },
};

export function NodeProgressBar({
  progress,
  message,
  showPercentage = true,
  size = 'md',
  className,
}: NodeProgressBarProps) {
  const sizeConfig = SIZE_CONFIG[size];
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn('w-full space-y-1', className)}>
      {/* Progress bar container */}
      <div
        className={cn(
          'w-full rounded-full bg-secondary overflow-hidden',
          sizeConfig.height,
          'transition-all duration-300'
        )}
      >
        {/* Progress bar fill */}
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      <div className={cn('flex items-center justify-between', sizeConfig.text, 'text-muted-foreground')}>
        {message && (
          <span className="truncate flex-1 mr-2">{message}</span>
        )}
        {showPercentage && (
          <span className="tabular-nums font-medium shrink-0">
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
    </div>
  );
}
