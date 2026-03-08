import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  getAdapter: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'share-123'),
}));

import { getServerSession } from 'next-auth';
import { getAdapter } from '@/lib/db';
import { POST } from '../route';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedGetAdapter = vi.mocked(getAdapter);
const executeMock = vi.fn();

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/share/workflow', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('share workflow route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);
    executeMock.mockReset();
    mockedGetAdapter.mockReturnValue({ execute: executeMock } as any);
  });

  it('rejects sharing another user workspace', async () => {
    executeMock.mockResolvedValueOnce([[{ user_id: 'user-2' }]] as any);

    const response = await POST(makeRequest({ workspaceId: 'ws-1', template: { nodes: [] } }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('creates a share link for the owner workspace', async () => {
    executeMock.mockResolvedValueOnce([[{ user_id: 'user-1' }]] as any);
    executeMock.mockResolvedValueOnce([[]] as any);

    const response = await POST(makeRequest({ workspaceId: 'ws-1', template: { nodes: [] } }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.shareId).toBe('share-123');
    expect(data.data.url).toBe('http://localhost/share/workflow/share-123');
  });
});
