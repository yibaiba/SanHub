import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  getGeneration: vi.fn(),
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

import { getServerSession } from 'next-auth';
import { GET } from '../route';
import { getGeneration } from '@/lib/db';
import { isLocalFile } from '@/lib/media-storage';
import { fetchExternalBuffer, resolveAndValidateUrl } from '@/lib/safe-fetch';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedGetGeneration = vi.mocked(getGeneration);
const mockedIsLocalFile = vi.mocked(isLocalFile);
const mockedFetchExternalBuffer = vi.mocked(fetchExternalBuffer);
const mockedResolveAndValidateUrl = vi.mocked(resolveAndValidateUrl);

const baseGeneration = {
  id: 'gen-1',
  userId: 'user-1',
  type: 'sora-video',
  prompt: 'A cinematic cat running in the rain',
  params: {},
  resultUrl: 'https://example.com/video.mp4',
  cost: 100,
  status: 'completed',
  visibility: 'private',
  publicShareId: undefined,
  publicViewCount: 0,
  createdAt: 1,
  updatedAt: 2,
};

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('owner media route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1', role: 'user' } } as any);
    mockedIsLocalFile.mockReturnValue(false);
  });

  it('treats video-capture as image when proxying raw content', async () => {
    mockedGetGeneration.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'video-capture',
      resultUrl: 'https://example.com/frame.png',
    } as any);
    mockedResolveAndValidateUrl.mockResolvedValueOnce(new URL('https://cdn.example.com/frame.png'));
    mockedFetchExternalBuffer.mockResolvedValueOnce({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/media/gen-1?raw=true'), {
      params: Promise.resolve({ id: 'gen-1' }),
    });
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(buffer.toString()).toBe('hello');
  });
});
