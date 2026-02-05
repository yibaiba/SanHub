'use client';

import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Circle,
  Ban,
} from 'lucide-react';

export type NodeStatus = 'idle' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';

interface NodeStatusBadgeProps {
  status: NodeStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  onRetry?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<NodeStatus, {
  icon: typeof Circle;
  color: string;
  bgColor: string;
  label: string;
  animate?: boolean;
}> = {
  idle: {
    icon: Circle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: '待运行',
  },
  waiting: {
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    label: '等待中',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: '执行中',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: '已完成',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: '失败',
  },
  cancelled: {
    icon: Ban,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: '已取消',
  },
};

const SIZE_CONFIG = {
  sm: { icon: 'w-3 h-3', text: 'text-xs', padding: 'px-1.5 py-0.5' },
  md: { icon: 'w-4 h-4', text: 'text-sm', padding: 'px-2 py-1' },
  lg: { icon: 'w-5 h-5', text: 'text-base', padding: 'px-2.5 py-1.5' },
};

export function NodeStatusBadge({
  status,
  size = 'md',
  showLabel = false,
  onRetry,
  className,
}: NodeStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  const isClickable = status === 'failed' && onRetry;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full transition-colors',
        config.bgColor,
        sizeConfig.padding,
        isClickable && 'cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30',
        className
      )}
      onClick={isClickable ? onRetry : undefined}
      title={isClickable ? '点击重试' : config.label}
    >
      <Icon
        className={cn(
          sizeConfig.icon,
          config.color,
          config.animate && 'animate-spin'
        )}
      />
      {showLabel && (
        <span className={cn(sizeConfig.text, config.color, 'font-medium')}>
          {config.label}
        </span>
      )}
    </div>
  );
}
