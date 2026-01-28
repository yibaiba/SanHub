'use client';

import { useRef, useState } from 'react';
import { Upload, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import type { Generation } from '@/types';

type VideoEngine = 'sora' | 'veo';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';
type CreationMode = 'normal' | 'remix' | 'storyboard';

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

export interface ReferenceImageUploaderProps {
  engine: VideoEngine;
  mode: Veo3Mode | CreationMode;
  files: FileData[];
  onChange: (files: FileData[]) => void;
  maxImages: number;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDrop?: (e: React.DragEvent) => Promise<void>;
}

export function ReferenceImageUploader({
  engine,
  mode,
  files,
  onChange,
  maxImages,
  onFileUpload,
  onDrop,
}: ReferenceImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [imageLibrary, setImageLibrary] = useState<Generation[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const loadImageLibrary = async () => {
    setLoadingLibrary(true);
    try {
      const res = await fetch('/api/user/history?limit=50&page=1');
      if (res.ok) {
        const data = await res.json();
        const images = (data.data || []).filter(
          (g: Generation) =>
            g.type.includes('image') || g.type === 'sora-image' || g.type === 'flow-image'
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

  const handleSelectFromLibrary = async (generation: Generation) => {
    try {
      const imageUrl = generation.resultUrl;
      if (!imageUrl) {
        toast({
          title: '无效图片',
          description: '该图片没有有效的 URL',
          variant: 'destructive',
        });
        return;
      }

      if (files.length >= maxImages) {
        toast({
          title: '图片数量超限',
          description: `当前模式最多支持 ${maxImages} 张图片`,
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch(`/api/media/${generation.id}?raw=true`, {
        cache: 'force-cache', // Use browser cache if available
      });
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const file = new File([blob], `image-${generation.id}.jpg`, { type: blob.type });
      const previewUrl = URL.createObjectURL(file);
      
      onChange([...files, { data: '', mimeType: file.type, preview: previewUrl, file }]);

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

  const clearFiles = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    onChange([]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(files[index].preview);
    onChange(files.filter((_, idx) => idx !== index));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newFiles = [...files];
    const draggedFile = newFiles[draggedIndex];
    newFiles.splice(draggedIndex, 1);
    newFiles.splice(index, 0, draggedFile);

    onChange(newFiles);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDropOnArea = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) {
      onDrop(e);
    }
  };

  const handleDragOverArea = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const getHintText = () => {
    if (engine === 'veo') {
      if (mode === 't2v') return '文生视频模式无需上传图片';
      if (mode === 'i2v') return '上传 1 张图片（首帧）或 2 张图片（首尾帧）';
      if (mode === 'r2v') return '上传最多 3 张图片进行融合';
    }
    return '支持 JPG, PNG';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-foreground/50 uppercase tracking-wider">
          参考素材
        </label>
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
        onChange={onFileUpload}
      />

      {files.length === 0 ? (
        <div className="space-y-2">
          <div
            ref={uploadAreaRef}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDropOnArea}
            onDragOver={handleDragOverArea}
            tabIndex={0}
            className="border border-dashed border-border/70 rounded-lg p-5 text-center cursor-pointer hover:bg-card/70 hover:border-border transition-all focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <Upload className="w-6 h-6 mx-auto text-foreground/40 mb-2" />
            <p className="text-sm text-foreground/60">点击上传图片或按 Ctrl+V 粘贴</p>
            <p className="text-xs text-foreground/40 mt-0.5">{getHintText()}</p>
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
                  'aspect-square rounded-lg overflow-hidden border border-border/70 relative group cursor-move transition-all',
                  draggedIndex === i && 'opacity-50 scale-95'
                )}
              >
                {f.mimeType.startsWith('video') ? (
                  <video src={f.preview} className="w-full h-full object-cover" />
                ) : (
                  <img src={f.preview} className="w-full h-full object-cover" alt="" />
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
          {files.length < maxImages && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 text-sm text-foreground/70 hover:text-foreground border border-border/50 hover:border-border rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              继续添加图片
            </button>
          )}
        </div>
      )}

      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-background border border-border rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-medium">选择图片</h3>
              <button
                onClick={() => setShowImagePicker(false)}
                className="text-foreground/60 hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingLibrary ? (
                <div className="text-center py-8 text-foreground/50">加载中...</div>
              ) : imageLibrary.length === 0 ? (
                <div className="text-center py-8 text-foreground/50">暂无图片</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {imageLibrary.map((gen) => (
                    <button
                      key={gen.id}
                      onClick={() => {
                        handleSelectFromLibrary(gen);
                        setShowImagePicker(false);
                      }}
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
    </div>
  );
}
