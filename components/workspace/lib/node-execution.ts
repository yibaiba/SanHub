import { WorkspaceNode, SafeImageModel, SafeVideoModel, ChatModel } from '@/types';
import { NodeExecutionContext, RetryConfig, DEFAULT_RETRY_CONFIG } from '@/lib/workflow-engine/types';
import { buildWorkspaceChatRequestBody } from './chat-request';

export interface ExecutionContext {
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: ChatModel[];
}

export function isWorkflowMediaInput(value: string): boolean {
  return (
    value.startsWith('/api/media/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:image/') ||
    value.startsWith('data:video/') ||
    value.startsWith('file:')
  );
}

// ========================================
// 重试机制
// ========================================

/**
 * 从错误消息中提取错误代码
 */
function extractErrorCode(error: Error): string {
  const msg = (error.message || '').toLowerCase();

  // 积分不足
  if (msg.includes('余额不足') || msg.includes('insufficient') || msg.includes('balance')) {
    return 'INSUFFICIENT_BALANCE';
  }
  // 网络超时
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'TIMEOUT';
  }
  // 网络错误
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('econnreset')) {
    return 'NETWORK_ERROR';
  }
  // HTTP 状态码
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    return statusMatch[1];
  }

  return msg;
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
  const errorCode = extractErrorCode(error);

  // 先检查不可重试错误
  if (config.nonRetryableErrors.some(e => errorCode.includes(e.toLowerCase()))) {
    return false;
  }

  // 再检查可重试错误
  return config.retryableErrors.some(e => errorCode.includes(e.toLowerCase()));
}

/**
 * 判断是否为积分不足错误
 */
export function isInsufficientBalanceError(error: Error): boolean {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('余额不足') ||
         msg.includes('insufficient') ||
         msg.includes('balance') ||
         msg.includes('INSUFFICIENT_BALANCE');
}

/**
 * 带重试的异步函数包装器
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // AbortError 不重试
      if (error.name === 'AbortError') {
        throw error;
      }

      // 不可重试错误直接抛出
      if (!isRetryableError(error, config)) {
        throw error;
      }

      // 最后一次尝试失败
      if (attempt === config.maxRetries) {
        throw error;
      }

      // 回调通知
      onRetry?.(attempt + 1, error);

      // 等待退避时间
      const backoffTime = config.backoffMs[attempt] || config.backoffMs[config.backoffMs.length - 1] || 10000;
      await new Promise(r => setTimeout(r, backoffTime));
    }
  }

  throw lastError;
}

export async function executeNodeAPI(
  node: WorkspaceNode,
  inputs: Record<string, any>,
  context: ExecutionContext,
  execContext?: NodeExecutionContext
): Promise<any> {
  const { imageModels, videoModels, chatModels } = context;

  // 1. Resolve Prompt
  let prompt = node.data.prompt?.trim() || '';

  const inputValues = Object.values(inputs);
  const textInputs: string[] = [];
  const imageInputs: string[] = [];

  for (const val of inputValues) {
    if (typeof val === 'string') {
      if (isWorkflowMediaInput(val)) {
        imageInputs.push(val);
      } else {
        textInputs.push(val);
      }
    } else if (typeof val === 'object' && val?.content) {
      textInputs.push(val.content);
    }
  }

  // Prepend text inputs to prompt
  if (textInputs.length > 0) {
    const combinedInput = textInputs.join('\n\n');
    prompt = prompt ? `${combinedInput}\n\n${prompt}` : combinedInput;
  }

  if (!prompt && node.type !== 'image') {
    throw new Error('Prompt is empty');
  }

  // 2. Execute based on type
  if (node.type === 'image') {
    return executeImageNode(node, prompt, imageInputs, imageModels, execContext);
  } else if (node.type === 'video') {
    return executeVideoNode(node, prompt, imageInputs, videoModels, execContext);
  } else if (node.type === 'chat') {
    return executeChatNode(node, prompt, imageInputs, chatModels, execContext);
  } else if (node.type === 'prompt-template') {
    return node.data.templateOutput || '';
  }

  throw new Error(`Unknown node type: ${node.type}`);
}

async function executeImageNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: SafeImageModel[],
  execContext?: NodeExecutionContext
) {
  const model = models.find(m => m.id === node.data.modelId) || models[0];
  if (!model) throw new Error('No image model available');

  let referenceImageUrl: string | undefined;
  let referenceImages: string[] | undefined;

  const uploaded = node.data.uploadedImages || [];
  const allImages = [...imageInputs, ...uploaded];

  if (model.features.imageToImage && allImages.length > 0) {
    if (model.features.multipleImages) {
      referenceImages = allImages;
    } else {
      referenceImageUrl = allImages[0];
    }
  }

  // 使用重试包装器
  const res = await withRetry(
    async () => {
      const response = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          prompt,
          aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
          imageSize: model.features.imageSize ? node.data.imageSize : undefined,
          referenceImageUrl,
          referenceImages,
        }),
        signal: execContext?.abortSignal,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Image generation failed');
      return data;
    },
    DEFAULT_RETRY_CONFIG,
    (attempt) => {
      execContext?.onProgress?.(0, `重试中 (${attempt}/${DEFAULT_RETRY_CONFIG.maxRetries})...`);
    }
  );

  return pollTask(res.data.id, execContext);
}

async function executeVideoNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: SafeVideoModel[],
  execContext?: NodeExecutionContext
) {
  const model = models.find(m => m.id === node.data.modelId) || models[0];
  if (!model) throw new Error('No video model available');

  const uploaded = node.data.uploadedImages || [];
  const referenceImageUrl = imageInputs[0] || uploaded[0];

  // 使用重试包装器
  const res = await withRetry(
    async () => {
      const response = await fetch('/api/generate/sora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          prompt,
          aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
          duration: node.data.duration || model.defaultDuration,
          referenceImageUrl,
        }),
        signal: execContext?.abortSignal,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Video generation failed');
      return data;
    },
    DEFAULT_RETRY_CONFIG,
    (attempt) => {
      execContext?.onProgress?.(0, `重试中 (${attempt}/${DEFAULT_RETRY_CONFIG.maxRetries})...`);
    }
  );

  return pollTask(res.data.id, execContext);
}

async function executeChatNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: ChatModel[],
  execContext?: NodeExecutionContext
) {
  const model = models.find(m => m.id === node.data.chatModelId) || models[0];
  if (!model) throw new Error('No chat model available');
  if (imageInputs.length > 0 && !model.supportsVision) {
    throw new Error('该模型不支持图片输入');
  }

  const requestBody = buildWorkspaceChatRequestBody(node, prompt, imageInputs, model.id);

  // 使用重试包装器
  const data = await withRetry(
    async () => {
      const response = await fetch('/api/chat/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: execContext?.abortSignal,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chat generation failed');
      return result;
    },
    DEFAULT_RETRY_CONFIG,
    (attempt) => {
      execContext?.onProgress?.(0, `重试中 (${attempt}/${DEFAULT_RETRY_CONFIG.maxRetries})...`);
    }
  );

  return data.data.content;
}

async function pollTask(
  taskId: string,
  execContext?: NodeExecutionContext
): Promise<string> {
  const maxAttempts = 240;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Check if cancelled before each poll
    if (execContext?.abortSignal?.aborted) {
      throw new DOMException('Execution cancelled', 'AbortError');
    }

    attempts++;

    try {
      const res = await fetch(`/api/generate/status/${taskId}`, {
        signal: execContext?.abortSignal,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Poll failed');

      const status = data.data.status;
      const progress = data.data.progress;

      // Report progress if callback available
      if (execContext?.onProgress && typeof progress === 'number') {
        execContext.onProgress(progress, `Processing: ${progress}%`);
      }

      if (status === 'completed') {
        execContext?.onProgress?.(100, 'Completed');
        return data.data.url;
      }
      if (status === 'failed') {
        throw new Error(data.data.errorMessage || 'Task failed');
      }
    } catch (err: any) {
      // Re-throw abort errors
      if (err.name === 'AbortError') {
        throw err;
      }
      // For network errors, continue polling
      console.warn('Poll error, retrying...', err.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error('Task timed out');
}
