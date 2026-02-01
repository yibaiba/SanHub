import { WorkspaceNode, SafeImageModel, SafeVideoModel, ChatModel } from '@/types';
import { NodeExecutionContext } from '@/lib/workflow-engine/types';

export interface ExecutionContext {
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: ChatModel[];
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
      if (val.startsWith('http') || val.startsWith('data:image')) {
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

  const res = await fetch('/api/generate/image', {
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Image generation failed');

  return pollTask(data.data.id, execContext);
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

  const res = await fetch('/api/generate/sora', {
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Video generation failed');

  return pollTask(data.data.id, execContext);
}

async function executeChatNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: ChatModel[],
  execContext?: NodeExecutionContext
) {
  const res = await fetch('/api/chat/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: node.data.chatModelId,
      prompt,
      images: imageInputs,
    }),
    signal: execContext?.abortSignal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Chat generation failed');

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
