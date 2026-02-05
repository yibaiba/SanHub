'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import {
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Dices,
  Info,
  X,
  User,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImageToWebP, fileToBase64 } from '@/lib/image-compression';
import type { Generation, SafeImageModel, DailyLimitConfig } from '@/types';
import { toast } from '@/components/ui/toaster';
import type { Task } from '@/components/generator/result-gallery';
import { getPollingInterval, shouldContinuePolling, isTransientError, getFriendlyErrorMessage } from '@/lib/polling-utils';
import { formatImageError } from '@/lib/error-formatter';

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

// 每日使用量类型
interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

// 获取图像分辨率
function getImageResolution(
  model: SafeImageModel,
  aspectRatio: string,
  imageSize?: string
): string {
  if (model.features.imageSize && imageSize) {
    const sizeBucket = model.resolutions[imageSize];
    if (sizeBucket && typeof sizeBucket === 'object') {
      const resolved = (sizeBucket as Record<string, string>)[aspectRatio];
      if (typeof resolved === 'string') return resolved;
    }
  }

  const ratioBucket = model.resolutions[aspectRatio];
  if (typeof ratioBucket === 'string') return ratioBucket;
  if (ratioBucket && typeof ratioBucket === 'object' && imageSize) {
    const resolved = (ratioBucket as Record<string, string>)[imageSize];
    if (typeof resolved === 'string') return resolved;
  }

  return '';
}

export default function ImageGenerationPage() {
  const { update } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 模型列表（从 API 获取）
  const [availableModels, setAvailableModels] = useState<SafeImageModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<Array<{ file: File; preview: string } | { data: string; mimeType: string; preview: string }>>([]);

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressedCache, setCompressedCache] = useState<Map<File, string>>(new Map());
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);
  const [keepImages, setKeepImages] = useState(false);

  // 图片库状态
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [libraryImages, setLibraryImages] = useState<Generation[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 获取当前选中的模型配置
  const currentModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  // 加载模型列表和每日使用量 - 并行加载
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [modelsRes, dailyUsageRes] = await Promise.all([
          fetch('/api/image-models'),
          fetch('/api/user/daily-usage'),
        ]);

        // 并行解析 JSON
        const [modelsData, dailyUsageData] = await Promise.all([
          modelsRes.ok ? modelsRes.json() : { data: { models: [] } },
          dailyUsageRes.ok ? dailyUsageRes.json() : { data: { usage: null, limits: null } },
        ]);

        // 更新模型
        const models = modelsData.data?.models || [];
        setAvailableModels(models);
        if (models.length > 0) {
          setSelectedModelId((prev) => {
            if (prev) return prev;
            setAspectRatio(models[0].defaultAspectRatio);
            if (models[0].defaultImageSize) {
              setImageSize(models[0].defaultImageSize);
            }
            return models[0].id;
          });
        }

        // 更新每日使用量
        if (dailyUsageData.data) {
          setDailyUsage(dailyUsageData.data.usage);
          setDailyLimits(dailyUsageData.data.limits);
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setModelsLoaded(true);
      }
    };
    loadInitialData();
  }, []);

  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    const model = availableModels.find(m => m.id === selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      if (model.defaultImageSize) {
        setImageSize(model.defaultImageSize);
      }
      // 如果新模型不支持参考图，清除已上传的图片
      if (!model.features.imageToImage) {
        setImages((prev) => {
          prev.forEach((img) => URL.revokeObjectURL(img.preview));
          return [];
        });
      }
    }
  }, [selectedModelId, availableModels]);

  // 加载图片库
  const loadLibrary = async () => {
    setLoadingLibrary(true);
    try {
      // 复用现有的 history 接口，只筛选图片
      const res = await fetch('/api/user/history?limit=50&page=1');
      if (res.ok) {
        const data = await res.json();
        const images = (data.data || []).filter(
          (g: Generation) =>
            g.type.includes('image') || g.type === 'video-capture'
        );
        setLibraryImages(images);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
      toast({
        title: '加载失败',
        description: '无法加载图片库',
        variant: 'destructive',
      });
    } finally {
      setLoadingLibrary(false);
    }
  };

  // 从库中选择图片
  const handleSelectFromLibrary = async (generation: Generation) => {
    try {
      // 检查当前是否已达上传上限（目前设计未明确上限，假设为 4 或 1，这里参考 UI 通常是 4）
      if (images.length >= 4) {
        toast({
          title: '数量限制',
          description: '最多上传 4 张参考图',
          variant: 'destructive',
        });
        return;
      }

      // 获取图片 Blob
      // 注意：加 ?raw=true 告诉后端不要重定向，而是代理回传二进制数据，
      // 这样前端才能拿到 Blob 并创建 File 对象
      const response = await fetch(`/api/media/${generation.id}?raw=true`);
      if (!response.ok) throw new Error('Failed to fetch image data');

      const blob = await response.blob();
      const file = new File([blob], `ref-${generation.id}.jpg`, { type: blob.type });
      const previewUrl = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        {
          file,
          preview: previewUrl,
        },
      ]);

      setShowImageLibrary(false);
      toast({
        title: '已添加',
        description: '图片已添加到参考图列表',
      });
    } catch (err) {
      console.error('Select image error:', err);
      toast({
        title: '添加失败',
        description: '无法获取图片数据',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) continue;

      // 立即校验文件大小
      if (file.size > 15 * 1024 * 1024) {
        setError('图片大小不能超过 15MB');
        continue;
      }

      // 只存储 File 对象和预览
      setImages((prev) => [
        ...prev,
        {
          file,
          preview: URL.createObjectURL(file)
        },
      ]);
    }

    e.target.value = '';
  };

  const clearImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setCompressedCache(new Map()); // 清理压缩缓存
  };

  const removeImage = (index: number) => {
    const target = images[index];
    URL.revokeObjectURL(target.preview);
    setImages((prev) => prev.filter((_, i) => i !== index));

    if ('file' in target && target.file) {
      setCompressedCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(target.file);
        return newCache;
      });
    }
  };

  // 轮询任务状态
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const startTime = Date.now();
      const maxConsecutiveErrors = 5;
      let consecutiveErrors = 0;

      const poll = async (): Promise<void> => {
        if (controller.signal.aborted) return;

        const elapsed = Date.now() - startTime;
        if (!shouldContinuePolling(elapsed, 'image')) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, status: 'failed' as const, errorMessage: '任务超时' }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
          return;
        }

        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });

          // 检查是否为 5xx 错误（可能返回 HTML）
          if (res.status >= 500) {
            throw new Error(`Server Error: ${res.status}`);
          }

          // 安全解析 JSON
          let data;
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await res.json();
          } else {
            const text = await res.text();
            console.warn('[Poll] Non-JSON response:', text.slice(0, 100));
            throw new Error('Invalid response format');
          }

          if (!res.ok) {
            throw new Error(data.error || `Request failed: ${res.status}`);
          }

          // Reset error count on success
          consecutiveErrors = 0;
          const status = data.data.status;
          const rawUrl = typeof data.data.url === 'string' ? data.data.url : '';
          const isCompletedStatus = status === 'completed' || status === 'succeeded';

          if (status === 'failed' || status === 'cancelled') {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'failed' as const,
                      errorMessage: data.data.errorMessage || '生成失败',
                  }
                  : t
              )
            );
            abortControllersRef.current.delete(taskId);
          } else if (isCompletedStatus || rawUrl) {
            await update();

            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: {},
              resultUrl: rawUrl || `/api/media/${data.data.id || taskId}`,
              cost: data.data.cost,
              status: 'completed',
              createdAt: data.data.createdAt,
              updatedAt: data.data.updatedAt,
            };

            setTasks((prev) => prev.filter((t) => t.id !== taskId));
            setGenerations((prev) => [generation, ...prev]);

            toast({
              title: '生成成功',
              description: `消耗 ${data.data.cost} 积分`,
            });

            abortControllersRef.current.delete(taskId);
          } else {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: status as 'pending' | 'processing',
                      progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
                    }
                  : t
              )
            );
            const interval = getPollingInterval(elapsed, 'image');
            setTimeout(poll, interval);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          consecutiveErrors++;
          const errMsg = (err as Error).message || '网络错误';
          // Retry on transient network errors or JSON parse failures
          if (isTransientError(err) && consecutiveErrors < maxConsecutiveErrors) {
            console.warn(`[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`, errMsg);
            const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
            setTimeout(poll, delay);
            return;
          }
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'failed' as const,
                    errorMessage: getFriendlyErrorMessage(errMsg),
                  }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
        }
      };

      await poll();
    },
    [update]
  );

  // Load pending tasks
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks');
        if (res.ok) {
          const data = await res.json();
          // Filter pending image tasks (sora, flow, gemini, zimage, gitee)
          const imageTasks: Task[] = (data.data || [])
            .filter((t: any) =>
              t.type?.includes('sora-image') ||
              t.type?.includes('flow-image') ||
              t.type?.includes('gemini') ||
              t.type?.includes('zimage') ||
              t.type?.includes('gitee')
            )
            .map((t: any) => ({
              id: t.id,
              prompt: t.prompt,
              type: t.type,
              status: t.status as 'pending' | 'processing',
              createdAt: t.createdAt,
            }));

          if (imageTasks.length > 0) {
            setTasks(imageTasks);
            imageTasks.forEach((task) => {
              pollTaskStatus(task.id, task.prompt);
            });
          }
        }
      } catch (err) {
        console.error('Failed to load pending tasks:', err);
      }
    };

    loadPendingTasks();

    const loadHistory = async () => {
      try {
        const res = await fetch('/api/user/history?limit=50&page=1');
        if (res.ok) {
          const data = await res.json();
          const imageGenerations = (data.data || []).filter(
            (g: Generation) =>
              g.type?.includes('image')
          );
          setGenerations(imageGenerations);
          setHasMoreHistory(imageGenerations.length === 50);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    
    loadHistory();

    return () => {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [pollTaskStatus]);

  const handleRemoveTask = useCallback(async (taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }

    try {
      await fetch(`/api/user/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('取消任务请求失败:', err);
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  // 加载更多历史记录
  const handleLoadMoreHistory = useCallback(async () => {
    if (loadingHistory || !hasMoreHistory) return;
    
    setLoadingHistory(true);
    try {
      const nextPage = currentPage + 1;
      const res = await fetch(`/api/user/history?limit=50&page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        const imageGenerations = (data.data || []).filter(
          (g: Generation) =>
            g.type?.includes('image')
        );
        setGenerations(prev => [...prev, ...imageGenerations]);
        setHasMoreHistory(imageGenerations.length === 50);
        setCurrentPage(nextPage);
      }
    } catch (err) {
      console.error('Failed to load more history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [currentPage, loadingHistory, hasMoreHistory]);

  // 恢复生成参数
  const handleRestoreParams = useCallback((generation: Generation) => {
    // 恢复提示词
    setPrompt(generation.prompt || '');
    
    // 恢复图片（如果有）
    if (generation.params?.referenceImages && Array.isArray(generation.params.referenceImages)) {
      const restoredFiles = generation.params.referenceImages.map((dataUrl, index) => {
        // 从 data URL 提取 mime type
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        
        return {
          data: dataUrl,
          mimeType,
          preview: dataUrl,
        };
      });
      
      setImages(restoredFiles);
    } else {
      setImages([]);
    }
    
    // 滚动到顶部输入区域
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 删除生成记录
  const handleDeleteGeneration = useCallback((generationId: string) => {
    setGenerations(prev => prev.filter(g => g.id !== generationId));
  }, []);

  // 恢复失败任务的参数
  const handleRestoreTaskParams = useCallback((task: Task) => {
    // 恢复提示词
    setPrompt(task.prompt || '');
    
    // 恢复图片（如果有）
    if (task.referenceImages && Array.isArray(task.referenceImages)) {
      const restoredFiles = task.referenceImages.map((dataUrl) => {
        // 从 data URL 提取 mime type
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        
        return {
          data: dataUrl,
          mimeType,
          preview: dataUrl,
        };
      });
      
      setImages(restoredFiles);
    } else {
      setImages([]);
    }
    
    // 滚动到顶部输入区域
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 检查是否达到每日限制
  const isImageLimitReached = dailyLimits.imageLimit > 0 && dailyUsage.imageCount >= dailyLimits.imageLimit;

  // 验证输入
  const validateInput = (): string | null => {
    if (!currentModel) return '请选择模型';
  // 检查每日限制
    if (isImageLimitReached) {
      return `今日图像生成次数已达上限 (${dailyLimits.imageLimit} 次)`;
    }
    if (currentModel.requiresReferenceImage && images.length === 0) {
      return '请上传参考图';
    }
  // Gemini 类型允许图片或提示词
    if (currentModel.channelType === 'gemini') {
      if (!prompt.trim() && images.length === 0) {
        return '请输入提示词或上传参考图片';
      }
    } else if (!currentModel.allowEmptyPrompt) {
      if (!prompt.trim()) {
        return '请输入提示词';
      }
    }
    return null;
  };

  // 压缩图片（如果需要）
  const compressImagesIfNeeded = async (): Promise<Array<{ mimeType: string; data: string }>> => {
    if (images.length === 0) return [];

    setCompressing(true);
    setError('');

    try {
      const compressedImages = [];

      for (const img of images) {
        // 如果已经是 base64 格式（从恢复参数来的）
        if ('data' in img && 'mimeType' in img) {
          compressedImages.push({
            mimeType: img.mimeType,
            data: img.data,
          });
          continue;
        }

        // 处理 File 对象
        let base64 = compressedCache.get(img.file);

        if (!base64) {
          // 压缩图片（Web Worker 自动处理）
          const compressedFile = await compressImageToWebP(img.file);

          // 转换为 base64
          base64 = await fileToBase64(compressedFile);

          // 缓存结果
          setCompressedCache(prev => new Map(prev).set(img.file, base64!));
        }

        compressedImages.push({
          mimeType: 'image/jpeg',
          data: `data:image/jpeg;base64,${base64}`
        });
      }

      return compressedImages;
    } finally {
      setCompressing(false);
    }
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (
    taskPrompt: string,
    compressedImages?: Array<{ mimeType: string; data: string }>
  ) => {
    if (!currentModel) throw new Error('请选择模型');

    const res = await fetch('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: currentModel.id,
        prompt: taskPrompt,
        aspectRatio,
        imageSize: currentModel.features.imageSize ? imageSize : undefined,
        images: compressedImages || [],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '生成失败');
    }

    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      type: data.data.type || 'image',
      status: 'pending',
      createdAt: Date.now(),
      referenceImages: compressedImages?.map(img => `data:${img.mimeType};base64,${img.data}`) || [],
    };
    setTasks((prev) => [newTask, ...prev]);
    pollTaskStatus(data.data.id, taskPrompt);

    return data.data.id;
  };

  const handleGenerate = async () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      // 先压缩图片
      const compressedImages = await compressImagesIfNeeded();

      // 提交任务
      await submitSingleTask(taskPrompt, compressedImages);

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, imageCount: prev.imageCount + 1 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败';
      setError(formatImageError(errorMessage));
    } finally {
      setSubmitting(false);
    }
  };

  // 抽卡模式：连续提交3个相同任务
  const handleGachaMode = async () => {
    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);

    const taskPrompt = prompt.trim();

    try {
      // 压缩一次，复用 3 次
      const compressedImages = await compressImagesIfNeeded();

      // 提交 3 次任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, compressedImages);
      }

      toast({
        title: '已提交 3 个任务',
        description: '抽卡模式启动，等待结果中...',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, imageCount: prev.imageCount + 3 }));

      if (!keepPrompt) {
        setPrompt('');
        clearImages();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '生成失败';
      setError(formatImageError(errorMessage));
    } finally {
      setSubmitting(false);
    }
  };

  // 获取当前分辨率显示
  const getCurrentResolutionDisplay = () => {
    if (!currentModel) return '';
    return getImageResolution(currentModel, aspectRatio, imageSize);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">图像生成</h1>
          <p className="text-foreground/50 mt-1 font-light">
            选择模型，生成高质量图像
          </p>
        </div>
        {dailyLimits.imageLimit > 0 && (
          <div className={cn(
            "px-4 py-2 rounded-xl border text-sm",
            isImageLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.imageCount} / {dailyLimits.imageLimit}
          </div>
        )}
      </div>

      {/* Warnings */}
      {modelsLoaded && availableModels.length === 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200">所有图像生成渠道已被管理员禁用</p>
        </div>
      )}

      {isImageLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日图像生成次数已达上限，请明天再试</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Panel - Input */}
        <div className="lg:col-span-1">
          <div className={cn(
            "surface overflow-hidden backdrop-blur-sm",
            (availableModels.length === 0 || isImageLimitReached) && "opacity-50 pointer-events-none"
          )}>
            <div className="px-5 py-4 border-b border-border/70 bg-gradient-to-r from-sky-500/10 to-emerald-500/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-card/60 border border-border/70 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-sky-300" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-foreground">创作面板</h2>
                  <p className="text-xs text-foreground/40">配置参数开始生成</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {/* Model Selection */}
              <div className="space-y-2">
                <label className="text-xs text-foreground/50 uppercase tracking-wider">模型</label>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-card/60 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 text-sm"
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>

              {/* Image Size (if supported) */}
              {currentModel?.features.imageSize && currentModel.imageSizes && (
                <div className="space-y-2">
                  <label className="text-xs text-foreground/50 uppercase tracking-wider">分辨率</label>
                  <div className="grid grid-cols-3 gap-2">
                    {currentModel.imageSizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setImageSize(size)}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                          imageSize === size
                            ? 'bg-foreground text-background border-transparent'
                            : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Aspect Ratio */}
              {currentModel && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground/50 uppercase tracking-wider">画面比例</label>
                    <span className="text-xs text-foreground/40">{getCurrentResolutionDisplay()}</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {currentModel.aspectRatios.map((r) => (
                      <button
                        key={r}
                        onClick={() => setAspectRatio(r)}
                        className={cn(
                          'px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                          aspectRatio === r
                            ? 'bg-foreground text-background border-transparent'
                            : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reference Images (if supported) */}
              {currentModel?.features.imageToImage && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground/50 uppercase tracking-wider">参考图</label>
                    {images.length > 0 && (
                      <button
                        onClick={clearImages}
                        className="text-xs text-red-300 hover:text-red-200 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> 清除
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  {images.length === 0 ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-border/70 rounded-lg p-5 text-center cursor-pointer hover:bg-card/70 hover:border-border transition-all"
                      >
                        <Upload className="w-6 h-6 mx-auto text-foreground/40 mb-2" />
                        <p className="text-sm text-foreground/60">点击上传参考图</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowImageLibrary(true);
                          loadLibrary();
                        }}
                        className="w-full py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        从我的图片库选择
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {images.map((img, i) => (
                          <div
                            key={i}
                            className="aspect-square rounded-lg overflow-hidden border border-border/70 relative group"
                          >
                            <img
                              src={img.preview}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                            <button
                              onClick={() => removeImage(i)}
                              className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                      {images.length < 4 && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            继续上传
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImageLibrary(true);
                              loadLibrary();
                            }}
                            className="py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <User className="w-4 h-4" />
                            图库选择
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Image Library Modal */}
              {showImageLibrary && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                  <div className="bg-background border border-border rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <h3 className="text-lg font-medium">选择参考图</h3>
                      <button
                        onClick={() => setShowImageLibrary(false)}
                        className="text-foreground/60 hover:text-foreground"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      {loadingLibrary ? (
                        <div className="text-center py-8 text-foreground/50">加载中...</div>
                      ) : libraryImages.length === 0 ? (
                        <div className="text-center py-8 text-foreground/50">暂无图片记录</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {libraryImages.map((gen) => (
                            <button
                              key={gen.id}
                              onClick={() => handleSelectFromLibrary(gen)}
                              className="aspect-square rounded-lg overflow-hidden border-2 border-border/50 hover:border-sky-400 transition-all group relative"
                            >
                              <img
                                src={gen.resultUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                                onLoad={(e) => {
                                  const img = e.currentTarget;
                                  const badge = img.nextElementSibling;
                                  if (badge) {
                                    badge.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
                                  }
                                }}
                              />
                              <div 
                                className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white font-mono pointer-events-none"
                              >
                                ...
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Prompt */}
              <div className="space-y-2">
                <label className="text-xs text-foreground/50 uppercase tracking-wider">提示词</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述你想要生成的图像..."
                  className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepPrompt}
                    onChange={(e) => setKeepPrompt(e.target.checked)}
                    className="w-4 h-4 rounded border-border/70 bg-card/60 text-foreground accent-sky-400 cursor-pointer"
                  />
                  <span className="text-sm text-foreground/50">保留提示词</span>
                </label>
                {currentModel?.features.imageToImage && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepImages}
                      onChange={(e) => setKeepImages(e.target.checked)}
                      className="w-4 h-4 rounded border-border/70 bg-card/60 text-foreground accent-sky-400 cursor-pointer"
                    />
                    <span className="text-sm text-foreground/50">保留参考图</span>
                  </label>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Generate Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={submitting || compressing}
                  className={cn(
                    'w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-all',
                    submitting || compressing
                      ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                      : 'bg-foreground text-background hover:opacity-90'
                  )}
                >
                  {submitting || compressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{compressing ? '处理中...' : '提交中...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>开始生成</span>
                    </>
                  )}
                </button>
                <div className="relative group">
                  <button
                    onClick={handleGachaMode}
                    disabled={submitting || compressing}
                    className={cn(
                      'h-[46px] w-full sm:w-[46px] flex items-center justify-center rounded-lg font-medium transition-all',
                      submitting || compressing
                        ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90'
                    )}
                    title="抽卡模式"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-20">
                    <div className="bg-card/90 border border-border/70 rounded-lg px-3 py-2 text-xs text-foreground/80 whitespace-nowrap shadow-lg">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Info className="w-3 h-3 text-amber-300" />
                        <span className="font-medium text-foreground">抽卡模式</span>
                      </div>
                      <p>一次性提交 3 个相同参数的任务</p>
                      <p>提高出好图的概率</p>
                      <div className="absolute bottom-0 right-4 translate-y-full">
                        <div className="border-8 border-transparent border-t-card/90"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2">
          <ResultGallery
            generations={generations}
            tasks={tasks}
            onRemoveTask={handleRemoveTask}
            onRestoreParams={handleRestoreParams}
            onRestoreTaskParams={handleRestoreTaskParams}
            onLoadMore={handleLoadMoreHistory}
            hasMore={hasMoreHistory}
            loading={loadingHistory}
            onDeleteGeneration={handleDeleteGeneration}
          />
        </div>
      </div>
    </div>
  );
}
