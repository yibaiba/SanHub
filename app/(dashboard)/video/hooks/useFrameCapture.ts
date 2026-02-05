'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/components/ui/toaster';

const MAX_CAPTURES_PER_VIDEO = 6;

interface CaptureState {
  captureCount: number;
  maxCaptures: number;
  isCapturing: boolean;
  previewData: {
    imageUrl: string;
    timestamp: number;
    width: number;
    height: number;
  } | null;
  isSaving: boolean;
}

interface UseFrameCaptureOptions {
  videoId: string;
  onCaptureSuccess?: (generationId: string) => void;
}

/**
 * 视频帧截取 Hook
 * 提供截取、预览、保存功能
 */
export function useFrameCapture({ videoId, onCaptureSuccess }: UseFrameCaptureOptions) {
  const [state, setState] = useState<CaptureState>({
    captureCount: 0,
    maxCaptures: MAX_CAPTURES_PER_VIDEO,
    isCapturing: false,
    previewData: null,
    isSaving: false,
  });

  const countFetchedRef = useRef(false);

  /**
   * 获取当前视频的截图数量
   */
  const fetchCaptureCount = useCallback(async () => {
    if (!videoId || countFetchedRef.current) return;

    try {
      const res = await fetch(`/api/capture/count?videoId=${videoId}`);
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          captureCount: data.data?.captureCount || 0,
          maxCaptures: data.data?.maxCaptures || MAX_CAPTURES_PER_VIDEO,
        }));
        countFetchedRef.current = true;
      }
    } catch (error) {
      console.error('[useFrameCapture] Failed to fetch capture count:', error);
    }
  }, [videoId]);

  /**
   * 从视频元素截取当前帧
   */
  const captureFrame = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (state.captureCount >= state.maxCaptures) {
        toast({
          title: '截图上限',
          description: `该视频截图已达上限 (${state.maxCaptures} 张)`,
          variant: 'destructive',
        });
        return;
      }

      setState((prev) => ({ ...prev, isCapturing: true }));

      try {
        // 创建 Canvas 绘制当前帧
        const canvas = document.createElement('canvas');
        const width = videoElement.videoWidth;
        const height = videoElement.videoHeight;

        if (!width || !height) {
          throw new Error('视频尚未加载完成');
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('无法创建 Canvas 上下文');
        }

        ctx.drawImage(videoElement, 0, 0, width, height);

        // 转换为 JPEG Blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
            'image/jpeg',
            0.95
          );
        });

        // 转换为 Data URL 用于预览
        const imageUrl = URL.createObjectURL(blob);

        setState((prev) => ({
          ...prev,
          isCapturing: false,
          previewData: {
            imageUrl,
            timestamp: videoElement.currentTime,
            width,
            height,
          },
        }));
      } catch (error) {
        console.error('[useFrameCapture] Capture failed:', error);
        toast({
          title: '截取失败',
          description: error instanceof Error ? error.message : '截取失败',
          variant: 'destructive',
        });
        setState((prev) => ({ ...prev, isCapturing: false }));
      }
    },
    [state.captureCount, state.maxCaptures]
  );

  /**
   * 取消预览，清理资源
   */
  const cancelPreview = useCallback(() => {
    if (state.previewData?.imageUrl) {
      URL.revokeObjectURL(state.previewData.imageUrl);
    }
    setState((prev) => ({ ...prev, previewData: null }));
  }, [state.previewData?.imageUrl]);

  /**
   * 保存截图到服务器
   */
  const saveCapture = useCallback(async () => {
    if (!state.previewData) return;

    setState((prev) => ({ ...prev, isSaving: true }));

    try {
      // 将 Blob URL 转换为 Base64
      const response = await fetch(state.previewData.imageUrl);
      const blob = await response.blob();

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 调用保存 API
      const saveRes = await fetch('/api/capture/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceGenerationId: videoId,
          imageData: base64,
          timestamp: state.previewData.timestamp,
          width: state.previewData.width,
          height: state.previewData.height,
        }),
      });

      if (!saveRes.ok) {
        const errorData = await saveRes.json();
        throw new Error(errorData.error || '保存失败');
      }

      const result = await saveRes.json();
      const newCount = result.captureCount || state.captureCount + 1;

      // 清理预览资源
      URL.revokeObjectURL(state.previewData.imageUrl);

      setState((prev) => ({
        ...prev,
        captureCount: newCount,
        previewData: null,
        isSaving: false,
      }));

      toast({
        title: '保存成功',
        description: `已保存到图片库 (${newCount}/${state.maxCaptures})`,
      });

      if (onCaptureSuccess && result.data?.id) {
        onCaptureSuccess(result.data.id);
      }
    } catch (error) {
      console.error('[useFrameCapture] Save failed:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存失败',
        variant: 'destructive',
      });
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [state.previewData, state.captureCount, state.maxCaptures, videoId, onCaptureSuccess]);

  /**
   * 格式化时间戳为可读格式
   */
  const formatTimestamp = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }, []);

  return {
    // 状态
    captureCount: state.captureCount,
    maxCaptures: state.maxCaptures,
    isCapturing: state.isCapturing,
    previewData: state.previewData,
    isSaving: state.isSaving,
    isLimitReached: state.captureCount >= state.maxCaptures,

    // 方法
    fetchCaptureCount,
    captureFrame,
    cancelPreview,
    saveCapture,
    formatTimestamp,
  };
}
