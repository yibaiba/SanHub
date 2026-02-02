'use client';

/**
 * Storyboard Splitter Component
 *
 * Grid-based image cropping tool for splitting storyboard images into individual frames.
 * Supports adjustable grid size (2-8 rows/cols) and visual preview.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Grid3X3, Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SliceData {
  blob: Blob;
  dataUrl: string;
  index: number;
  row: number;
  col: number;
  width: number;
  height: number;
}

interface StoryboardSplitterProps {
  imageUrl: string;
  onConfirm: (slices: SliceData[]) => void;
  onCancel: () => void;
}

export function StoryboardSplitter({ imageUrl, onConfirm, onCancel }: StoryboardSplitterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [slices, setSlices] = useState<SliceData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
    };
    img.onerror = (e) => {
      console.error('[StoryboardSplitter] Failed to load image:', e);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw grid overlay
  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container while maintaining aspect ratio
    const containerWidth = 600;
    const scale = containerWidth / image.width;
    const containerHeight = image.height * scale;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Draw image
    ctx.drawImage(image, 0, 0, containerWidth, containerHeight);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const cellWidth = containerWidth / cols;
    const cellHeight = containerHeight / rows;

    // Vertical lines
    for (let i = 1; i < cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, containerHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = 1; i < rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellHeight);
      ctx.lineTo(containerWidth, i * cellHeight);
      ctx.stroke();
    }

    // Draw cell numbers
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let cellIndex = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const centerX = c * cellWidth + cellWidth / 2;
        const centerY = r * cellHeight + cellHeight / 2;

        // Background circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
        ctx.fill();

        // Number
        ctx.fillStyle = 'white';
        ctx.fillText(`${cellIndex + 1}`, centerX, centerY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

        cellIndex++;
      }
    }
  }, [image, rows, cols]);

  // Generate slices
  const generateSlices = useCallback(async () => {
    if (!image) return;

    setIsProcessing(true);
    const newSlices: SliceData[] = [];

    const cellWidth = image.width / cols;
    const cellHeight = image.height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cellWidth;
        tempCanvas.height = cellHeight;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
          tempCtx.drawImage(
            image,
            c * cellWidth,
            r * cellHeight,
            cellWidth,
            cellHeight,
            0,
            0,
            cellWidth,
            cellHeight
          );

          const dataUrl = tempCanvas.toDataURL('image/png');
          const blob = await new Promise<Blob>((resolve) => {
            tempCanvas.toBlob((b) => resolve(b!), 'image/png');
          });

          newSlices.push({
            blob,
            dataUrl,
            index: r * cols + c,
            row: r,
            col: c,
            width: cellWidth,
            height: cellHeight,
          });
        }
      }
    }

    setSlices(newSlices);
    setIsProcessing(false);
  }, [image, rows, cols]);

  // Auto-generate slices when grid changes
  useEffect(() => {
    if (image) {
      generateSlices();
    }
  }, [image, rows, cols, generateSlices]);

  // Handle confirm
  const handleConfirm = () => {
    if (slices.length > 0) {
      onConfirm(slices);
    }
  };

  // Adjust rows/cols
  const adjustRows = (delta: number) => {
    setRows((prev) => Math.min(8, Math.max(1, prev + delta)));
  };

  const adjustCols = (delta: number) => {
    setCols((prev) => Math.min(8, Math.max(1, prev + delta)));
  };

  const resetGrid = () => {
    setRows(2);
    setCols(3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-900 rounded-xl max-w-[900px] w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <Grid3X3 className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">拆分分镜</h2>
            <span className="text-sm text-zinc-400">
              {rows} × {cols} = {rows * cols} 个切片
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-6">
            {/* Canvas Preview */}
            <div className="flex-1">
              <div className="bg-zinc-800 rounded-lg p-4">
                <canvas
                  ref={canvasRef}
                  className="w-full rounded-lg"
                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                />
              </div>

              {/* Grid Controls */}
              <div className="mt-4 flex items-center gap-6">
                {/* Rows */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400 w-8">行:</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => adjustRows(-1)}
                    disabled={rows <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-8 text-center text-white font-medium">{rows}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => adjustRows(1)}
                    disabled={rows >= 8}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Cols */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400 w-8">列:</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => adjustCols(-1)}
                    disabled={cols <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-8 text-center text-white font-medium">{cols}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => adjustCols(1)}
                    disabled={cols >= 8}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Reset */}
                <Button variant="ghost" size="sm" onClick={resetGrid} className="text-zinc-400">
                  <RotateCcw className="w-4 h-4 mr-1" />
                  重置
                </Button>
              </div>
            </div>

            {/* Slices Preview */}
            <div className="w-[280px]">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">切片预览</h3>
              <div
                className="grid gap-2 max-h-[400px] overflow-y-auto pr-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)`,
                }}
              >
                {slices.map((slice, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      selectedSlice === idx
                        ? 'border-purple-500 ring-2 ring-purple-500/30'
                        : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                    onClick={() => setSelectedSlice(idx)}
                  >
                    <img
                      src={slice.dataUrl}
                      alt={`切片 ${idx + 1}`}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-center py-0.5 text-white">
                      {idx + 1}
                    </div>
                  </div>
                ))}
              </div>

              {slices.length > 0 && (
                <div className="mt-3 text-xs text-zinc-500">
                  每个切片尺寸: {Math.round(slices[0]?.width || 0)} × {Math.round(slices[0]?.height || 0)} px
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
          <div className="text-sm text-zinc-400">
            拆分后将自动放大到 1080p 并创建节点组
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isProcessing || slices.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isProcessing ? (
                '处理中...'
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  确认拆分 ({slices.length} 个)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoryboardSplitter;
