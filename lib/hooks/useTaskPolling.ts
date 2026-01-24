import { useRef, useCallback, useEffect } from 'react';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import type { Generation } from '@/types';

interface UseTaskPollingParams {
  tasks: Task[];
  onTaskComplete: (task: Task, generation: Generation) => void;
  onTaskFail: (taskId: string, error: string) => void;
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
}

interface UseTaskPollingReturn {
  startPolling: (taskId: string, prompt: string) => void;
  stopPolling: (taskId: string) => void;
  stopAllPolling: () => void;
}

export function useTaskPolling({
  tasks,
  onTaskComplete,
  onTaskFail,
  onTaskUpdate,
}: UseTaskPollingParams): UseTaskPollingReturn {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Poll task status with exponential backoff and retry logic
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const maxAttempts = 240; // 240 attempts max
      const maxConsecutiveErrors = 5;
      let attempts = 0;
      let consecutiveErrors = 0;

      // Adaptive polling intervals with exponential backoff
      const getPollingInterval = (attemptCount: number): number => {
        if (attemptCount <= 3) return 2000;      // First 3 attempts: 2s (fast initial check)
        if (attemptCount <= 10) return 5000;     // Next 7 attempts: 5s
        if (attemptCount <= 30) return 10000;    // Next 20 attempts: 10s
        return 15000;                             // After 30 attempts: 15s (slow down)
      };

      const poll = async (): Promise<void> => {
        if (controller.signal.aborted) return;

        if (attempts >= maxAttempts) {
          onTaskFail(taskId, '任务超时');
          abortControllersRef.current.delete(taskId);
          return;
        }

        attempts++;

        try {
          // Add per-request timeout to prevent socket leaks
          const requestController = new AbortController();
          const timeoutId = setTimeout(() => requestController.abort(), 30000); // 30s per request

          let res: Response;
          try {
            res = await fetch(`/api/generate/status/${taskId}`, {
              signal: requestController.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }
          
          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || '查询任务状态失败');
          }

          // Reset error counter on success
          consecutiveErrors = 0;
          const status = data.data.status;
          const resultUrl = typeof data.data.url === 'string' ? data.data.url : '';
          const isCompletedStatus = status === 'completed' || status === 'succeeded';

          if (isCompletedStatus && resultUrl) {
            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl,
              cost: data.data.cost,
              status: 'completed',
              createdAt: data.data.createdAt,
              updatedAt: data.data.updatedAt,
            };

            const task = tasks.find((t) => t.id === taskId);
            if (task) {
              onTaskComplete(task, generation);
            }

            toast({
              title: '生成成功',
              description: `消耗 ${data.data.cost} 积分`,
            });

            abortControllersRef.current.delete(taskId);
          } else if (status === 'failed' || status === 'cancelled') {
            onTaskFail(taskId, data.data.errorMessage || '生成失败');
            abortControllersRef.current.delete(taskId);
          } else if (isCompletedStatus && !resultUrl) {
            onTaskUpdate(taskId, {
              status: 'processing',
              progress:
                typeof data.data.progress === 'number' ? data.data.progress : undefined,
            });
            setTimeout(poll, getPollingInterval(attempts));
          } else {
            const nextStatus =
              status === 'pending' || status === 'processing' ? status : 'processing';
            onTaskUpdate(taskId, {
              status: nextStatus as 'pending' | 'processing',
              progress:
                typeof data.data.progress === 'number' ? data.data.progress : undefined,
            });
            setTimeout(poll, getPollingInterval(attempts));
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;

          consecutiveErrors++;
          const errMsg = (err as Error).message || '网络错误';

          // Retry on transient network errors with exponential backoff
          const isTransientError =
            errMsg.includes('socket') ||
            errMsg.includes('Socket') ||
            errMsg.includes('ECONNRESET') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('network') ||
            errMsg.includes('fetch');

          if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
            console.warn(
              `[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`,
              errMsg
            );
            const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
            setTimeout(poll, delay);
            return;
          }

          onTaskFail(taskId, errMsg);
          abortControllersRef.current.delete(taskId);
        }
      };

      await poll();
    },
    [tasks, onTaskComplete, onTaskFail, onTaskUpdate]
  );

  // Start polling for a task
  const startPolling = useCallback(
    (taskId: string, prompt: string) => {
      pollTaskStatus(taskId, prompt);
    },
    [pollTaskStatus]
  );

  // Stop polling for a specific task
  const stopPolling = useCallback((taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }
  }, []);

  // Stop all polling
  const stopAllPolling = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
    };
  }, []);

  return {
    startPolling,
    stopPolling,
    stopAllPolling,
  };
}
