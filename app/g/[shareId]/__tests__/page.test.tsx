import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).React = React;

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => {
    const value = typeof href === 'string' ? href : href?.pathname || '';
    return <a href={value} {...props}>{children}</a>;
  },
}));

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/lib/utils', () => ({
  formatDate: vi.fn(() => '2026/03/07 12:00'),
}));

vi.mock('@/lib/db', () => ({
  getPublishedGenerationByShareId: vi.fn(),
  incrementPublishedGenerationViewCount: vi.fn(),
}));

import PublicGenerationPage from '../page';
import { getPublishedGenerationByShareId, incrementPublishedGenerationViewCount } from '@/lib/db';

const mockedGetPublishedGenerationByShareId = vi.mocked(getPublishedGenerationByShareId);
const mockedIncrementPublishedGenerationViewCount = vi.mocked(incrementPublishedGenerationViewCount);

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

describe('PublicGenerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders published generation details and increments views', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce(baseGeneration as any);
    mockedIncrementPublishedGenerationViewCount.mockResolvedValueOnce(8 as any);

    const element = await PublicGenerationPage({ params: { shareId: 'share-123' } });
    const html = renderToStaticMarkup(element);

    expect(mockedGetPublishedGenerationByShareId).toHaveBeenCalledWith('share-123');
    expect(mockedIncrementPublishedGenerationViewCount).toHaveBeenCalledWith('share-123');
    expect(html).toContain('公开作品详情');
    expect(html).toContain('A cinematic cat running in the rain');
    expect(html).toContain('/api/public/generations/share-123/media');
    expect(html).toContain('/api/public/generations/share-123/media?raw=true');
    expect(html).toContain('Alice');
    expect(html).toContain('8');
  });

  it('renders video-capture as image instead of video', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce({
      ...baseGeneration,
      type: 'video-capture',
      resultUrl: 'https://example.com/frame.png',
    } as any);
    mockedIncrementPublishedGenerationViewCount.mockResolvedValueOnce(3 as any);

    const element = await PublicGenerationPage({ params: { shareId: 'share-123' } });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('<img');
    expect(html).not.toContain('<video');
    expect(html).toContain('3');
  });

  it('calls notFound when generation does not exist', async () => {
    mockedGetPublishedGenerationByShareId.mockResolvedValueOnce(null as any);

    await expect(PublicGenerationPage({ params: { shareId: 'missing' } })).rejects.toThrow('NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });
});
