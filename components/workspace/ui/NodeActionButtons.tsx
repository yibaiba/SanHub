'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Play,
  Square,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import type { NodeStatus } from './NodeStatusBadge';

interface NodeActionButtonsProps {
  status: NodeStatus;
  onRun: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
  disabled?: boolean;
  className?: string;
}

const SIZE_CONFIG = {
  sm: { button: 'h-6 px-2 text-xs', icon: 'w-3 h-3' },
  md: { button: 'h-8 px-3 text-sm', icon: 'w-4 h-4' },
  lg: { button: 'h-9 px-4 text-sm', icon: 'w-4 h-4' },
};

export function NodeActionButtons({
  status,
  onRun,
  onStop,
  onRetry,
  size = 'md',
  variant = 'default',
  disabled = false,
  className,
}: NodeActionButtonsProps) {
  const sizeConfig = SIZE_CONFIG[size];

  // 运行中状态 - 显示停止按钮
  if (status === 'running') {
    return (
      <Button
        variant="destructive"
        size="sm"
        className={cn(sizeConfig.button, className)}
        onClick={onStop}
        disabled={!onStop}
      >
        <Square className={cn(sizeConfig.icon, 'mr-1')} />
        停止
      </Button>
    );
  }

  // 失败状态 - 显示重试按钮
  if (status === 'failed') {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          sizeConfig.button,
          'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-900/20',
          className
        )}
        onClick={onRetry || onRun}
        disabled={disabled}
      >
        <RotateCcw className={cn(sizeConfig.icon, 'mr-1')} />
        重试
      </Button>
    );
  }

  // 等待中状态 - 显示禁用的按钮
  if (status === 'waiting') {
    return (
      <Button
        variant={variant}
        size="sm"
        className={cn(sizeConfig.button, className)}
        disabled
      >
        <Loader2 className={cn(sizeConfig.icon, 'mr-1 animate-spin')} />
        等待中
      </Button>
    );
  }

  // 已完成状态 - 显示重新运行按钮
  if (status === 'completed') {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(sizeConfig.button, className)}
        onClick={onRun}
        disabled={disabled}
      >
        <Play className={cn(sizeConfig.icon, 'mr-1')} />
        重新运行
      </Button>
    );
  }

  // 默认状态 (idle, cancelled) - 显示运行按钮
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn(sizeConfig.button, className)}
      onClick={onRun}
      disabled={disabled}
    >
      <Play className={cn(sizeConfig.icon, 'mr-1')} />
      运行
    </Button>
  );
}
