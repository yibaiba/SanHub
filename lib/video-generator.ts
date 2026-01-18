import { getVideoModelWithChannel } from './db';
import { fetchWithRetry } from './http-retry';
import { generateWithSora } from './sora';
import type { GenerateResult } from '@/types';

export interface VideoGenerateRequest {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  duration?: string;
  files?: Array<{ mimeType: string; data: string }>;
  styleId?: string;
  remixTargetId?: string;
}

type MediaType = 'image' | 'video';

function inferMediaTypeFromUrl(url: string): MediaType | null {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/')) return 'image';
  if (lower.startsWith('data:video/')) return 'video';
  if (/\.(mp4|mov|webm|mkv)(\?|#|$)/.test(lower)) return 'video';
  if (/\.(png|jpe?g|webp|gif|bmp)(\?|#|$)/.test(lower)) return 'image';
  return null;
}

function extractMediaFromContent(content: string): { type: MediaType; url: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      const type = parsed.type === 'video' || parsed.type === 'image'
        ? parsed.type
        : inferMediaTypeFromUrl(parsed.url);
      if (type) return { type, url: parsed.url };
    }
  } catch {
    // Ignore JSON parse errors
  }

  const dataUrlMatch = trimmed.match(/data:(image|video)\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrlMatch) {
    const type = dataUrlMatch[1] === 'video' ? 'video' : 'image';
    return { type, url: dataUrlMatch[0] };
  }

  const tagMatch = trimmed.match(/<(video|img)[^>]*\s(?:src|srcset)=['"]([^'"]+)['"]/i);
  if (tagMatch) {
    const type = tagMatch[1].toLowerCase() === 'video' ? 'video' : 'image';
    return { type, url: tagMatch[2] };
  }

  const mdMatch = trimmed.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/i);
  if (mdMatch) {
    return { type: 'image', url: mdMatch[1] };
  }

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>`]+/);
  if (urlMatch) {
    const inferred = inferMediaTypeFromUrl(urlMatch[0]);
    if (inferred) {
      return { type: inferred, url: urlMatch[0] };
    }
  }

  return null;
}

function buildDataUrl(mimeType: string, data: string): string {
  if (data.startsWith('data:')) return data;
  return `data:${mimeType || 'image/jpeg'};base64,${data}`;
}

function buildSoraModelKey(apiModel: string, aspectRatio: string, duration: string): string {
  const base = apiModel.toLowerCase();
  const isPro = base.includes('pro');
  const baseKey = isPro ? 'sora2-pro' : 'sora2';
  return `${baseKey}-${aspectRatio}-${duration}`;
}

async function readChatStreamContent(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Upstream response body is empty');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let reasoningContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') {
          fullContent += delta.content;
        }
        if (typeof delta?.reasoning_content === 'string') {
          reasoningContent += delta.reasoning_content;
        }
      } catch {
        // Ignore malformed chunks
      }
    }
  }

  return fullContent || reasoningContent;
}

async function generateWithFlowChat(
  request: VideoGenerateRequest,
  baseUrl: string,
  apiKey: string,
  apiModel: string
): Promise<GenerateResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  if (request.files && request.files.length > 0) {
    for (const file of request.files) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: buildDataUrl(file.mimeType, file.data) },
      });
    }
  }
  if (request.prompt) {
    contentParts.push({ type: 'text', text: request.prompt });
  }

  const payload = {
    model: apiModel,
    messages: [
      {
        role: 'user',
        content: contentParts.length === 1 && contentParts[0].type === 'text'
          ? request.prompt
          : contentParts,
      },
    ],
    stream: true,
  };

  const response = await fetchWithRetry(fetch, url, () => ({
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Flow API error (${response.status}): ${errorText}`);
  }

  const responseText = await readChatStreamContent(response);
  if (!responseText) {
    throw new Error('Flow API returned no content');
  }

  const media = extractMediaFromContent(responseText);
  if (!media || media.type !== 'video') {
    throw new Error(`Flow API returned unexpected content: ${responseText.substring(0, 200)}`);
  }

  return { type: 'flow-video', url: media.url, cost: 0 };
}

export async function generateFlowVideoByModel(params: {
  model: string;
  prompt: string;
  images?: Array<{ mimeType: string; data: string }>;
  baseUrl: string;
  apiKey: string;
}): Promise<GenerateResult> {
  const request: VideoGenerateRequest = {
    modelId: 'flow',
    prompt: params.prompt,
    files: params.images,
  };
  return generateWithFlowChat(request, params.baseUrl, params.apiKey, params.model);
}

export async function generateVideo(
  request: VideoGenerateRequest,
  onProgress?: (progress: number) => void
): Promise<GenerateResult> {
  const modelConfig = await getVideoModelWithChannel(request.modelId);
  if (!modelConfig) {
    throw new Error('Video model not found');
  }

  const { model, channel, effectiveBaseUrl, effectiveApiKey } = modelConfig;

  if (!model.enabled) {
    throw new Error('Video model is disabled');
  }
  if (!channel.enabled) {
    throw new Error('Video channel is disabled');
  }
  if (!effectiveBaseUrl) {
    throw new Error('Base URL is not configured');
  }
  if (!effectiveApiKey) {
    throw new Error('API key is not configured');
  }

  const aspectRatio = request.aspectRatio || model.defaultAspectRatio || 'landscape';
  const duration = request.duration || model.defaultDuration || '10s';

  if (channel.type === 'sora') {
    const modelKey = buildSoraModelKey(model.apiModel || 'sora2', aspectRatio, duration);
    return generateWithSora(
      {
        prompt: request.prompt,
        model: modelKey,
        files: request.files,
        style_id: request.styleId,
        remix_target_id: request.remixTargetId,
      },
      onProgress
    );
  }

  if (channel.type === 'flow' || channel.type === 'openai-compatible') {
    return generateWithFlowChat(request, effectiveBaseUrl, effectiveApiKey, model.apiModel);
  }

  throw new Error(`Unsupported video channel type: ${channel.type}`);
}
