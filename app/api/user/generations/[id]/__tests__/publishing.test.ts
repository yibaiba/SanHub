import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from '../publish/route';
import { GET as GET_SHARE } from '../share/route';
import type { Generation } from '@/types';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  getGeneration: vi.fn(),
  publishGeneration: vi.fn(),
  unpublishGeneration: vi.fn(),
}));

import { getServerSession } from 'next-auth';
import { getGeneration, publishGeneration, unpublishGeneration } from '@/lib/db';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedGetGeneration = vi.mocked(getGeneration);
const mockedPublishGeneration = vi.mocked(publishGeneration);
const mockedUnpublishGeneration = vi.mocked(unpublishGeneration);

function buildGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen-1',
    userId: 'user-1',
    type: 'sora-video',
    prompt: 'A cinematic cat running in the rain',
    params: {},
    resultUrl: 'https://example.com/video.mp4',
    cost: 100,
    status: 'completed',
    balancePrecharged: true,
    balanceRefunded: false,
    visibility: 'private',
    publicShareId: undefined,
    publicViewCount: 0,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('generation publishing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);
  });

  it('rejects publish when unauthenticated', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null as any);

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('未登录');
  });

  it('rejects publish for unfinished generation', async () => {
    mockedGetGeneration.mockResolvedValueOnce(buildGeneration({ status: 'processing' }));

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('只有已完成作品才能公开');
    expect(mockedPublishGeneration).not.toHaveBeenCalled();
  });

  it('rejects publish for unsupported generation types', async () => {
    mockedGetGeneration.mockResolvedValueOnce(
      buildGeneration({ type: 'character-card', resultUrl: 'https://example.com/card.json' as any })
    );

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('只有图片或视频作品才能公开');
    expect(mockedPublishGeneration).not.toHaveBeenCalled();
  });

  it('rejects publish for invalid completed media urls', async () => {
    mockedGetGeneration.mockResolvedValueOnce(
      buildGeneration({ type: 'sora-video', resultUrl: 'https://example.com/image.png' })
    );

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('作品缺少有效媒体文件，暂时无法公开');
    expect(mockedPublishGeneration).not.toHaveBeenCalled();
  });

  it('rejects publish for obviously non-media urls', async () => {
    mockedGetGeneration.mockResolvedValueOnce(
      buildGeneration({ type: 'sora-video', resultUrl: 'https://example.com/result.json' })
    );

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('作品缺少有效媒体文件，暂时无法公开');
    expect(mockedPublishGeneration).not.toHaveBeenCalled();
  });

  it('publishes completed generation and returns canonical share url', async () => {
    mockedGetGeneration.mockResolvedValueOnce(buildGeneration());
    mockedPublishGeneration.mockResolvedValueOnce(
      buildGeneration({ visibility: 'public', publicShareId: 'share-123' })
    );

    const response = await POST(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockedPublishGeneration).toHaveBeenCalledWith('gen-1', 'user-1');
    expect(data.data.shareUrl).toBe('http://localhost/g/share-123');
    expect(data.data.generation.visibility).toBe('public');
    expect(data.data.generation.resultUrl).toBe('/api/media/gen-1');
  });

  it('unpublishes owner generation', async () => {
    mockedGetGeneration.mockResolvedValueOnce(buildGeneration({ visibility: 'public', publicShareId: 'share-123' }));
    mockedUnpublishGeneration.mockResolvedValueOnce(buildGeneration({ visibility: 'private', publicShareId: 'share-123' }));

    const response = await DELETE(makeRequest('http://localhost/api/user/generations/gen-1/publish'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockedUnpublishGeneration).toHaveBeenCalledWith('gen-1', 'user-1');
    expect(data.data.generation.visibility).toBe('private');
  });

  it('refuses share link lookup before publish', async () => {
    mockedGetGeneration.mockResolvedValueOnce(buildGeneration({ visibility: 'private', publicShareId: undefined }));

    const response = await GET_SHARE(makeRequest('http://localhost/api/user/generations/gen-1/share'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('请先公开作品');
  });

  it('returns canonical share link for published generation', async () => {
    mockedGetGeneration.mockResolvedValueOnce(buildGeneration({ visibility: 'public', publicShareId: 'share-123' }));

    const response = await GET_SHARE(makeRequest('http://localhost/api/user/generations/gen-1/share'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.url).toBe('http://localhost/g/share-123');
  });

  it('refuses share link lookup when public share is no longer active', async () => {
    mockedGetGeneration.mockResolvedValueOnce(
      buildGeneration({ visibility: 'public', publicShareId: 'share-123', status: 'failed' })
    );

    const response = await GET_SHARE(makeRequest('http://localhost/api/user/generations/gen-1/share'), {
      params: { id: 'gen-1' },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('当前作品暂不可分享');
  });
});
