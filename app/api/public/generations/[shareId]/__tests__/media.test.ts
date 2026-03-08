import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  getPublishedGenerationByShareId: vi.fn(),
}));

vi.mock('@/lib/media-storage', () => ({
  readMediaFile: vi.fn(),
  isLocalFile: vi.fn(() => false),
}));

vi.mock('@/lib/sora-api', () => ({
  getVideoContentUrl: vi.fn(),
}));

vi.mock('@/lib/safe-fetch', () => ({
  fetchExternalBuffer: vi.fn(),
  resolveAndValidateUrl: vi.fn(),
}));

import { GET } from '../media/route';
import { getPublishedGenerationByShareId } from '@/lib/db';
import { isLocalFile } from '@/lib/media-storage';
import { fetchExternalBuffer, resolveAndValidateUrl } from '@/lib/safe-fetch';

const mockedGetPublishedGenerationByShareId = vi.mocked(getPublishedGenerationByShareId);
const mockedIsLocalFile = vi.mocked(isLocalFile);
const mockedResolveAndValidateUrl = vi.mocked(resolveAndValidateUrl);
const mockedFetchExternalBuffer = vi.mocked(fetchExternalBuffer);

const baseGeneration = {
  id: 'gen-1',
  userId: 'user-1',
  type: 'sora-video',
  prompt: 'A cinematic cat running in the rain',
  params: {},
  resultUrl: 'https://example.com/video.mp4',
  cost: 100,
  status: 'completed',
  visibility: 'public',
  publicShareId: 'share-123',
  publicViewCount: 7,
  createdAt: 1,
  updatedAt: 2,
  authorName: 'Alice',
  authorId: 'user-1',
};

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('public generation media route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsLocalFile.mockReturnValue(false);
  });

  it('returns 404 when published generation is missing', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce(null as any);

    const response = await GET(makeRequest('http://localhost/api/public/generations/share-123/media'), {
      params: { shareId: 'share-123' },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate');
  });

  it('redirects public external media when raw is not requested', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce(baseGeneration as any);
    mockedResolveAndValidateUrl.mockResolvedValueOnce(new URL('https://cdn.example.com/video.mp4'));

    const response = await GET(makeRequest('http://localhost/api/public/generations/share-123/media'), {
      params: { shareId: 'share-123' },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://cdn.example.com/video.mp4');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate');
  });

  it('serves data url payload directly', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'gemini-image',
      resultUrl: 'data:image/png;base64,aGVsbG8=',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/public/generations/share-123/media?raw=true'), {
      params: { shareId: 'share-123' },
    });
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate');
    expect(buffer.toString()).toBe('hello');
  });

  it('treats video-capture as image when proxying raw content', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'video-capture',
      resultUrl: 'https://example.com/frame.png',
    } as any);
    mockedResolveAndValidateUrl.mockResolvedValueOnce(new URL('https://cdn.example.com/frame.png'));
    mockedFetchExternalBuffer.mockResolvedValueOnce({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/public/generations/share-123/media?raw=true'), {
      params: { shareId: 'share-123' },
    });
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate');
    expect(buffer.toString()).toBe('hello');
  });
});
