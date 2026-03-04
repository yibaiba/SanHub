'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Download, Maximize2, X, Play, Image as ImageIcon, Sparkles, Loader2, AlertCircle, Copy, ExternalLink, RotateCcw, Camera } from 'lucide-react';
import type { Generation } from '@/types';
import { formatDate, truncate } from '@/lib/utils';
import { downloadAsset } from '@/lib/download';
import { toast } from '@/components/ui/toaster';

import { UpscaleControl } from './UpscaleControl';
import { CaptureButton, CapturePreviewDialog } from '@/components/video';

// 任务类型
export interface Task {
  id: string;
  prompt: string;
  model?: string;
  type?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number; // 0-100
  errorMessage?: string;
  result?: Generation;
  createdAt: number;
  referenceImages?: string[]; // data URLs
}

interface ResultGalleryProps {
  generations: Generation[];
  tasks?: Task[];
  onRemoveTask?: (taskId: string) => void;
  onRestoreParams?: (generation: Generation) => void;
  onRestoreTaskParams?: (task: Task) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  onDeleteGeneration?: (generationId: string) => void;
}

function getDisplayCost(gen: Pick<Generation, 'cost' | 'status' | 'balancePrecharged' | 'balanceRefunded'>): number {
  const cost = Number(gen.cost) || 0;
  if (cost <= 0) return 0;
  if (gen.balancePrecharged === false) return 0;
  if (gen.balanceRefunded) return 0;
  if (gen.status === 'failed' || gen.status === 'cancelled') return 0;
  return cost;
}

export function ResultGallery({ generations, tasks = [], onRemoveTask, onRestoreParams, onRestoreTaskParams, onLoadMore, hasMore = false, loading = false, onDeleteGeneration }: ResultGalleryProps) {
  const [selected, setSelected] = useState<Generation | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const renderMoreRef = useRef<HTMLDivElement>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [realResolution, setRealResolution] = useState<string | null>(null);
  const [showUpscaleDialog, setShowUpscaleDialog] = useState<string | null>(null);

  // 视频帧截图状态
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturePreview, setCapturePreview] = useState<{
    imageUrl: string;
    timestamp: number;
    width: number;
    height: number;
  } | null>(null);
  const [isSavingCapture, setIsSavingCapture] = useState(false);
  const captureCountFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    setRealResolution(null);
  }, [selected]);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (generations.length === 0) return 0;
      if (prev === 0) return Math.min(12, generations.length);
      return Math.min(prev, generations.length);
    });
  }, [generations.length]);

  // 获取视频截图数量
  const fetchCaptureCount = useCallback(async (videoId: string) => {
    if (captureCountFetchedRef.current === videoId) return;
    try {
      const res = await fetch(`/api/capture/count?videoId=${videoId}`);
      if (res.ok) {
        const data = await res.json();
        setCaptureCount(data.data?.captureCount || 0);
        captureCountFetchedRef.current = videoId;
      }
    } catch (error) {
      console.error('[ResultGallery] Failed to fetch capture count:', error);
    }
  }, []);

  // 当选中视频变化时重置截图状态并获取计数
  useEffect(() => {
    if (selected && isVideo(selected)) {
      setCaptureCount(0);
      setVideoReady(false);
      captureCountFetchedRef.current = null;
      fetchCaptureCount(selected.id);
    }
  }, [selected, fetchCaptureCount]);

  // 截取当前帧
  const handleCaptureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !selected) return;

    if (captureCount >= 6) {
      toast({ title: '该视频截图已达上限 (6 张)', variant: 'destructive' });
      return;
    }

    setIsCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        throw new Error('视频尚未加载完成');
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      ctx.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          'image/jpeg',
          0.95
        );
      });

      const imageUrl = URL.createObjectURL(blob);

      setCapturePreview({
        imageUrl,
        timestamp: video.currentTime,
        width,
        height,
      });
    } catch (error) {
      console.error('[ResultGallery] Capture failed:', error);
      toast({ title: error instanceof Error ? error.message : '截取失败', variant: 'destructive' });
    } finally {
      setIsCapturing(false);
    }
  }, [selected, captureCount]);

  // 取消截图预览
  const cancelCapturePreview = useCallback(() => {
    if (capturePreview?.imageUrl) {
      URL.revokeObjectURL(capturePreview.imageUrl);
    }
    setCapturePreview(null);
  }, [capturePreview?.imageUrl]);

  // 保存截图
  const saveCaptureToLibrary = useCallback(async () => {
    if (!capturePreview || !selected) return;

    setIsSavingCapture(true);
    try {
      // Blob URL 转 Base64
      const response = await fetch(capturePreview.imageUrl);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const saveRes = await fetch('/api/capture/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceGenerationId: selected.id,
          imageData: base64,
          timestamp: capturePreview.timestamp,
          width: capturePreview.width,
          height: capturePreview.height,
        }),
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json();
        throw new Error(errorData.error || '保存失败');
      }

      const result = await saveRes.json();
      const newCount = result.captureCount || captureCount + 1;

      URL.revokeObjectURL(capturePreview.imageUrl);
      setCapturePreview(null);
      setCaptureCount(newCount);

      toast({ title: `已保存到图片库 (${newCount}/6)` });
    } catch (error) {
      console.error('[ResultGallery] Save capture failed:', error);
      toast({ title: error instanceof Error ? error.message : '保存失败', variant: 'destructive' });
    } finally {
      setIsSavingCapture(false);
    }
  }, [capturePreview, selected, captureCount]);

  // 格式化时间戳
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const downloadFile = async (url: string, id: string, type: string) => {
    if (!url) {
      toast({
        title: '下载失败',
        description: '文件地址不存在',
        variant: 'destructive',
      });
      return;
    }

    const extension = type.includes('video') ? 'mp4' : 'png';
    try {
      // Add ?raw=true to force server proxy (avoid CORS issues with 302 redirects)
      const downloadUrl = url.startsWith('/api/media/') 
        ? `${url}?raw=true` 
        : url;
      await downloadAsset(downloadUrl, `sanhub-${id}.${extension}`);
    } catch (err) {
      console.error('Download failed', err);
      toast({
        title: '下载失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteGeneration = async (generationId: string) => {
    if (!onDeleteGeneration) return;
    
    setDeletingIds(prev => new Set(prev).add(generationId));
    
    try {
      const res = await fetch('/api/user/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'single', id: generationId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除失败');
      }

      onDeleteGeneration(generationId);
      toast({ title: '已删除' });
      setSelected(null); // Close lightbox after deletion
    } catch (err) {
      console.error('Delete failed', err);
      toast({
        title: '删除失败',
        description: err instanceof Error ? err.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(generationId);
        return next;
      });
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  const confirmDelete = (generationId: string) => {
    setDeleteTarget(generationId);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const isVideo = (gen: Generation) => gen.type.includes('video');
  const isTaskVideo = (task: Task) => task.type?.includes('video') || task.model?.includes('video');

  // 过滤出正在进行的任务（不包括已完成的，已完成的会在 generations 中显示）
  // 同时排除已经存在于 generations 中的任务（通过 id 匹配）
  const generationIds = new Set(generations.map(g => g.id));
  const activeTasks = tasks.filter(t => 
    (t.status === 'pending' || t.status === 'processing') && !generationIds.has(t.id)
  );
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
  
  const totalCount = generations.length + activeTasks.length;
  const visibleGenerations = useMemo(
    () => generations.slice(0, visibleCount),
    [generations, visibleCount]
  );
  const hasMoreGenerations = visibleCount < generations.length;

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const target = renderMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loading) return;
        onLoadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, loading]);

  const handleRenderMore = () => {
    if (onLoadMore && hasMore && !loading) {
      onLoadMore();
    } else {
      setVisibleCount((prev) => Math.min(prev + 12, generations.length));
    }
  };

  return (
    <>
      <div className="surface overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-card/60 border border-border/70 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">生成结果</h2>
              <p className="text-sm text-foreground/40">
                {activeTasks.length > 0 ? `${activeTasks.length} 个任务进行中 · ` : ''}
                {generations.length} 个作品
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {totalCount === 0 && failedTasks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl">
              <div className="w-16 h-16 bg-card/60 rounded-2xl flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-foreground/30" />
              </div>
              <p className="text-foreground/50">暂无生成结果</p>
              <p className="text-foreground/30 text-sm mt-1">开始创作你的第一个作品</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* 正在进行的任务 */}
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-sky-500/30"
                >
                  {/* 加载动画背景 */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-sky-500/10 to-emerald-500/10">
                    <Loader2 className="w-8 h-8 text-foreground/60 animate-spin mb-2" />
                    <p className="text-xs text-foreground/60">
                      {task.status === 'processing' ? '生成中...' : '排队中...'}
                    </p>
                    {/* 进度显示 */}
                    {typeof task.progress === 'number' && task.progress > 0 && (
                      <div className="mt-2 w-24">
                        <div className="h-1.5 bg-card/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-foreground/50 text-center mt-1">{task.progress}%</p>
                      </div>
                    )}
                  </div>
                  {/* 任务类型标签 */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-sky-500/40 backdrop-blur-sm rounded-md flex items-center gap-1">
                    {isTaskVideo(task) ? (
                      <>
                        <Play className="w-3 h-3 text-foreground" />
                        <span className="text-[10px] text-foreground">VIDEO</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3 h-3 text-foreground" />
                        <span className="text-[10px] text-foreground">IMAGE</span>
                      </>
                    )}
                  </div>
                  {/* 取消按钮 */}
                  {onRemoveTask && (
                    <button
                      onClick={() => onRemoveTask(task.id)}
                      className="absolute top-2 right-2 p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-red-500/40 transition-colors"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  )}
                  {/* 提示词 */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{task.prompt || '无提示词'}</p>
                  </div>
                </div>
              ))}

              {/* 失败的任务 */}
              {failedTasks.map((task) => (
                <div
                  key={task.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-red-500/30"
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10">
                    <AlertCircle className="w-8 h-8 text-red-300 mb-2" />
                    <p className="text-xs text-red-300">
                      {task.status === 'cancelled' ? '已取消' : '生成失败'}
                    </p>
                    {task.errorMessage && (
                      <p className="text-xs text-red-300/70 mt-1 px-4 text-center truncate max-w-full">
                        {task.errorMessage}
                      </p>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    {onRestoreTaskParams && (
                      <button
                        onClick={() => {
                          onRestoreTaskParams(task);
                          toast({ title: '已恢复参数' });
                        }}
                        className="p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-emerald-500/40 transition-colors"
                        title="恢复参数"
                      >
                        <RotateCcw className="w-3 h-3 text-foreground" />
                      </button>
                    )}
                    {onRemoveTask && (
                      <button
                        onClick={() => onRemoveTask(task.id)}
                        className="p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-card/90 transition-colors"
                        title="移除任务"
                      >
                        <X className="w-3 h-3 text-foreground" />
                      </button>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                    <p className="text-xs text-foreground/80 truncate">{task.prompt || '无提示词'}</p>
                  </div>
                </div>
              ))}

              {/* 已完成的生成结果 */}
              {visibleGenerations.map((gen) => (
                <div
                  key={gen.id}
                  className="group relative aspect-video bg-card/60 rounded-xl overflow-hidden border border-border/70 hover:border-border transition-all"
                >
                  <div 
                    className="w-full h-full cursor-pointer"
                    onClick={() => setSelected(gen)}
                  >
                    {isVideo(gen) ? (
                      <>
                        <video
                          src={gen.resultUrl}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          preload="metadata"
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                        <div className="absolute top-2 left-2 px-2 py-1 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md flex items-center gap-1">
                          <Play className="w-3 h-3 text-foreground" />
                          <span className="text-[10px] text-foreground">VIDEO</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <img
                          src={gen.resultUrl}
                          alt={gen.prompt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                              const badge = img.parentElement?.querySelector('.resolution-badge');
                              if (badge) {
                                badge.textContent = `${img.naturalWidth}x${img.naturalHeight}`;
                              }
                            }
                          }}
                        />
                        {(gen.params?.imageSize || gen.params?.size || gen.params?.aspectRatio) && (
                          <div className="absolute top-2 left-2 px-2 py-1 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md flex items-center gap-1 pointer-events-none">
                            <span className="text-[10px] text-foreground font-medium resolution-badge">
                              {gen.params.imageSize || gen.params.size || gen.params.aspectRatio}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <div className="w-12 h-12 bg-card/70 border border-border/70 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <Maximize2 className="w-5 h-5 text-foreground" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/80 via-background/30 to-transparent">
                      <p className="text-xs text-foreground/80 truncate">{gen.prompt || '无提示词'}</p>
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    {onRestoreParams && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestoreParams(gen);
                          toast({ title: '已恢复参数' });
                        }}
                        className="p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-emerald-500/40 transition-colors"
                        title="恢复参数"
                      >
                        <RotateCcw className="w-3 h-3 text-foreground" />
                      </button>
                    )}
                    {onDeleteGeneration && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(gen.id);
                        }}
                        disabled={deletingIds.has(gen.id)}
                        className="p-1.5 bg-card/70 border border-border/70 backdrop-blur-sm rounded-md hover:bg-red-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="删除记录"
                      >
                        {deletingIds.has(gen.id) ? (
                          <Loader2 className="w-3 h-3 text-foreground animate-spin" />
                        ) : (
                          <X className="w-3 h-3 text-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(hasMoreGenerations || hasMore) && (
        <div ref={renderMoreRef} className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleRenderMore}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-card/60 border border-border/70 text-foreground/70 text-sm hover:text-foreground hover:border-border transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div className="min-h-full flex flex-col items-center justify-start p-4 md:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-[90vw] flex items-center justify-center">
              {isVideo(selected) ? (
                <>
                  <video
                    ref={videoRef}
                    src={selected.resultUrl}
                    className="max-w-full max-h-[50vh] md:max-h-[55vh] w-auto h-auto rounded-xl border border-border/70"
                    controls
                    autoPlay
                    loop
                    crossOrigin="anonymous"
                    onCanPlay={() => setVideoReady(true)}
                  />
                  {selected.type === 'flow-video' && (
                    <div className="absolute top-4 right-16 z-10">
                      <button
                        onClick={() => setShowUpscaleDialog(selected.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-purple-500 transition-colors text-sm font-medium shadow-lg"
                      >
                        <Sparkles className="w-4 h-4" />
                        超分
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <img
                  src={selected.resultUrl}
                  alt={selected.prompt}
                  className="max-w-full max-h-[50vh] md:max-h-[55vh] w-auto h-auto rounded-xl border border-border/70 object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setRealResolution(`${img.naturalWidth}x${img.naturalHeight}`);
                    }
                  }}
                />
              )}
            </div>

            <div className="w-full max-w-3xl mt-4 md:mt-6 px-2 pb-4">
              <div className="flex flex-col gap-4">
                <div className="min-w-0">
                  <p className="text-foreground text-sm leading-relaxed">{truncate(selected.prompt || '无提示词', 150)}</p>
                  <p className="text-foreground/40 text-xs mt-2">
                    {formatDate(selected.createdAt)} · 消耗 {getDisplayCost(selected)} 积分
                    {(realResolution || selected.params?.imageSize || selected.params?.size || selected.params?.aspectRatio) && (
                      <> · {realResolution || selected.params.imageSize || selected.params.size || selected.params.aspectRatio}</>
                    )}
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-foreground/40 text-xs shrink-0 w-14">URL</span>
                      <span className="text-foreground/70 text-xs break-all flex-1">{selected.resultUrl || '-'}</span>
                      {selected.resultUrl && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.resultUrl);
                            toast({ title: '已复制 URL' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制 URL"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {typeof selected.params?.permalink === 'string' && selected.params.permalink && (
                      <div className="flex items-start gap-2">
                        <span className="text-foreground/40 text-xs shrink-0 w-14">详情</span>
                        <a
                          href={selected.params.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground/70 text-xs break-all flex-1 hover:text-foreground underline underline-offset-2"
                        >
                          {selected.params.permalink}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.params.permalink as string);
                            toast({ title: '已复制 Permalink' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制 Permalink"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <a
                          href={selected.params.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="打开链接"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}

                    {typeof selected.params?.revised_prompt === 'string' && selected.params.revised_prompt && (
                      <div className="flex items-start gap-2">
                        <span className="text-foreground/40 text-xs shrink-0 w-14">改写</span>
                        <span className="text-foreground/70 text-xs break-words flex-1">{selected.params.revised_prompt}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selected.params.revised_prompt as string);
                            toast({ title: '已复制改写提示词' });
                          }}
                          className="shrink-0 p-1.5 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-lg transition-colors"
                          title="复制改写提示词"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto">
                  {onRestoreParams && (
                    <button
                      onClick={() => {
                        onRestoreParams(selected);
                        toast({ title: '已恢复参数' });
                        setSelected(null);
                      }}
                      className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
                    >
                      <RotateCcw className="w-4 h-4" />
                      回退参数
                    </button>
                  )}
                  <button
                    onClick={() => downloadFile(selected.resultUrl, selected.id, selected.type)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  {/* 视频截图按钮 */}
                  {isVideo(selected) && (
                    <CaptureButton
                      current={captureCount}
                      max={6}
                      loading={isCapturing}
                      disabled={!videoReady}
                      onClick={handleCaptureFrame}
                    />
                  )}
                  {isVideo(selected) && selected.type === 'flow-video' && (
                    <button
                      onClick={() => setShowUpscaleDialog(selected.id)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-xl hover:opacity-90 transition-colors text-sm font-medium"
                    >
                      <Sparkles className="w-4 h-4" />
                      超分 Upscale
                    </button>
                  )}
                  {onDeleteGeneration && (
                    <button
                      onClick={() => confirmDelete(selected.id)}
                      disabled={deletingIds.has(selected.id)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-xl hover:opacity-90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingIds.has(selected.id) ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          删除中
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4" />
                          删除
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-card/60 text-foreground border border-border/70 rounded-xl hover:bg-card/80 transition-colors text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && deleteTarget && (
        <div
          className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={cancelDelete}
        >
          <div
            className="bg-card/90 border border-border/70 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-foreground mb-2">确认删除</h3>
                <p className="text-sm text-foreground/70 mb-6">
                  确定要删除这条生成记录吗？此操作无法撤销。
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={cancelDelete}
                    className="px-4 py-2 rounded-lg bg-card/60 border border-border/70 text-foreground text-sm hover:bg-card/80 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => deleteTarget && handleDeleteGeneration(deleteTarget)}
                    disabled={deletingIds.has(deleteTarget)}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {deletingIds.has(deleteTarget) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        删除中...
                      </>
                    ) : (
                      '确认删除'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upscale Dialog */}
      {showUpscaleDialog && (
        <div
          className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setShowUpscaleDialog(null)}
        >
          <div
            className="bg-card/90 border border-border/70 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-foreground mb-2">视频超分 (Upscale)</h3>
                <p className="text-sm text-foreground/70">
                  将视频画质提升至 1080P 或 4K。处理过程需要一定时间。
                </p>
              </div>
            </div>
            <UpscaleControl 
              mediaId={showUpscaleDialog} 
              onClose={() => setShowUpscaleDialog(null)}
            />
          </div>
        </div>
      )}

      {/* Capture Preview Dialog */}
      {capturePreview && (
        <CapturePreviewDialog
          open={true}
          imageUrl={capturePreview.imageUrl}
          timestamp={formatTimestamp(capturePreview.timestamp)}
          resolution={{ width: capturePreview.width, height: capturePreview.height }}
          saving={isSavingCapture}
          onCancel={cancelCapturePreview}
          onSave={saveCaptureToLibrary}
        />
      )}
    </>
  );
}
