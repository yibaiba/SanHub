'use client';

import { X, ImagePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CapturePreviewDialogProps {
  open: boolean;
  imageUrl: string;
  timestamp: string; // 格式: "01:23.45"
  resolution: { width: number; height: number };
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * 视频帧截图预览确认对话框
 * 显示截取的帧预览、元数据信息，提供取消和保存操作
 */
export function CapturePreviewDialog({
  open,
  imageUrl,
  timestamp,
  resolution,
  saving = false,
  onCancel,
  onSave,
}: CapturePreviewDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card/90 border border-border/70 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <ImagePlus className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">保存截图</h3>
              <p className="text-xs text-foreground/50">预览并确认保存到图片库</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-2 hover:bg-card/80 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-foreground/60" />
          </button>
        </div>

        {/* Preview Image */}
        <div className="p-6">
          <div className="relative rounded-xl overflow-hidden bg-black/40 border border-border/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Captured frame"
              className="w-full max-h-[50vh] object-contain"
            />
          </div>

          {/* Metadata */}
          <div className="mt-4 flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-foreground/70">
            <div className="flex items-center gap-2">
              <span className="text-foreground/40">时间戳:</span>
              <span className="font-mono bg-card/60 px-2 py-1 rounded text-foreground">
                {timestamp}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground/40">分辨率:</span>
              <span className="font-mono bg-card/60 px-2 py-1 rounded text-foreground">
                {resolution.width} x {resolution.height}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border/50 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-card/60 border border-border/70 text-foreground text-sm font-medium hover:bg-card/80 transition-colors disabled:opacity-50 order-2 sm:order-1"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={cn(
              'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all order-1 sm:order-2',
              saving
                ? 'bg-card/60 text-foreground/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-white hover:opacity-90 active:scale-95'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-4 h-4" />
                <span>保存到图库</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
