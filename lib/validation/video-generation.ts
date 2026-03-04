/**
 * Validation utilities for video generation inputs
 */

type VideoEngine = 'sora' | 'veo';
type CreationMode = 'normal' | 'remix' | 'storyboard';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/**
 * Validate prompt input
 */
export function validatePrompt(prompt: string, required: boolean = true): ValidationResult {
  const trimmed = prompt.trim();
  
  if (required && !trimmed) {
    return { valid: false, error: '请输入提示词' };
  }
  
  if (trimmed.length > 5000) {
    return { valid: false, error: '提示词长度不能超过 5000 字符' };
  }
  
  return { valid: true };
}

/**
 * Validate remix URL
 */
export function validateRemixUrl(url: string): ValidationResult {
  const trimmed = url.trim();
  
  if (!trimmed) {
    return { valid: false, error: '请输入视频链接或 ID' };
  }
  
  // Allow both full URLs and task IDs
  if (trimmed.length < 3) {
    return { valid: false, error: '视频链接或 ID 格式不正确' };
  }
  
  return { valid: true };
}

/**
 * Validate storyboard format
 * Expected format: multiple lines with scene descriptions
 */
export function validateStoryboard(storyboard: string): ValidationResult {
  const trimmed = storyboard.trim();
  
  if (!trimmed) {
    return { valid: false, error: '请输入分镜脚本' };
  }
  
  const lines = trimmed.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return { valid: false, error: '分镜脚本至少需要 2 个场景' };
  }
  
  if (lines.length > 20) {
    return { valid: false, error: '分镜脚本最多支持 20 个场景' };
  }
  
  // Check each line has reasonable length
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length < 5) {
      return { valid: false, error: `场景 ${i + 1} 描述过短，至少需要 5 个字符` };
    }
    if (lines[i].length > 500) {
      return { valid: false, error: `场景 ${i + 1} 描述过长，不能超过 500 字符` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate file type
 */
export function validateFileType(file: File, allowVideo: boolean = false): ValidationResult {
  const allowedTypes = allowVideo 
    ? [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]
    : ALLOWED_IMAGE_TYPES;
  
  if (!allowedTypes.includes(file.type)) {
    const typeStr = allowVideo ? '图片或视频' : '图片';
    return { 
      valid: false, 
      error: `不支持的文件类型，请上传 ${typeStr}文件` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, maxSize: number = MAX_FILE_SIZE): ValidationResult {
  if (file.size > maxSize) {
    const maxSizeMB = Math.floor(maxSize / (1024 * 1024));
    return { 
      valid: false, 
      error: `文件大小不能超过 ${maxSizeMB}MB` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate file upload
 */
export function validateFile(file: File, allowVideo: boolean = false): ValidationResult {
  // Check file type
  const typeResult = validateFileType(file, allowVideo);
  if (!typeResult.valid) {
    return typeResult;
  }
  
  // Check file size
  const sizeResult = validateFileSize(file);
  if (!sizeResult.valid) {
    return sizeResult;
  }
  
  return { valid: true };
}

/**
 * Validate image count for specific mode
 */
export function validateImageCount(
  files: FileData[],
  mode: Veo3Mode | CreationMode,
  engine: VideoEngine
): ValidationResult {
  if (engine === 'veo') {
    if (mode === 't2v') {
      if (files.length > 0) {
        return { valid: false, error: '文生视频模式不支持上传图片' };
      }
    } else if (mode === 'i2v') {
      if (files.length === 0) {
        return { valid: false, error: '图生视频模式需要上传至少 1 张图片' };
      }
      if (files.length > 2) {
        return { valid: false, error: '图生视频模式最多支持 2 张图片' };
      }
    } else if (mode === 'r2v') {
      if (files.length === 0) {
        return { valid: false, error: '图片融合模式需要上传至少 1 张图片' };
      }
      if (files.length > 3) {
        return { valid: false, error: '图片融合模式最多支持 3 张图片' };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Validate all inputs before generation
 */
export function validateGenerationInputs(params: {
  engine: VideoEngine;
  mode: CreationMode | Veo3Mode;
  prompt: string;
  remixUrl?: string;
  storyboardPrompt?: string;
  files: FileData[];
}): ValidationResult {
  const { engine, mode, prompt, remixUrl, storyboardPrompt, files } = params;
  
  // Validate based on engine and mode
  if (engine === 'sora') {
    if (mode === 'normal') {
      const promptResult = validatePrompt(prompt, true);
      if (!promptResult.valid) return promptResult;
    } else if (mode === 'remix') {
      if (!remixUrl) {
        return { valid: false, error: '请输入视频链接或 ID' };
      }
      const urlResult = validateRemixUrl(remixUrl);
      if (!urlResult.valid) return urlResult;
      
      // Prompt is optional for remix but validate if provided
      if (prompt) {
        const promptResult = validatePrompt(prompt, false);
        if (!promptResult.valid) return promptResult;
      }
    } else if (mode === 'storyboard') {
      if (!storyboardPrompt) {
        return { valid: false, error: '请输入分镜脚本' };
      }
      const storyboardResult = validateStoryboard(storyboardPrompt);
      if (!storyboardResult.valid) return storyboardResult;
    }
  } else if (engine === 'veo') {
    // Validate prompt for all Veo modes
    const promptResult = validatePrompt(prompt, true);
    if (!promptResult.valid) return promptResult;
    
    // Validate image count
    const imageCountResult = validateImageCount(files, mode as Veo3Mode, engine);
    if (!imageCountResult.valid) return imageCountResult;
  }
  
  return { valid: true };
}
