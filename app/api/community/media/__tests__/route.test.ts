import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/safe-fetch', () => ({
  fetchExternalBuffer: vi.fn(),
}));

import { getServerSession } from 'next-auth';
import { GET } from '../route';
import { fetchExternalBuffer } from '@/lib/safe-fetch';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedFetchExternalBuffer = vi.mocked(fetchExternalBuffer);

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('community media route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);
  });

  it('requires authentication', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null as any);

    const response = await GET(makeRequest('http://localhost/api/community/media?url=https%3A%2F%2Fcdn.example.com%2Ffile.mp4'));

    expect(response.status).toBe(401);
  });

  it('proxies remote community media through same-origin route', async () => {
    mockedFetchExternalBuffer.mockResolvedValueOnce({
      buffer: Buffer.from('hello'),
      contentType: 'video/mp4',
      finalUrl: 'https://cdn.example.com/file.mp4',
    } as any);

    const response = await GET(makeRequest('http://localhost/api/community/media?url=https%3A%2F%2Fcdn.example.com%2Ffile.mp4'));
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect(buffer.toString()).toBe('hello');
  });
});
