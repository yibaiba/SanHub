import { WorkspaceNode, SafeImageModel, SafeVideoModel, ChatModel } from '@/types';

export interface ExecutionContext {
  imageModels: SafeImageModel[];
  videoModels: SafeVideoModel[];
  chatModels: ChatModel[];
}

export async function executeNodeAPI(
  node: WorkspaceNode,
  inputs: Record<string, any>,
  context: ExecutionContext
): Promise<any> {
  const { imageModels, videoModels, chatModels } = context;

  // 1. Resolve Prompt
  let prompt = node.data.prompt.trim();

  // Logic to merge inputs into prompt
  // Check upstream inputs
  // For simplicity, we assume inputs are keyed by upstream node ID, but here we just need values?
  // Actually the ExecutionManager passes `inputs` as Record<nodeId, output>.
  // We need to figure out WHICH input is which (chat, template, image ref).

  // Since we don't have edge info here easily (unless we pass it),
  // we might rely on the fact that `ExecutionManager` resolved inputs.
  // But wait, `ExecutionManager` just passes { upstreamId: output }.
  // We need to know the *type* of the upstream node to decide how to use the output.
  // `node` itself doesn't have that info.
  // We might need to change `executeNodeFn` signature to pass upstream nodes info?
  // OR `ExecutionManager` prepares a "ResolvedInput" object.

  // For now, let's look at the inputs values.
  const inputValues = Object.values(inputs);
  const templateInputs = inputValues.filter(v => typeof v === 'string' && v.startsWith('TEMPLATE:')); // Hacky? No.
  // Actually, we can check the node type of the input if we had it.

  // Let's assume `inputs` contains raw outputs.
  // We will append all string outputs to prompt if they look like text (Chat/Template).
  // We will use image URL outputs as reference images.

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
        // Chat output object?
        textInputs.push(val.content);
    }
  }

  // Prepend text inputs to prompt
  if (textInputs.length > 0) {
    const combinedInput = textInputs.join('\n\n');
    prompt = prompt ? `${combinedInput}\n\n${prompt}` : combinedInput;
  }

  if (!prompt && node.type !== 'image') { // Image might allow empty prompt if ref image exists?
     throw new Error('Prompt is empty');
  }

  // 2. Execute based on type
  if (node.type === 'image') {
    return executeImageNode(node, prompt, imageInputs, imageModels);
  } else if (node.type === 'video') {
    return executeVideoNode(node, prompt, imageInputs, videoModels);
  } else if (node.type === 'chat') {
    return executeChatNode(node, prompt, imageInputs, chatModels);
  } else if (node.type === 'prompt-template') {
    return node.data.templateOutput || '';
  }

  throw new Error(`Unknown node type: ${node.type}`);
}

async function executeImageNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: SafeImageModel[]
) {
  const model = models.find(m => m.id === node.data.modelId) || models[0];
  if (!model) throw new Error('No image model available');

  // Determine reference images
  let referenceImageUrl: string | undefined;
  let referenceImages: string[] | undefined;

  // Use uploaded images if no upstream images
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
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Image generation failed');

  // Poll
  return pollTask(data.data.id);
}

async function executeVideoNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: SafeVideoModel[]
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
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Video generation failed');

  return pollTask(data.data.id);
}

async function executeChatNode(
  node: WorkspaceNode,
  prompt: string,
  imageInputs: string[],
  models: ChatModel[]
) {
  const res = await fetch('/api/chat/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: node.data.chatModelId,
      prompt,
      images: imageInputs,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Chat generation failed');

  return data.data.content;
}

async function pollTask(taskId: string): Promise<string> {
  const maxAttempts = 240;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const res = await fetch(`/api/generate/status/${taskId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Poll failed');

    const status = data.data.status;
    if (status === 'completed') {
      return data.data.url;
    }
    if (status === 'failed') {
      throw new Error(data.data.errorMessage || 'Task failed');
    }

    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Task timed out');
}
