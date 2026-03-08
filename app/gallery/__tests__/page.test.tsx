import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).React = React;

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => {
    const value = typeof href === 'string' ? href : href?.pathname || '';
    return <a href={value} {...props}>{children}</a>;
  },
}));

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

vi.mock('@/components/gallery/public-generation-card', () => ({
  PublicGenerationCard: ({ item }: any) => <div data-testid="card">{item.publicShareId}</div>,
}));

vi.mock('@/components/gallery/gallery-back-button', () => ({
  GalleryBackButton: () => <button type="button">返回上一页</button>,
}));

vi.mock('@/lib/db', () => ({
  getPublishedGenerations: vi.fn(),
  getPublishedGenerationsCount: vi.fn(),
  getPublishedGenerationsByUser: vi.fn(),
  getPublishedGenerationsCountByUser: vi.fn(),
  getUserById: vi.fn(),
}));

import GalleryPage from '../page';
import CreatorGalleryPage from '../creator/[userId]/page';
import {
  getPublishedGenerations,
  getPublishedGenerationsCount,
  getPublishedGenerationsByUser,
  getPublishedGenerationsCountByUser,
  getUserById,
} from '@/lib/db';

const mockedGetPublishedGenerations = vi.mocked(getPublishedGenerations);
const mockedGetPublishedGenerationsCount = vi.mocked(getPublishedGenerationsCount);
const mockedGetPublishedGenerationsByUser = vi.mocked(getPublishedGenerationsByUser);
const mockedGetPublishedGenerationsCountByUser = vi.mocked(getPublishedGenerationsCountByUser);
const mockedGetUserById = vi.mocked(getUserById);

const item = {
  id: 'gen-1',
  userId: 'user-1',
  type: 'gemini-image',
  prompt: 'Published prompt',
  params: {},
  resultUrl: 'https://example.com/image.png',
  cost: 100,
  status: 'completed',
  visibility: 'public',
  publicShareId: 'share-123',
  publicViewCount: 3,
  createdAt: 1,
  updatedAt: 2,
  authorName: 'Alice',
  authorId: 'user-1',
};

describe('gallery pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserById.mockResolvedValue({ id: 'user-1', name: 'Alice' } as any);
  });

  it('redirects out-of-range gallery pages to the last canonical page', async () => {
    mockedGetPublishedGenerationsCount.mockResolvedValueOnce(25);

    await expect(GalleryPage({ searchParams: { page: '9' } })).rejects.toThrow('REDIRECT:/gallery?page=2');
    expect(mockedGetPublishedGenerations).not.toHaveBeenCalled();
  });

  it('redirects empty creator gallery pages to the canonical base url', async () => {
    mockedGetPublishedGenerationsCountByUser.mockResolvedValueOnce(0);

    await expect(
      CreatorGalleryPage({ params: { userId: 'user-1' }, searchParams: { page: '9' } })
    ).rejects.toThrow('REDIRECT:/gallery/creator/user-1');
    expect(mockedGetPublishedGenerationsByUser).not.toHaveBeenCalled();
  });

  it('renders a valid gallery page', async () => {
    mockedGetPublishedGenerationsCount.mockResolvedValueOnce(25);
    mockedGetPublishedGenerations.mockResolvedValueOnce([item] as any);

    const element = await GalleryPage({ searchParams: { page: '2' } });
    const html = renderToStaticMarkup(element);

    expect(mockedGetPublishedGenerations).toHaveBeenCalledWith(24, 24);
    expect(html).toContain('第 2 / 2 页');
    expect(html).toContain('share-123');
    expect(html).toContain('返回上一页');
  });
});
