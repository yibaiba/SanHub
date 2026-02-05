'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ParamHighlightProps {
  highlight: boolean;
  children: React.ReactNode;
  duration?: number; // 高亮持续时间 (ms)
  pulseCount?: number; // 闪烁次数
  className?: string;
}

export function ParamHighlight({
  highlight,
  children,
  duration = 3000,
  pulseCount = 3,
  className,
}: ParamHighlightProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (highlight) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [highlight, duration]);

  // 计算单次闪烁周期
  const pulseDuration = duration / pulseCount;

  return (
    <div
      className={cn(
        'relative rounded transition-all',
        isAnimating && 'param-highlight-pulse',
        className
      )}
      style={{
        '--pulse-duration': `${pulseDuration}ms`,
        '--pulse-count': pulseCount,
      } as React.CSSProperties}
    >
      {children}
      <style jsx>{`
        .param-highlight-pulse {
          animation: paramPulse var(--pulse-duration) ease-in-out var(--pulse-count);
        }

        @keyframes paramPulse {
          0%, 100% {
            box-shadow: none;
          }
          50% {
            box-shadow: 0 0 0 2px #3b82f6, 0 0 8px rgba(59, 130, 246, 0.5);
          }
        }
      `}</style>
    </div>
  );
}
