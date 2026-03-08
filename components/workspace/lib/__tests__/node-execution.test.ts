import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeNodeAPI, isWorkflowMediaInput } from '../node-execution';

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

const videoNode = {
  type: 'video',
  data: {
    modelId: 'video-1',
    prompt: 'animate it',
    aspectRatio: 'landscape',
    duration: '10s',
    uploadedImages: [],
  },
} as any;

const chatNode = {
  type: 'chat',
  data: {
    chatModelId: 'chat-1',
    prompt: 'describe it',
    pureMode: false,
    storyboardMode: false,
    chatMessages: [],
  },
} as any;

const context = {
  imageModels: [],
  videoModels: [
    {
      id: 'video-1',
      name: 'Video 1',
      defaultAspectRatio: 'landscape',
      defaultDuration: '10s',
    },
  ],
  chatModels: [
    {
      id: 'chat-1',
      supportsVision: true,
    },
  ],
} as any;

describe('node execution media input compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recognizes proxied workflow media paths as media inputs', () => {
    expect(isWorkflowMediaInput('/api/media/gen-1')).toBe(true);
    expect(isWorkflowMediaInput('https://example.com/file.mp4')).toBe(true);
    expect(isWorkflowMediaInput('hello world')).toBe(false);
  });

  it('passes relative proxy media urls into downstream video execution', async () => {
    global.fetch = vi
      .fn()
      .mockImplementationOnce((url: string, init?: RequestInit) => {
        expect(url).toBe('/api/generate/sora');
        const body = JSON.parse(String(init?.body));
        expect(body.referenceImageUrl).toBe('/api/media/gen-1');
        return jsonResponse({ data: { id: 'task-1' } });
      })
      .mockImplementationOnce((url: string) => {
        expect(url).toBe('/api/generate/status/task-1');
        return jsonResponse({
          data: {
            status: 'completed',
            progress: 100,
            url: 'https://example.com/output.mp4',
          },
        });
      }) as typeof fetch;

    const result = await executeNodeAPI(videoNode, { upstream: '/api/media/gen-1' }, context);

    expect(result).toBe('https://example.com/output.mp4');
  });

  it('passes relative proxy media urls into downstream chat execution', async () => {
    global.fetch = vi
      .fn()
      .mockImplementationOnce((url: string, init?: RequestInit) => {
        expect(url).toBe('/api/chat/workspace');
        const body = JSON.parse(String(init?.body));
        expect(body.images).toEqual(['/api/media/gen-1']);
        return jsonResponse({ data: { content: 'done' } });
      }) as typeof fetch;

    const result = await executeNodeAPI(chatNode, { upstream: '/api/media/gen-1' }, context);

    expect(result).toBe('done');
  });
});
