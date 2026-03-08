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
  refundGenerationBalance: vi.fn(),
  updateGeneration: vi.fn(),
}));

import { getServerSession } from 'next-auth';
import { GET } from '../route';
import { getGeneration, refundGenerationBalance, updateGeneration } from '@/lib/db';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedGetGeneration = vi.mocked(getGeneration);
const mockedRefundGenerationBalance = vi.mocked(refundGenerationBalance);
const mockedUpdateGeneration = vi.mocked(updateGeneration);

const baseGeneration = {
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
  errorMessage: undefined,
  createdAt: 1,
  updatedAt: 2,
};

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('generation status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedRefundGenerationBalance.mockResolvedValue(false as any);
    mockedUpdateGeneration.mockResolvedValue(null as any);
  });

  it('returns absolute same-origin proxy urls for proxied video outputs', async () => {
    mockedGetGeneration.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'sora-video',
      resultUrl: 'file:gen-1.mp4',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/generate/status/gen-1'), {
      params: Promise.resolve({ id: 'gen-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.url).toBe('/api/media/gen-1');
  });

  it('keeps external video-capture URLs as images instead of forcing media proxy', async () => {
    mockedGetGeneration.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'video-capture',
      resultUrl: 'https://example.com/frame.png',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/generate/status/gen-1'), {
      params: Promise.resolve({ id: 'gen-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.url).toBe('https://example.com/frame.png');
  });
});
