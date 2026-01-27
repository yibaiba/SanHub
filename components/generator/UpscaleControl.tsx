'use client';

import * as React from 'react';
import { Download, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface UpscaleControlProps {
  taskId?: string; // 如果已有进行中的任务
  mediaId: string; // 原视频 ID
  status?: 'queued' | 'processing' | 'completed' | 'failed' | 'pending';
  resultUrl?: string;
  onTaskSubmit?: (taskId: string) => void;
  onClose?: () => void;
}

export function UpscaleControl({ taskId: initialTaskId, mediaId, status: initialStatus, resultUrl: initialResultUrl, onTaskSubmit, onClose }: UpscaleControlProps) {
  const [loading, setLoading] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string | undefined>(initialTaskId);
  const [status, setStatus] = React.useState(initialStatus);
  const [resultUrl, setResultUrl] = React.useState(initialResultUrl);
  const { toast } = useToast();
  const pollTimerRef = React.useRef<NodeJS.Timeout>();

  // 轮询状态
  const checkStatus = React.useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/upscale/status?taskId=${tid}`);
      const data = await res.json();
      if (data.task) {
        setStatus(data.task.status);
        if (data.task.status === 'completed' && data.task.result) {
          const result = JSON.parse(data.task.result);
          // 尝试提取 URL
          const url = result.url || result.data?.[0]?.url;
          if (url) {
            setResultUrl(url);
          }
        }
      }
    } catch (e) {
      console.error('Poll status failed', e);
    }
  }, []);

  React.useEffect(() => {
    if (taskId && (status === 'queued' || status === 'processing')) {
      pollTimerRef.current = setInterval(() => checkStatus(taskId), 3000);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [taskId, status, checkStatus]);

  const handleSubmit = async (quality: '1080p' | '4k') => {
    setLoading(true);
    try {
      const res = await fetch('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, quality }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '提交失败');
      }

      setTaskId(data.taskId);
      setStatus('pending');
      if (onTaskSubmit) onTaskSubmit(data.taskId);

      toast({
        title: '任务已提交',
        description: quality === '4k' ? '已扣除 50 积分，开始排队处理...' : '开始处理...',
      });
    } catch (error) {
      toast({
        title: '提交失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 渲染不同状态
  if (status === 'completed' && resultUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="flex items-center gap-2 text-green-500">
          <Sparkles className="w-8 h-8" />
          <span className="text-lg font-medium">超分完成!</span>
        </div>
        <div className="flex gap-3 w-full">
          <Button className="flex-1" asChild>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" download>
              <Download className="w-4 h-4 mr-2" />
              下载超分视频
            </a>
          </Button>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'queued' || status === 'processing' || status === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">正在处理中...</p>
          <p className="text-sm text-foreground/60">
            {status === 'queued' ? '正在排队，请稍候' : '正在进行超分处理，这可能需要几分钟'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="text-red-400 flex items-center gap-2">
          <AlertCircle className="w-6 h-6" />
          <span className="font-medium">处理失败</span>
        </div>
        <p className="text-sm text-foreground/60">请稍后重试或联系客服</p>
        <div className="flex gap-3 w-full">
          <Button variant="outline" onClick={() => setStatus(undefined)} className="flex-1">
            重试
          </Button>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 初始状态：选择清晰度
  return (
    <div className="grid grid-cols-2 gap-4 py-4">
      <button
        onClick={() => handleSubmit('1080p')}
        disabled={loading}
        className="flex flex-col items-center justify-center p-6 border border-border/70 rounded-xl hover:bg-card/60 transition-colors gap-2 group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="text-2xl font-bold group-hover:scale-110 transition-transform text-foreground">1080P</div>
        <div className="text-sm text-foreground/60">标准超分</div>
        <Badge variant="secondary" className="mt-2">免费</Badge>
      </button>

      <button
        onClick={() => handleSubmit('4k')}
        disabled={loading}
        className="flex flex-col items-center justify-center p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-xl hover:bg-yellow-500/10 transition-colors gap-2 group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="absolute top-2 right-2">
          <Sparkles className="w-4 h-4 text-yellow-500" />
        </div>
        <div className="text-2xl font-bold text-yellow-500 group-hover:scale-110 transition-transform">4K</div>
        <div className="text-sm text-yellow-600/80">极清超分</div>
        <Badge className="mt-2 bg-yellow-500 hover:bg-yellow-600 text-white border-none">
          50 积分
        </Badge>
      </button>
    </div>
  );
}
