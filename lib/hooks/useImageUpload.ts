import { useCallback } from 'react';
import { toast } from '@/components/ui/toaster';
import { validateFile } from '@/lib/validation/video-generation';

type VideoEngine = 'sora' | 'veo';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';
type CreationMode = 'normal' | 'remix' | 'storyboard';

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

interface UseImageUploadParams {
  engine: VideoEngine;
  mode: Veo3Mode | CreationMode;
  maxImages: number;
  currentFiles: FileData[];
  onFilesChange: (files: FileData[] | ((prev: FileData[]) => FileData[])) => void;
  onAspectRatioChange?: (ratio: string) => void;
}

interface UseImageUploadReturn {
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handlePaste: (e: ClipboardEvent) => Promise<void>;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  cropImageToAspectRatio: (
    file: File,
    ratio: 'landscape' | 'portrait'
  ) => Promise<{ file: File; preview: string }>;
}

export function useImageUpload({
  engine,
  mode,
  maxImages,
  currentFiles,
  onFilesChange,
  onAspectRatioChange,
}: UseImageUploadParams): UseImageUploadReturn {
  // Crop image to target aspect ratio (for Veo mode)
  const cropImageToAspectRatio = useCallback(
    async (
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
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
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
    },
    []
  );

  // Process a single file
  const processFile = useCallback(
    async (file: File): Promise<FileData | null> => {
      // Validate file using validation utility
      const validationResult = validateFile(file, false);
      if (!validationResult.valid) {
        toast({
          title: '文件验证失败',
          description: validationResult.error,
          variant: 'destructive',
        });
        return null;
      }

      // For Veo mode, detect orientation and crop
      if (engine === 'veo') {
        try {
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

          // Set aspect ratio based on first image only
          if (currentFiles.length === 0 && onAspectRatioChange) {
            onAspectRatioChange(targetRatio);
          }

          // Crop image to target aspect ratio
          const { file: croppedFile, preview: previewUrl } = await cropImageToAspectRatio(
            file,
            targetRatio
          );

          return {
            data: '',
            mimeType: file.type,
            preview: previewUrl,
            file: croppedFile,
          };
        } catch (err) {
          console.error('Failed to process image:', err);
          toast({
            title: '图片处理失败',
            description: '无法处理该图片，请尝试其他图片',
            variant: 'destructive',
          });
          return null;
        }
      } else {
        // Sora mode: no cropping, just use original file
        const previewUrl = URL.createObjectURL(file);
        return {
          data: '',
          mimeType: file.type,
          preview: previewUrl,
          file,
        };
      }
    },
    [engine, currentFiles.length, onAspectRatioChange, cropImageToAspectRatio]
  );

  // Handle file upload from input
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);

      // Check limit
      if (currentFiles.length + selectedFiles.length > maxImages) {
        toast({
          title: '图片数量超限',
          description: `当前模式最多支持 ${maxImages} 张图片`,
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }

      const processedFiles: FileData[] = [];

      for (const file of selectedFiles) {
        const processed = await processFile(file);
        if (processed) {
          processedFiles.push(processed);
        }
      }

      // Add all processed files at once
      if (processedFiles.length > 0) {
        onFilesChange((prev) => [...prev, ...processedFiles]);
      }

      e.target.value = '';
    },
    [currentFiles.length, maxImages, processFile, onFilesChange]
  );

  // Handle paste from clipboard
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

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
      if (currentFiles.length + imageFiles.length > maxImages) {
        toast({
          title: '图片数量超限',
          description: `当前模式最多支持 ${maxImages} 张图片`,
          variant: 'destructive',
        });
        return;
      }

      // Process pasted images
      const processedFiles: FileData[] = [];

      for (const file of imageFiles) {
        const processed = await processFile(file);
        if (processed) {
          processedFiles.push(processed);
        }
      }

      // Add all processed files at once
      if (processedFiles.length > 0) {
        onFilesChange((prev) => [...prev, ...processedFiles]);
        toast({
          title: '已粘贴图片',
          description: `成功添加 ${processedFiles.length} 张图片`,
        });
      }
    },
    [currentFiles.length, maxImages, processFile, onFilesChange]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const droppedFiles = Array.from(e.dataTransfer.files);
      const imageFiles = droppedFiles.filter((f) => f.type.startsWith('image/'));

      if (imageFiles.length === 0) {
        toast({
          title: '文件类型错误',
          description: '只支持图片文件',
          variant: 'destructive',
        });
        return;
      }

      // Check limit
      if (currentFiles.length + imageFiles.length > maxImages) {
        toast({
          title: '图片数量超限',
          description: `当前模式最多支持 ${maxImages} 张图片`,
          variant: 'destructive',
        });
        return;
      }

      // Process dropped images
      const processedFiles: FileData[] = [];

      for (const file of imageFiles) {
        const processed = await processFile(file);
        if (processed) {
          processedFiles.push(processed);
        }
      }

      // Add all processed files at once
      if (processedFiles.length > 0) {
        onFilesChange((prev) => [...prev, ...processedFiles]);
        toast({
          title: '已添加图片',
          description: `成功添加 ${processedFiles.length} 张图片`,
        });
      }
    },
    [currentFiles.length, maxImages, processFile, onFilesChange]
  );

  return {
    handleFileUpload,
    handlePaste,
    handleDrop,
    cropImageToAspectRatio,
  };
}
