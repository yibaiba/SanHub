'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  Video,
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  Film,
  Link as LinkIcon,
  Dices,
  Info,
  User,
  Maximize2,
  X,
} from 'lucide-react';
import { cn, fileToBase64 } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { MagicWand } from '@/components/generator/MagicWand';
import type { Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard, SafeVideoModel, DailyLimitConfig } from '@/types';

const ResultGallery = dynamic(
  () => import('@/components/generator/result-gallery').then((mod) => mod.ResultGallery),
  {
    ssr: false,
    loading: () => (
      <div className="surface p-6 text-sm text-foreground/50">Loading results...</div>
    ),
  }
);

type CreationMode = 'normal' | 'remix' | 'storyboard';

// 视频引擎类型
type VideoEngine = 'sora' | 'veo';

// Veo 3 创作模式
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

// 每日使用量类型
interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

const CREATION_MODES = [
  { id: 'normal', label: '普通生成', icon: Video, description: '文本/图片生成视频' },
  { id: 'remix', label: '视频Remix', icon: Wand2, description: '基于已有视频继续创作' },
  { id: 'storyboard', label: '视频分镜', icon: Film, description: '多镜头分段生成' },
] as const;

const VEO3_MODES = [
  { id: 't2v', label: '文生视频', icon: Video, description: '文字描述生成视频', maxImages: 0 },
  { id: 'i2v', label: '图生视频', icon: Upload, description: '1张=首帧，2张=首尾帧', maxImages: 2 },
  { id: 'r2v', label: '图片融合', icon: Sparkles, description: '多图参考合成视频', maxImages: 3 },
] as const;

type OptionGroupProps = {
  label: string;
  children: ReactNode;
  className?: string;
  contentClassName: string;
};

function OptionGroup({ label, children, className, contentClassName }: OptionGroupProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-xs text-foreground/50 uppercase tracking-wider">{label}</label>
      <div className={cn(contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export default function VideoGenerationPage() {
  // 图片库选择状态
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageLibrary, setImageLibrary] = useState<Generation[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 加载图片库
  const loadImageLibrary = async () => {
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/user/history?limit=50&page=1');
      if (res.ok) {
        const data = await res.json();
        const images = (data.data || []).filter(
          (g: Generation) => g.type.includes('image') || g.type === 'sora-image' || g.type === 'flow-image'
        );
        setImageLibrary(images);
      }
    } catch (err) {
      console.error('Failed to load image library:', err);
      toast({
        title: '加载失败',
        description: '无法加载图片库',
        variant: 'destructive',
      });
    } finally {
      setLoadingLibrary(false);
    }
  };

  // 从图片库选择图片
  const handleSelectFromLibrary = async (generation: Generation) => {
    try {
      // 获取图片 URL
      const imageUrl = generation.resultUrl;
      if (!imageUrl) {
        toast({
          title: '无效图片',
          description: '该图片没有有效的 URL',
          variant: 'destructive',
        });
        return;
      }

      // 检查数量限制
      let maxImages = 10;
      if (videoEngine === 'veo') {
        const currentVeo3Mode = VEO3_MODES.find(m => m.id === veo3Mode);
        maxImages = currentVeo3Mode?.maxImages || 0;
        if (files.length >= maxImages) {
          toast({
            title: '图片数量超限',
            description: `当前模式最多支持 ${maxImages} 张图片`,
            variant: 'destructive',
          });
          return;
        }
      }

      // Download image with cache support
      const response = await fetch(`/api/media/${generation.id}?raw=true`, {
        cache: 'force-cache', // Use browser cache if available
      });
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const file = new File([blob], `image-${generation.id}.jpg`, { type: blob.type });

      // 处理图片（Veo 模式需要裁剪）
      if (videoEngine === 'veo') {
        const img = new Image();
        const tempUrl = URL.createObjectURL(file);
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            URL.revokeObjectURL(tempUrl);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            reject(new Error('Failed to load image'));
          };
          img.src = tempUrl;
        });
        
        const width = img.width;
        const height = img.height;
        
        let targetRatio: 'landscape' | 'portrait';
        if (width > height) {
          targetRatio = 'landscape';
          setAspectRatio('landscape');
        } else {
          targetRatio = 'portrait';
          setAspectRatio('portrait');
        }
        
        const { file: croppedFile, preview: previewUrl } = await cropImageToAspectRatio(file, targetRatio);
        
        setFiles((prev) => [
          ...prev,
          { data: '', mimeType: file.type, preview: previewUrl, file: croppedFile },
        ]);
      } else {
        // Sora 模式：直接使用
        const previewUrl = URL.createObjectURL(file);
        setFiles((prev) => [
          ...prev,
          { data: '', mimeType: file.type, preview: previewUrl, file },
        ]);
      }

      toast({
        title: '已添加图片',
        description: '图片已添加到参考素材',
      });
    } catch (err) {
      console.error('Failed to select image:', err);
      toast({
        title: '添加失败',
        description: '无法添加该图片',
        variant: 'destructive',
      });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadAreaRef = useRef<HTMLDivElement>(null);
  
  // 拖拽状态
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 模型列表（从 API 获取）
  const [availableModels, setAvailableModels] = useState<SafeVideoModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // 每日限制
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ imageCount: 0, videoCount: 0, characterCardCount: 0 });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({ imageLimit: 0, videoLimit: 0, characterCardLimit: 0 });

  // 视频引擎选择
  const [videoEngine, setVideoEngine] = useState<VideoEngine>('sora');

  // 创作模式
  const [creationMode, setCreationMode] = useState<CreationMode>('normal');
  
  // Veo 3 模式
  const [veo3Mode, setVeo3Mode] = useState<Veo3Mode>('i2v');

  // 模型选择
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // 参数状态
  const [aspectRatio, setAspectRatio] = useState<string>('landscape');
  const [duration, setDuration] = useState<string>('10s');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Array<{ data: string; mimeType: string; preview: string; file?: File }>>([]);;

  // 视频风格选择 (仅普通模式可用)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const VIDEO_STYLES = [
    { id: 'anime', name: 'Anime', image: '/styles/Anime.jpg' },
    { id: 'comic', name: 'Comic', image: '/styles/Comic.jpg' },
    { id: 'festive', name: 'Festive', image: '/styles/Festive.jpg' },
    { id: 'golden', name: 'Golden', image: '/styles/Golden.jpg' },
    { id: 'handheld', name: 'Handheld', image: '/styles/Handheld.jpg' },
    { id: 'news', name: 'News', image: '/styles/News.jpg' },
    { id: 'retro', name: 'Retro', image: '/styles/Retro.jpg' },
    { id: 'selfie', name: 'Selfie', image: '/styles/Selfie.jpg' },
    { id: 'vintage', name: 'Vintage', image: '/styles/Vintage.jpg' },
  ];

  // Remix 模式
  const [remixUrl, setRemixUrl] = useState('');

  // 分镜模式
  const [storyboardPrompt, setStoryboardPrompt] = useState('');

  // 任务状态
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 角色卡选择
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const remixPromptRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前选中的模型配置
  const currentModel = useMemo(() => {
    return availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);
  
  // 根据引擎类型和模式过滤模型
  const filteredModels = useMemo(() => {
    if (videoEngine === 'sora') {
      // Sora 引擎：过滤掉所有 Veo 模型
      return availableModels.filter(model => {
        const modelName = model.name.toLowerCase();
        return !modelName.includes('veo');
      });
    } else {
      // Veo 引擎：根据模式过滤对应的模型
      return availableModels.filter(model => {
        const modelName = model.name.toLowerCase();
        const isVeo = modelName.includes('veo');
        
        if (!isVeo) return false;
        
        // 根据 Veo 模式过滤
        if (veo3Mode === 't2v') {
          // 文生视频：只显示包含"文生视频"的模型
          return modelName.includes('文生视频');
        } else if (veo3Mode === 'i2v') {
          // 图生视频：只显示包含"图生视频"的模型
          return modelName.includes('图生视频');
        } else if (veo3Mode === 'r2v') {
          // 图片融合：只显示包含"多图生成"或"融合"的模型
          return modelName.includes('多图生成') || modelName.includes('融合');
        }
        
        return false;
      });
    }
  }, [availableModels, videoEngine, veo3Mode]);

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/video-models');
        if (res.ok) {
          const data = await res.json();
          const models = data.data?.models || [];
          setAvailableModels(models);
          // 设置默认选中第一个模型
          if (models.length > 0) {
            setSelectedModelId((prev) => {
              if (prev) return prev;
              setAspectRatio(models[0].defaultAspectRatio);
              setDuration(models[0].defaultDuration);
              return models[0].id;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setModelsLoaded(true);
      }
    };
    loadModels();
  }, []);

  // 加载每日使用量
  useEffect(() => {
    const loadDailyUsage = async () => {
      try {
        const res = await fetch('/api/user/daily-usage');
        if (res.ok) {
          const data = await res.json();
          setDailyUsage(data.data.usage);
          setDailyLimits(data.data.limits);
        }
      } catch (err) {
        console.error('Failed to load daily usage:', err);
      }
    };
    loadDailyUsage();
  }, []);

  // 当引擎类型或 Veo 模式改变时，自动选择第一个对应的模型
  useEffect(() => {
    if (filteredModels.length > 0) {
      const firstModel = filteredModels[0];
      setSelectedModelId(firstModel.id);
      setAspectRatio(firstModel.defaultAspectRatio);
      setDuration(firstModel.defaultDuration);
      // 清空文件
      files.forEach((f) => URL.revokeObjectURL(f.preview));
      setFiles([]);
    }
  }, [videoEngine, veo3Mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当模型改变时，重置参数到默认值
  useEffect(() => {
    const model = availableModels.find(m => m.id === selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      setDuration(model.defaultDuration);
      if (!model.features.imageToVideo) {
        setFiles((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview));
          return [];
        });
      }
    }
  }, [selectedModelId, availableModels]);

  // 加载用户角色卡
  useEffect(() => {
    const loadCharacterCards = async () => {
      try {
        const res = await fetch('/api/user/character-cards');
        if (res.ok) {
          const data = await res.json();
          const completedCards = (data.data || []).filter(
            (c: CharacterCard) => c.status === 'completed' && c.characterName
          );
          setCharacterCards(completedCards);
        }
      } catch (err) {
        console.error('Failed to load character cards:', err);
      }
    };
    loadCharacterCards();
  }, []);

  // 处理提示词输入
  const handlePromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    setter: (value: string) => void
  ) => {
    setter(e.target.value);
  };

  // 提示词增强
  const handleEnhancePrompt = async () => {
    const currentPrompt = creationMode === 'storyboard' ? storyboardPrompt : prompt;
    if (!currentPrompt.trim()) {
      toast({ title: '请先输入提示词', variant: 'destructive' });
      return;
    }

    setEnhancing(true);
    try {
      const durationNum = duration === '10s' ? 10 : duration === '15s' ? 15 : undefined;
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt.trim(),
          expansion_level: 'medium',
          duration_s: durationNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '提示词增强失败');
      }

      if (data.data?.enhanced_prompt) {
        if (creationMode === 'storyboard') {
          setStoryboardPrompt(data.data.enhanced_prompt);
        } else {
          setPrompt(data.data.enhanced_prompt);
        }
        toast({ title: '提示词已增强' });
      }
    } catch (err) {
      toast({
        title: '增强失败',
        description: err instanceof Error ? err.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setEnhancing(false);
    }
  };

  const handleAddCharacter = (characterName: string) => {
    const mention = `@${characterName}`;
    setPrompt((prev) => (prev ? `${prev} ${mention}` : mention));
    promptTextareaRef.current?.focus();
  };

  // 轮询任务状态
  const pollTaskStatus = useCallback(
    async (taskId: string, taskPrompt: string): Promise<void> => {
      if (abortControllersRef.current.has(taskId)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const maxAttempts = 240;
      const maxConsecutiveErrors = 5;
      let attempts = 0;
      let consecutiveErrors = 0;

      const poll = async (): Promise<void> => {
        if (controller.signal.aborted) return;

        if (attempts >= maxAttempts) {
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

        attempts++;

        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });
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
            // Get reference images from task before removing it
            let referenceImages: string[] | undefined;
            setTasks((prev) => {
              const task = prev.find(t => t.id === taskId);
              if (task?.referenceImages) {
                referenceImages = task.referenceImages;
              }
              return prev;
            });

            const generation: Generation = {
              id: data.data.id,
              userId: '',
              type: data.data.type,
              prompt: taskPrompt,
              params: referenceImages ? { referenceImages } : {},
              resultUrl,
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
          } else if (status === 'failed' || status === 'cancelled') {
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
          } else if (isCompletedStatus && !resultUrl) {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: 'processing' as const,
                      progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
                    }
                  : t
              )
            );
            setTimeout(poll, 10000);
          } else {
            const nextStatus =
              status === 'pending' || status === 'processing'
                ? status
                : 'processing';
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? { 
                      ...t, 
                      status: nextStatus as 'pending' | 'processing',
                      progress: typeof data.data.progress === 'number' ? data.data.progress : t.progress,
                    }
                  : t
              )
            );
            setTimeout(poll, 10000);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          consecutiveErrors++;
          const errMsg = (err as Error).message || '网络错误';
          // Retry on transient network errors
          const isTransientError =
            errMsg.includes('socket') ||
            errMsg.includes('Socket') ||
            errMsg.includes('ECONNRESET') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('network') ||
            errMsg.includes('fetch');
          if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
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
                    errorMessage: errMsg,
                  }
                : t
            )
          );
          abortControllersRef.current.delete(taskId);
        }
      };

      await poll();
    },
    []
  );

  // 加载 pending 任务和历史记录
  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    
    const loadPendingTasks = async () => {
      try {
        const res = await fetch('/api/user/tasks');
        if (res.ok) {
          const data = await res.json();
          const videoTasks: Task[] = (data.data || [])
            .filter((t: any) => t.type === 'sora-video' || t.type === 'flow-video' || t.type === 'video')
            .map((t: any) => ({
              id: t.id,
              prompt: t.prompt,
              type: t.type,
              status: t.status as 'pending' | 'processing',
              createdAt: t.createdAt,
            }));

          if (videoTasks.length > 0) {
            setTasks(videoTasks);
            videoTasks.forEach((task) => {
              pollTaskStatus(task.id, task.prompt);
            });
          }
        }
      } catch (err) {
        console.error('Failed to load pending tasks:', err);
      }
    };

    const loadHistory = async () => {
      try {
        const res = await fetch('/api/user/history?limit=20&page=1');
        if (res.ok) {
          const data = await res.json();
          const videoGenerations = (data.data || []).filter(
            (g: Generation) => g.type === 'sora-video' || g.type === 'flow-video'
          );
          setGenerations(videoGenerations);
          setHasMoreHistory(videoGenerations.length === 20);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };

    loadPendingTasks();
    loadHistory();

    return () => {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [pollTaskStatus]);

  // 加载更多历史记录
  const handleLoadMoreHistory = useCallback(async () => {
    if (loadingHistory || !hasMoreHistory) return;
    
    setLoadingHistory(true);
    try {
      const nextPage = currentPage + 1;
      const res = await fetch(`/api/user/history?limit=20&page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        const videoGenerations = (data.data || []).filter(
          (g: Generation) => g.type === 'sora-video' || g.type === 'flow-video'
        );
        setGenerations(prev => [...prev, ...videoGenerations]);
        setHasMoreHistory(videoGenerations.length === 20);
        setCurrentPage(nextPage);
      }
    } catch (err) {
      console.error('Failed to load more history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [currentPage, loadingHistory, hasMoreHistory]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
    
    // 获取当前模式的最大图片数量
    let maxImages = 10; // 默认值（Sora）
    if (videoEngine === 'veo') {
      const currentVeo3Mode = VEO3_MODES.find(m => m.id === veo3Mode);
      maxImages = currentVeo3Mode?.maxImages || 0;
      
      // 检查是否超出限制
      if (files.length + selectedFiles.length > maxImages) {
        toast({
          title: '图片数量超限',
          description: `当前模式最多支持 ${maxImages} 张图片`,
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }
    }
    
    const processedFiles: Array<{ data: string; mimeType: string; preview: string; file?: File }> = [];
    
    for (const file of selectedFiles) {
      // Only allow images, no videos
      if (!file.type.startsWith('image/')) {
        toast({
          title: '文件类型错误',
          description: '只支持图片文件',
          variant: 'destructive',
        });
        continue;
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: '文件过大',
          description: `${file.name} 超过 50MB 限制，请压缩后上传`,
          variant: 'destructive',
        });
        continue;
      }
      
      // For Veo mode only, detect image aspect ratio, crop image, and auto-set aspectRatio
      if (videoEngine === 'veo') {
        try {
          // First detect orientation
          const img = new Image();
          const tempUrl = URL.createObjectURL(file);
          
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              URL.revokeObjectURL(tempUrl);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(tempUrl);
              reject(new Error('Failed to load image'));
            };
            img.src = tempUrl;
          });
          
          const width = img.width;
          const height = img.height;
          
          // Determine target aspect ratio based on image orientation
          let targetRatio: 'landscape' | 'portrait';
          if (width > height) {
            targetRatio = 'landscape';
          } else {
            targetRatio = 'portrait';
          }
          
          // Set aspect ratio based on first image
          if (processedFiles.length === 0) {
            setAspectRatio(targetRatio);
          }
          
          // Crop image to target aspect ratio
          const { file: croppedFile, preview: previewUrl } = await cropImageToAspectRatio(file, targetRatio);
          
          processedFiles.push({ data: '', mimeType: file.type, preview: previewUrl, file: croppedFile });
        } catch (err) {
          console.error('Failed to process image:', err);
          toast({
            title: '图片处理失败',
            description: '无法处理该图片，请尝试其他图片',
            variant: 'destructive',
          });
        }
      } else {
        // Sora mode: no cropping, just use original file
        const previewUrl = URL.createObjectURL(file);
        processedFiles.push({ data: '', mimeType: file.type, preview: previewUrl, file });
      }
    }
    
    // Add all processed files at once
    if (processedFiles.length > 0) {
      setFiles((prev) => [...prev, ...processedFiles]);
    }
    
    e.target.value = '';
  };

  const clearFiles = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  // 拖拽处理函数
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    // 交换位置
    const newFiles = [...files];
    const draggedFile = newFiles[draggedIndex];
    newFiles.splice(draggedIndex, 1);
    newFiles.splice(index, 0, draggedFile);
    
    setFiles(newFiles);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Crop image to target aspect ratio (for Veo mode)
  const cropImageToAspectRatio = async (
    file: File,
    targetRatio: 'landscape' | 'portrait'
  ): Promise<{ file: File; preview: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        const sourceWidth = img.width;
        const sourceHeight = img.height;
        
        // Target aspect ratios
        const targetAspect = targetRatio === 'landscape' ? 16 / 9 : 9 / 16;
        const sourceAspect = sourceWidth / sourceHeight;
        
        let cropWidth: number;
        let cropHeight: number;
        let cropX: number;
        let cropY: number;
        
        if (sourceAspect > targetAspect) {
          // Source is wider, crop width
          cropHeight = sourceHeight;
          cropWidth = cropHeight * targetAspect;
          cropX = (sourceWidth - cropWidth) / 2;
          cropY = 0;
        } else {
          // Source is taller, crop height
          cropWidth = sourceWidth;
          cropHeight = cropWidth / targetAspect;
          cropX = 0;
          cropY = (sourceHeight - cropHeight) / 2;
        }
        
        // Set canvas size to cropped dimensions
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        
        // Draw cropped image
        ctx.drawImage(
          img,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, cropWidth, cropHeight
        );
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            
            const croppedFile = new File([blob], file.name, { type: file.type });
            const previewUrl = URL.createObjectURL(croppedFile);
            
            resolve({ file: croppedFile, preview: previewUrl });
          },
          file.type,
          0.95
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      
      img.src = objectUrl;
    });
  };

  // Handle paste from clipboard
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    let maxImages = 10;
    if (videoEngine === 'veo') {
      const currentVeo3Mode = VEO3_MODES.find(m => m.id === veo3Mode);
      maxImages = currentVeo3Mode?.maxImages || 0;
    }

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;

    // Check limit
    if (files.length + imageFiles.length > maxImages) {
      toast({
        title: '图片数量超限',
        description: `当前模式最多支持 ${maxImages} 张图片`,
        variant: 'destructive',
      });
      return;
    }

    // Process pasted images - collect all processed files first
    const processedFiles: Array<{ data: string; mimeType: string; preview: string; file?: File }> = [];
    
    for (const file of imageFiles) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: '文件过大',
          description: `${file.name} 超过 50MB 限制`,
          variant: 'destructive',
        });
        continue;
      }

      try {
        if (videoEngine === 'veo') {
          // Veo mode: detect orientation and crop
          const img = new Image();
          const tempUrl = URL.createObjectURL(file);
          
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              URL.revokeObjectURL(tempUrl);
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(tempUrl);
              reject(new Error('Failed to load image'));
            };
            img.src = tempUrl;
          });
          
          const width = img.width;
          const height = img.height;
          
          // Determine target aspect ratio based on first image only
          let targetRatio: 'landscape' | 'portrait';
          if (width > height) {
            targetRatio = 'landscape';
          } else {
            targetRatio = 'portrait';
          }
          
          // Set aspect ratio based on first image only
          if (processedFiles.length === 0) {
            setAspectRatio(targetRatio);
          }
          
          // Crop image
          const { file: croppedFile, preview: previewUrl } = await cropImageToAspectRatio(file, targetRatio);
          
          processedFiles.push({ data: '', mimeType: file.type, preview: previewUrl, file: croppedFile });
        } else {
          // Sora mode: no cropping
          const previewUrl = URL.createObjectURL(file);
          processedFiles.push({ data: '', mimeType: file.type, preview: previewUrl, file });
        }
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }

    // Add all processed files at once
    if (processedFiles.length > 0) {
      setFiles((prev) => [...prev, ...processedFiles]);
      toast({
        title: '已粘贴图片',
        description: `成功添加 ${processedFiles.length} 张图片`,
      });
    }
  }, [files.length, videoEngine, veo3Mode]);

  // Setup paste event listener
  useEffect(() => {
    const uploadArea = uploadAreaRef.current;
    if (!uploadArea) return;

    const pasteHandler = (e: ClipboardEvent) => {
      handlePaste(e);
    };

    uploadArea.addEventListener('paste', pasteHandler as EventListener);
    return () => {
      uploadArea.removeEventListener('paste', pasteHandler as EventListener);
    };
  }, [handlePaste]);

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
      
      setFiles(restoredFiles);
    } else {
      setFiles([]);
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
      
      setFiles(restoredFiles);
    } else {
      setFiles([]);
    }
    
    // 滚动到顶部输入区域
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 构建提示词
  const buildPrompt = (): string => {
    switch (creationMode) {
      case 'remix':
        return prompt.trim(); // remix_target_id 单独传递
      case 'storyboard':
        return storyboardPrompt.trim();
      default:
        return prompt.trim();
    }
  };

  // 提取 Remix Target ID
  const extractRemixTargetId = (): string | undefined => {
    if (creationMode !== 'remix' || !remixUrl.trim()) return undefined;
    const url = remixUrl.trim();
    // 支持完整 URL 或纯 ID
    const match = url.match(/s_[a-f0-9]+/i);
    return match ? match[0] : url;
  };

  // 构建files数组 (lazy convert to base64 at submit time)
  const buildFiles = async (): Promise<{ mimeType: string; data: string }[]> => {
    const result: { mimeType: string; data: string }[] = [];
    for (const f of files) {
      let data = f.data;
      if (!data && f.file) {
        data = await fileToBase64(f.file);
      }
      result.push({ mimeType: f.mimeType, data });
    }
    return result;
  };

  // 检查是否达到每日限制
  const isVideoLimitReached = dailyLimits.videoLimit > 0 && dailyUsage.videoCount >= dailyLimits.videoLimit;

  // 验证输入
  const validateInput = (): string | null => {
    if (!currentModel) return '请选择模型';
    // 检查每日限制
    if (isVideoLimitReached) {
      return `今日视频生成次数已达上限 (${dailyLimits.videoLimit} 次)`;
    }
    switch (creationMode) {
      case 'remix':
        if (!remixUrl.trim()) return '请输入视频分享链接或ID';
        break;
      case 'storyboard':
        if (!storyboardPrompt.trim()) return '请输入分镜提示词';
        if (!storyboardPrompt.includes('[') || !storyboardPrompt.includes(']')) {
          return '分镜格式错误，请使用 [时长]描述 格式，如 [5.0s]猫猫跳舞';
        }
        break;
      default:
        if (!prompt.trim() && files.length === 0) return '请输入提示词或上传参考素材';
    }
    return null;
  };

  // 构建模型 ID（用于 Sora 类型）
  const resolveModelId = (): string => {
    return currentModel?.id || selectedModelId || '';
  };

  // 单次提交任务的核心函数
  const submitSingleTask = async (
    taskPrompt: string,
    taskFiles: { mimeType: string; data: string }[],
    options?: { remixTargetId?: string; styleId?: string }
  ) => {
    const modelId = resolveModelId();
    if (!modelId) {
      throw new Error('Video model is required');
    }

    const res = await fetch('/api/generate/sora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        prompt: taskPrompt,
        aspectRatio,
        duration,
        files: taskFiles,
        remix_target_id: options?.remixTargetId,
        style_id: options?.styleId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Video generation failed');
    }

    const taskType = data.data?.type || 'sora-video';
    const newTask: Task = {
      id: data.data.id,
      prompt: taskPrompt,
      model: modelId,
      type: taskType,
      status: 'pending',
      createdAt: Date.now(),
      referenceImages: taskFiles.map(f => `data:${f.mimeType};base64,${f.data}`),
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

    const taskPrompt = buildPrompt();
    const taskFiles = await buildFiles();

    const remixTargetId = extractRemixTargetId();
    // 仅普通模式可用风格
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      await submitSingleTask(taskPrompt, taskFiles, { remixTargetId, styleId });

      toast({
        title: '任务已提交',
        description: '任务已加入队列，可继续提交新任务',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + 1 }));

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        switch (creationMode) {
          case 'remix':
            setRemixUrl('');
            setPrompt('');
            break;
          case 'storyboard':
            setStoryboardPrompt('');
            break;
          default:
            setPrompt('');
            clearFiles();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
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

    const taskPrompt = buildPrompt();
    const taskFiles = await buildFiles();
    const remixTargetId = extractRemixTargetId();
    const styleId = creationMode === 'normal' ? selectedStyle || undefined : undefined;

    try {
      // 连续提交3个任务
      for (let i = 0; i < 3; i++) {
        await submitSingleTask(taskPrompt, taskFiles, { remixTargetId, styleId });
      }

      toast({
        title: '抽卡模式已启动',
        description: '已提交 3 个相同任务，等待结果中...',
      });

      // 更新今日使用量
      setDailyUsage(prev => ({ ...prev, videoCount: prev.videoCount + 3 }));

      // 清空输入（如果勾选了保留提示词则不清空）
      if (!keepPrompt) {
        switch (creationMode) {
          case 'remix':
            setRemixUrl('');
            setPrompt('');
            break;
          case 'storyboard':
            setStoryboardPrompt('');
            break;
          default:
            setPrompt('');
            clearFiles();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 引擎选择选项卡 */}
      <div className="flex items-center gap-2 p-1 bg-card/40 border border-border/50 rounded-xl w-fit">
        <button
          onClick={() => setVideoEngine('sora')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            videoEngine === 'sora'
              ? 'bg-foreground text-background'
              : 'text-foreground/60 hover:text-foreground/80'
          )}
        >
          <Sparkles className="w-4 h-4" />
          <span>Sora 视频</span>
        </button>
        <button
          onClick={() => setVideoEngine('veo')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            videoEngine === 'veo'
              ? 'bg-foreground text-background'
              : 'text-foreground/60 hover:text-foreground/80'
          )}
        >
          <Video className="w-4 h-4" />
          <span>Veo 视频</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">
            {videoEngine === 'sora' ? 'Sora 视频' : 'Veo 视频'}
          </h1>
          <p className="text-foreground/50 mt-1 font-light">
            {videoEngine === 'sora' 
              ? '支持普通生成、Remix、分镜等多种创作模式'
              : 'Google VEO 系列模型，支持文生视频、图生视频与图片融合'
            }
          </p>
        </div>
        {dailyLimits.videoLimit > 0 && (
          <div className={cn(
            "px-4 py-2 rounded-xl border text-sm",
            isVideoLimitReached
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-card/60 border-border/70 text-foreground/60"
          )}>
            今日: {dailyUsage.videoCount} / {dailyLimits.videoLimit}
          </div>
        )}
      </div>

      {/* 无可用模型提示 */}
      {modelsLoaded && availableModels.length === 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-200">视频生成功能已被管理员禁用</p>
        </div>
      )}

      {/* 每日限制达到提示 */}
      {isVideoLimitReached && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">今日视频生成次数已达上限，请明天再试</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] gap-6 items-start">
        <div className="lg:sticky lg:top-20 self-start">
          <div className={cn(
            "surface overflow-hidden backdrop-blur-sm",
            (availableModels.length === 0 || isVideoLimitReached) && "opacity-50 pointer-events-none"
          )}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-border/70 bg-gradient-to-r from-sky-500/10 to-emerald-500/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-card/60 border border-border/70 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-sky-300" />
                </div>
                <div>
                  <h2 className="text-base font-medium text-foreground">
                    {videoEngine === 'sora' ? 'Sora 视频' : 'Veo 视频'}
                  </h2>
                  <p className="text-xs text-foreground/40">AI 视频创作</p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Creation Mode Selection - 根据引擎类型显示不同选项 */}
              <OptionGroup label="生成模式" contentClassName="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {videoEngine === 'veo' ? (
                  // Veo 引擎：显示 T2V/I2V/R2V 模式
                  VEO3_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setVeo3Mode(mode.id as Veo3Mode);
                        // 清空超出限制的图片
                        if (files.length > mode.maxImages) {
                          setFiles(files.slice(0, mode.maxImages));
                        }
                      }}
                      className={cn(
                        'flex w-full flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all',
                        veo3Mode === mode.id
                          ? 'bg-foreground text-background border-transparent'
                          : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                      )}
                    >
                      <mode.icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))
                ) : (
                  // Sora 引擎：显示普通/Remix/分镜模式
                  CREATION_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setCreationMode(mode.id as CreationMode)}
                      className={cn(
                        'flex w-full flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border transition-all',
                        creationMode === mode.id
                          ? 'bg-foreground text-background border-transparent'
                          : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                      )}
                    >
                      <mode.icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{mode.label}</span>
                    </button>
                  ))
                )}
              </OptionGroup>

              {/* Model Selection - 显示过滤后的模型 */}
              <OptionGroup
                label="模型选择"
                contentClassName="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1"
              >
                {filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    title={model.description || model.name}
                    onClick={() => setSelectedModelId(model.id)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0',
                      selectedModelId === model.id
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    <span className="max-w-[140px] truncate">{model.name}</span>
                  </button>
                ))}
              </OptionGroup>

              {/* Aspect Ratio */}
              {currentModel && (
              <OptionGroup label="画面比例" contentClassName="grid grid-cols-2 gap-2">
                {[...currentModel.aspectRatios].sort((a, b) => {
                  // landscape first, then portrait
                  if (a.value === 'landscape') return -1;
                  if (b.value === 'landscape') return 1;
                  if (a.value === 'portrait') return -1;
                  if (b.value === 'portrait') return 1;
                  return 0;
                }).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                      aspectRatio === r.value
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    <span className="text-sm">{r.value === 'landscape' ? '▬' : '▮'}</span>
                    <span className="text-xs font-medium">{r.label}</span>
                  </button>
                ))}
              </OptionGroup>
              )}

              {/* Duration */}
              {currentModel && (
              <OptionGroup label="视频时长" contentClassName="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {currentModel.durations.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg border transition-all text-xs font-medium',
                      duration === d.value
                        ? 'bg-foreground text-background border-white'
                        : 'bg-card/60 text-foreground/70 border-border/70 hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </OptionGroup>
              )}

              {/* Mode-specific inputs - Sora 引擎 */}
              {videoEngine === 'sora' && (
                <>
                  {creationMode === 'normal' && (
                    <>
                      {/* 视频风格选择 - 仅 Sora 引擎的普通模式显示 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-foreground/50 uppercase tracking-wider">视频风格</label>
                          {selectedStyle && (
                            <button
                              onClick={() => setSelectedStyle(null)}
                              className="text-xs text-foreground/40 hover:text-foreground/70"
                            >
                              取消选择
                            </button>
                          )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                          {VIDEO_STYLES.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => setSelectedStyle(selectedStyle === style.id ? null : style.id)}
                              className={cn(
                                'relative w-20 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0',
                                selectedStyle === style.id
                                  ? 'border-sky-400 ring-2 ring-sky-400/30'
                                  : 'border-border/70 hover:border-border'
                              )}
                            >
                              <img
                                src={style.image}
                                alt={style.name}
                                className="w-full h-full object-cover"
                              />
                              <div className={cn(
                                'absolute inset-0 flex items-end justify-center pb-1.5 bg-gradient-to-t from-black/80 to-transparent',
                                selectedStyle === style.id && 'from-sky-900/70'
                              )}>
                                <span className="text-[10px] font-medium text-foreground">{style.name}</span>
                              </div>
                              {selectedStyle === style.id && (
                                <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-sky-500 rounded-full flex items-center justify-center">
                                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-foreground/40">可选：点选一个风格应用到生成</p>
                      </div>

                      {/* 参考素材上传 */}
                      {currentModel?.features.imageToVideo && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-foreground/50 uppercase tracking-wider">参考素材</label>
                            {files.length > 0 && (
                              <button
                                onClick={clearFiles}
                                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> 清除
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
                          {files.length === 0 ? (
                            <div className="space-y-2">
                              <div
                                ref={uploadAreaRef}
                                onClick={() => fileInputRef.current?.click()}
                                tabIndex={0}
                                className="border border-dashed border-border/70 rounded-lg p-5 text-center cursor-pointer hover:bg-card/70 hover:border-border transition-all focus:outline-none focus:ring-2 focus:ring-ring/30"
                              >
                                <Upload className="w-6 h-6 mx-auto text-foreground/40 mb-2" />
                                <p className="text-sm text-foreground/60">点击上传图片或按 Ctrl+V 粘贴</p>
                                <p className="text-xs text-foreground/40 mt-0.5">支持 JPG, PNG</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowImagePicker(true);
                                  loadImageLibrary();
                                }}
                                className="w-full py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
                              >
                                <User className="w-4 h-4" />
                                从我的图片库选择
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-2">
                              {files.map((f, i) => (
                                <div 
                                  key={i} 
                                  draggable
                                  onDragStart={() => handleDragStart(i)}
                                  onDragOver={(e) => handleDragOver(e, i)}
                                  onDragEnd={handleDragEnd}
                                  className={cn(
                                    "aspect-square rounded-lg overflow-hidden border border-border/70 relative group cursor-move transition-all",
                                    draggedIndex === i && "opacity-50 scale-95"
                                  )}
                                >
                                  {f.mimeType.startsWith('video') ? (
                                    <video src={f.preview} className="w-full h-full object-cover" />
                                  ) : (
                                    <img src={f.preview} className="w-full h-full object-cover" alt="" />
                                  )}
                                  <button
                                    onClick={() => {
                                      URL.revokeObjectURL(f.preview);
                                      setFiles(prev => prev.filter((_, idx) => idx !== i));
                                    }}
                                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Trash2 className="w-3 h-3 text-white" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 创作描述 */}
                      <div className="space-y-2 relative">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-foreground/50 uppercase tracking-wider">创作描述</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleEnhancePrompt}
                              disabled={enhancing || !prompt.trim()}
                              className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                                enhancing || !prompt.trim()
                                  ? 'text-foreground/40 cursor-not-allowed'
                                  : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                              )}
                            >
                              {enhancing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wand2 className="w-3 h-3" />
                              )}
                              <span>增强</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          ref={promptTextareaRef}
                          value={prompt}
                          onChange={(e) => handlePromptChange(e, setPrompt)}
                          placeholder="描述你想要生成的内容，越详细效果越好..."
                          className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                        />
                        {characterCards.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-foreground/50 uppercase tracking-wider">角色卡</span>
                              <span className="text-[10px] text-foreground/40">点击添加到描述</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                              {characterCards.map((card) => (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => handleAddCharacter(card.characterName)}
                                  className="flex items-center gap-2 px-2 py-1.5 bg-card/60 hover:bg-card/80 border border-border/70 hover:border-emerald-400/30 rounded-full text-xs text-foreground/80 transition-all shrink-0"
                                >
                                  <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500/20 to-sky-500/20 shrink-0">
                                    {card.avatarUrl ? (
                                      <img src={card.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <User className="w-3 h-3 text-emerald-300/60" />
                                      </div>
                                    )}
                                  </div>
                                  <span className="max-w-[120px] truncate">@{card.characterName}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {creationMode === 'remix' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                          <LinkIcon className="w-3 h-3" />
                          视频分享链接
                        </label>
                        <input
                          type="text"
                          value={remixUrl}
                          onChange={(e) => setRemixUrl(e.target.value)}
                          placeholder="https://sora.chatgpt.com/p/s_xxx 或 s_xxx"
                          className="w-full px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                        />
                        <p className="text-xs text-foreground/40">
                          输入 Sora 视频分享链接或ID，基于该视频继续创作
                        </p>
                      </div>
                      <div className="space-y-2 relative">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                            修改描述
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleEnhancePrompt}
                              disabled={enhancing || !prompt.trim()}
                              className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                                enhancing || !prompt.trim()
                                  ? 'text-foreground/40 cursor-not-allowed'
                                  : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                              )}
                            >
                              {enhancing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wand2 className="w-3 h-3" />
                              )}
                              <span>增强</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          ref={remixPromptRef}
                          value={prompt}
                          onChange={(e) => handlePromptChange(e, setPrompt)}
                          placeholder="描述你想要的修改，如：改成水墨画风格"
                          className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                        />
                      </div>
                    </>
                  )}

                  {creationMode === 'storyboard' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-foreground/50 uppercase tracking-wider flex items-center gap-2">
                          <Film className="w-3 h-3" />
                          分镜脚本
                        </label>
                        <button
                          type="button"
                          onClick={handleEnhancePrompt}
                          disabled={enhancing || !storyboardPrompt.trim()}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-all',
                            enhancing || !storyboardPrompt.trim()
                              ? 'text-foreground/40 cursor-not-allowed'
                              : 'text-sky-300 hover:text-sky-200 hover:bg-sky-500/10'
                          )}
                        >
                          {enhancing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Wand2 className="w-3 h-3" />
                          )}
                          <span>增强</span>
                        </button>
                      </div>
                      <textarea
                        value={storyboardPrompt}
                        onChange={(e) => setStoryboardPrompt(e.target.value)}
                        placeholder={`[5.0s]猫猫从飞机上跳伞\n[5.0s]猫猫降落\n[10.0s]猫猫在田野奔跑`}
                        className="w-full h-28 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm font-mono"
                      />
                      <p className="text-xs text-foreground/40">
                        格式：[时长]描述，每行一个镜头，如 [5.0s]描述内容
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Mode-specific inputs - Veo 引擎 */}
              {videoEngine === 'veo' && (
                <>
                  {/* 参考素材上传 - 根据 Veo 模式显示不同提示 */}
                  <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-foreground/50 uppercase tracking-wider">参考素材</label>
                        {files.length > 0 && (
                          <button
                            onClick={clearFiles}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> 清除
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
                      {files.length === 0 ? (
                        <div className="space-y-2">
                          <div
                            ref={uploadAreaRef}
                            onClick={() => fileInputRef.current?.click()}
                            tabIndex={0}
                            className="border border-dashed border-border/70 rounded-lg p-5 text-center cursor-pointer hover:bg-card/70 hover:border-border transition-all focus:outline-none focus:ring-2 focus:ring-ring/30"
                          >
                            <Upload className="w-6 h-6 mx-auto text-foreground/40 mb-2" />
                            <p className="text-sm text-foreground/60">点击上传图片或按 Ctrl+V 粘贴</p>
                            <p className="text-xs text-foreground/40 mt-0.5">
                              {veo3Mode === 't2v' && '文生视频模式无需上传图片'}
                              {veo3Mode === 'i2v' && '上传 1 张图片（首帧）或 2 张图片（首尾帧）'}
                              {veo3Mode === 'r2v' && '上传最多 3 张图片进行融合'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImagePicker(true);
                              loadImageLibrary();
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
                            {files.map((f, i) => (
                              <div 
                                key={i} 
                                draggable
                                onDragStart={() => handleDragStart(i)}
                                onDragOver={(e) => handleDragOver(e, i)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                  "aspect-square rounded-lg overflow-hidden border border-border/70 relative group cursor-move transition-all",
                                  draggedIndex === i && "opacity-50 scale-95"
                                )}
                              >
                                {f.mimeType.startsWith('video') ? (
                                  <video src={f.preview} className="w-full h-full object-cover" />
                                ) : (
                                  <img src={f.preview} className="w-full h-full object-cover" alt="" />
                                )}
                                <button
                                  onClick={() => {
                                    URL.revokeObjectURL(f.preview);
                                    setFiles(prev => prev.filter((_, idx) => idx !== i));
                                  }}
                                  className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3 text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowImagePicker(true);
                              loadImageLibrary();
                            }}
                            className="w-full py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <User className="w-4 h-4" />
                            从我的图片库选择
                          </button>
                        </div>
                      )}
                    </div>

                  {/* 创作描述 */}
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-foreground/50 uppercase tracking-wider">创作描述</label>
                      <div className="flex items-center gap-2">
                        <MagicWand
                          prompt={prompt}
                          onPromptChange={setPrompt}
                          disabled={enhancing || submitting}
                        />
                      </div>
                    </div>
                    <textarea
                      ref={promptTextareaRef}
                      value={prompt}
                      onChange={(e) => handlePromptChange(e, setPrompt)}
                      placeholder="描述你想要生成的内容，越详细效果越好..."
                      className="w-full h-20 px-3 py-2.5 bg-input/70 border border-border/70 text-foreground rounded-lg resize-none focus:outline-none focus:border-border focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60 text-sm"
                    />
                  </div>
                </>
              )}

              {/* Keep Prompt Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepPrompt}
                  onChange={(e) => setKeepPrompt(e.target.checked)}
                  className="w-4 h-4 rounded border-border/70 bg-card/60 text-foreground accent-sky-400 cursor-pointer"
                />
                <span className="text-sm text-foreground/50">保留输入</span>
              </label>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Generate Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={submitting}
                  className={cn(
                    'w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-medium transition-all',
                    submitting
                      ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                      : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:opacity-90'
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>提交中...</span>
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
                    disabled={submitting}
                    className={cn(
                      'h-[46px] w-full sm:w-[46px] flex items-center justify-center rounded-lg font-medium transition-all',
                      submitting
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

        <div className="min-w-0">
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

      {/* Image Picker Dialog */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">选择图片</h3>
              <button
                onClick={() => setShowImagePicker(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingLibrary ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-foreground/40" />
                </div>
              ) : imageLibrary.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
                  <AlertCircle className="w-12 h-12 mb-3" />
                  <p>暂无图片</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {imageLibrary.map((gen) => {
                    // Determine orientation from aspectRatio in params
                    const aspectRatio = gen.params?.aspectRatio as string | undefined;
                    const isLandscape = aspectRatio?.includes('16:9') || aspectRatio?.includes('landscape');
                    const isPortrait = aspectRatio?.includes('9:16') || aspectRatio?.includes('portrait');
                    
                    return (
                      <div
                        key={gen.id}
                        className="aspect-square rounded-lg overflow-hidden border-2 border-border/50 hover:border-sky-400 transition-all group relative cursor-pointer"
                        onClick={() => {
                          handleSelectFromLibrary(gen);
                          setShowImagePicker(false);
                        }}
                      >
                        <img
                          src={`/api/media/${gen.id}`}
                          alt={gen.prompt || ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            const badge = img.nextElementSibling?.querySelector('[data-resolution]');
                            if (badge) {
                              badge.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
                            }
                          }}
                        />
                        
                        {/* Resolution & Orientation Badge */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
                          <div className="px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white font-medium">
                            {isLandscape ? '横屏' : isPortrait ? '竖屏' : '方形'}
                          </div>
                          <div 
                            data-resolution 
                            className="px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white font-mono"
                          >
                            Loading...
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage(`/api/media/${gen.id}`);
                            }}
                            className="p-1.5 bg-black/70 backdrop-blur-sm rounded hover:bg-black/90 transition-colors"
                            title="查看大图"
                          >
                            <Maximize2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                        
                        {/* Select Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-sky-500 rounded-full p-2">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

    </div>
  );
}
