'use client';
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Flame,
  Heart,
  Loader2,
  Play,
  Search,
  User,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { buildCommunityMediaProxyUrl, inferDownloadExtension } from '../../../lib/media-download';

type FeedCut = 'nf2_latest' | 'nf2_top';

interface SearchResult {
  user_id: string;
  username: string;
  display_name: string;
  profile_picture_url: string;
  can_cameo: boolean;
}

interface FeedItem {
  id: string;
  text: string;
  permalink: string;
  preview_image_url: string;
  posted_at: string | number;
  like_count: number;
  view_count: number;
  remix_count: number;
  attachment: {
    kind: string;
    url: string;
    downloadable_url: string;
    width: number;
    height: number;
    n_frames?: number;
    duration_seconds?: number;
    thumbnail_url?: string;
  };
  author: {
    user_id: string;
    username: string;
    display_name: string;
    profile_picture_url: string;
    follower_count?: number;
  };
}

const FEED_PAGE_SIZE = 12;

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

const normalizeTimestamp = (value: string | number): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatPostedAt = (value: string | number): string => {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
};

const getThumbnailUrl = (item: FeedItem): string => {
  return item.attachment?.thumbnail_url || item.preview_image_url || '';
};

const getPlayableUrl = (item: FeedItem): string => {
  return item.attachment?.downloadable_url || item.attachment?.url || '';
};

interface FeedCardProps {
  item: FeedItem;
  onOpen: (item: FeedItem) => void;
  onOpenAuthor: (username: string) => void;
}

const FeedCard = memo(function FeedCard({ item, onOpen, onOpenAuthor }: FeedCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const thumbnailUrl = getThumbnailUrl(item);
  const aspectRatio = item.attachment?.width && item.attachment?.height
    ? item.attachment.width / item.attachment.height
    : 9 / 16;
  const authorName = item.author.display_name || item.author.username || 'Unknown';
  const postedAt = formatPostedAt(item.posted_at);

  return (
    <div className="bg-card/60 border border-border/70 rounded-xl overflow-hidden hover:border-border transition-all group">
      <div className="relative" style={{ aspectRatio }}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="block w-full h-full text-left"
        >
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-card/60 animate-pulse" />
          )}

          {thumbnailUrl && !imageError ? (
            <img
              src={thumbnailUrl}
              alt=""
              className={cn(
                'w-full h-full object-cover transition-opacity duration-300',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-card/60 flex items-center justify-center">
              <Play className="w-8 h-8 text-foreground/30" />
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="w-14 h-14 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-7 h-7 text-foreground ml-1" fill="currentColor" />
            </div>
          </div>

          {item.attachment?.duration_seconds && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-background/70 backdrop-blur-sm rounded text-xs text-foreground font-medium">
              {Math.floor(item.attachment.duration_seconds)}s
            </div>
          )}
        </button>
      </div>

      <div className="p-3 space-y-3">
        {item.text && (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="block w-full text-left"
          >
            <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">{item.text}</p>
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenAuthor(item.author.username)}
          className="w-full flex items-center gap-3 text-left"
        >
          {item.author.profile_picture_url ? (
            <img
              src={item.author.profile_picture_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-card/70"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-card/70 flex items-center justify-center">
              <User className="w-4 h-4 text-foreground/50" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground truncate">{authorName}</p>
            <p className="text-xs text-foreground/40 truncate">
              @{item.author.username}{postedAt ? ` · ${postedAt}` : ''}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-3 text-xs text-foreground/40">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            {formatNumber(item.like_count)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {formatNumber(item.view_count)}
          </span>
          <span className="flex items-center gap-1">
            <Play className="w-3 h-3" />
            {formatNumber(item.remix_count)}
          </span>
        </div>
      </div>
    </div>
  );
});

export default function SquarePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [feedCut, setFeedCut] = useState<FeedCut>('nf2_latest');
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const feedRequestIdRef = useRef(0);
  const feedCutRef = useRef<FeedCut>('nf2_latest');
  const feedAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    feedCutRef.current = feedCut;
  }, [feedCut]);

  useEffect(() => {
    return () => {
      feedAbortControllerRef.current?.abort();
    };
  }, []);

  const handleUserClick = useCallback((username: string) => {
    router.push(`/square/user/${encodeURIComponent(username)}`);
  }, [router]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError('');
    setSearched(true);

    try {
      const params = new URLSearchParams({
        username: searchQuery.trim(),
        intent: 'users',
        limit: '20',
      });
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '搜索失败');
      }

      setResults(data.results || []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '搜索失败');
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const loadFeed = useCallback(async (cursor?: string, cut?: FeedCut) => {
    const nextCut = cut || feedCutRef.current;
    const isLoadMore = Boolean(cursor);
    const requestId = isLoadMore ? feedRequestIdRef.current : feedRequestIdRef.current + 1;

    if (!isLoadMore) {
      feedRequestIdRef.current = requestId;
      feedAbortControllerRef.current?.abort();
    }

    const controller = new AbortController();
    feedAbortControllerRef.current = controller;

    if (isLoadMore) {
      setFeedLoadingMore(true);
    } else {
      setFeedLoading(true);
      setFeedItems([]);
    }
    setFeedError('');

    try {
      const params = new URLSearchParams({
        limit: String(FEED_PAGE_SIZE),
        cut: nextCut,
      });
      if (cursor) {
        params.append('cursor', cursor);
      }

      const response = await fetch(`/api/feed?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '加载社区作品失败');
      }
      if (controller.signal.aborted || requestId !== feedRequestIdRef.current || nextCut !== feedCutRef.current) {
        return;
      }

      const nextItems = Array.isArray(data.items) ? data.items : [];
      setFeedItems((prev) => (cursor ? [...prev, ...nextItems] : nextItems));
      setFeedCursor(data.cursor || null);
      setFeedHasMore(Boolean(data.cursor && nextItems.length > 0));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (requestId !== feedRequestIdRef.current || nextCut !== feedCutRef.current) {
        return;
      }
      setFeedError(error instanceof Error ? error.message : '加载社区作品失败');
      if (!cursor) {
        setFeedItems([]);
      }
      setFeedCursor(null);
      setFeedHasMore(false);
    } finally {
      if (feedAbortControllerRef.current === controller) {
        feedAbortControllerRef.current = null;
      }
      if (requestId === feedRequestIdRef.current && nextCut === feedCutRef.current) {
        setFeedLoading(false);
        setFeedLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadFeed(undefined, feedCut);
  }, [feedCut, loadFeed]);

  useEffect(() => {
    if (!loadMoreRef.current || !feedHasMore || feedLoadingMore || feedLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedCursor && feedHasMore && !feedLoadingMore) {
          void loadFeed(feedCursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [feedCursor, feedHasMore, feedLoading, feedLoadingMore, loadFeed]);

  const handleFeedCutChange = useCallback((cut: FeedCut) => {
    if (cut === feedCut) return;
    setFeedCut(cut);
    setFeedCursor(null);
    setFeedHasMore(true);
  }, [feedCut]);

  const handleDownload = useCallback(async () => {
    if (!selectedItem) return;

    const url = getPlayableUrl(selectedItem);
    if (!url) return;

    const extension = inferDownloadExtension(url, selectedItem.attachment.kind);
    const filename = `sanhub-${selectedItem.id}.${extension}`;

    try {
      const response = await fetch(buildCommunityMediaProxyUrl(url, selectedItem.attachment.kind));
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed', error);
    }
  }, [selectedItem]);

  const handleCopyPrompt = useCallback(async () => {
    const text = selectedItem?.text?.trim();
    if (!text) {
      toast({ title: '没有可复制的提示词', variant: 'destructive' });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '已复制提示词' });
    } catch (error) {
      toast({
        title: '复制失败',
        description: error instanceof Error ? error.message : '无法复制提示词',
        variant: 'destructive',
      });
    }
  }, [selectedItem]);

  const selectedPlayableUrl = selectedItem ? getPlayableUrl(selectedItem) : '';

  return (
    <div className="max-w-7xl mx-auto space-y-8 pt-10">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extralight text-foreground">社区广场</h1>
        <p className="text-foreground/50 font-light">
          搜索创作者，也可以直接浏览公开作品流
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="输入用户名..."
            className="w-full pl-12 pr-24 py-4 bg-card/60 border border-border/70 text-foreground rounded-2xl focus:outline-none focus:border-border placeholder:text-foreground/30 text-lg"
          />
          <button
            type="submit"
            disabled={!searchQuery.trim() || searchLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-foreground text-background rounded-xl font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '搜索'}
          </button>
        </form>

        {searchError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
            {searchError}
          </div>
        )}

        {searched && !searchLoading && (
          <div className="space-y-3">
            {results.length > 0 ? (
              <>
                <p className="text-foreground/50 text-sm">找到 {results.length} 个用户</p>
                <div className="space-y-2">
                  {results.map((user) => (
                    <button
                      key={user.user_id}
                      type="button"
                      onClick={() => handleUserClick(user.username)}
                      className="w-full flex items-center gap-4 p-4 bg-card/60 border border-border/70 rounded-xl hover:bg-card/70 hover:border-border transition-all text-left"
                    >
                      {user.profile_picture_url ? (
                        <img
                          src={user.profile_picture_url}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover bg-card/70"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-card/70 flex items-center justify-center">
                          <User className="w-6 h-6 text-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-medium truncate">
                          {user.display_name || user.username}
                        </p>
                        <p className="text-foreground/50 text-sm">@{user.username}</p>
                      </div>
                      {user.can_cameo && (
                        <span className="px-2 py-1 bg-sky-500/20 text-sky-300 text-xs rounded-lg">
                          角色
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full bg-card/60 flex items-center justify-center">
                  <User className="w-8 h-8 text-foreground/30" />
                </div>
                <p className="text-foreground/40 text-sm">未找到匹配的用户</p>
              </div>
            )}
          </div>
        )}
      </div>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-light text-foreground">公开作品流</h2>
            <p className="text-sm text-foreground/45 mt-1">
              浏览社区最新创作，或切换到热门视图
            </p>
          </div>
          <div className="inline-flex items-center rounded-xl border border-border/70 bg-card/60 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => handleFeedCutChange('nf2_latest')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                feedCut === 'nf2_latest'
                  ? 'bg-foreground text-background'
                  : 'text-foreground/60 hover:text-foreground hover:bg-card/70'
              )}
            >
              <Clock3 className="w-4 h-4" />
              最新
            </button>
            <button
              type="button"
              onClick={() => handleFeedCutChange('nf2_top')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                feedCut === 'nf2_top'
                  ? 'bg-foreground text-background'
                  : 'text-foreground/60 hover:text-foreground hover:bg-card/70'
              )}
            >
              <Flame className="w-4 h-4" />
              热门
            </button>
          </div>
        </div>

        {feedError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {feedError}
          </div>
        )}

        {feedLoading && feedItems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
          </div>
        ) : feedItems.length > 0 ? (
          <div
            className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4"
            style={{ columnFill: 'balance' }}
          >
            {feedItems.map((item) => (
              <div key={item.id} className="break-inside-avoid mb-4">
                <FeedCard
                  item={item}
                  onOpen={setSelectedItem}
                  onOpenAuthor={handleUserClick}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/70 rounded-xl">
            <Play className="w-12 h-12 text-foreground/30 mb-3" />
            <p className="text-foreground/40">当前没有可展示的社区作品</p>
          </div>
        )}

        <div ref={loadMoreRef} className="py-4">
          {feedLoadingMore && (
            <div className="flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-foreground/30" />
            </div>
          )}
          {!feedHasMore && feedItems.length > 0 && (
            <p className="text-center text-foreground/30 text-sm">没有更多了</p>
          )}
        </div>
      </section>

      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-card/95 border border-border/70 rounded-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
              <button
                type="button"
                onClick={() => handleUserClick(selectedItem.author.username)}
                className="flex items-center gap-2 text-left"
              >
                {selectedItem.author.profile_picture_url ? (
                  <img
                    src={selectedItem.author.profile_picture_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-card/70 flex items-center justify-center">
                    <User className="w-4 h-4 text-foreground/50" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedItem.author.display_name || selectedItem.author.username}
                  </p>
                  <p className="text-xs text-foreground/50">@{selectedItem.author.username}</p>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  disabled={!selectedItem.text?.trim()}
                  className="p-2 rounded-lg bg-card/70 hover:bg-card/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="复制提示词"
                >
                  <Copy className="w-5 h-5 text-foreground" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-2 rounded-lg bg-card/70 hover:bg-card/80 transition-colors"
                  title="下载作品"
                >
                  <Download className="w-5 h-5 text-foreground" />
                </button>
                <a
                  href={selectedItem.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-card/70 hover:bg-card/80 transition-colors"
                  title="在 Sora 中打开"
                >
                  <ExternalLink className="w-5 h-5 text-foreground" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="p-2 rounded-lg bg-card/70 hover:bg-card/80 transition-colors"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center bg-card/80 min-h-[320px]">
              {selectedPlayableUrl ? (
                <video
                  src={selectedPlayableUrl}
                  controls
                  autoPlay
                  loop
                  className="max-w-full max-h-[70vh] object-contain"
                  style={{
                    aspectRatio: `${selectedItem.attachment.width}/${selectedItem.attachment.height}`,
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-foreground/40 py-20">
                  <Play className="w-10 h-10" />
                  <p className="text-sm">当前作品没有可播放资源</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-card/95 border-t border-border/70">
              <p className="text-sm text-foreground/80 mb-3">{selectedItem.text || 'No description'}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/40">
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  {formatNumber(selectedItem.like_count)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {formatNumber(selectedItem.view_count)}
                </span>
                <span className="flex items-center gap-1">
                  <Play className="w-3.5 h-3.5" />
                  {formatNumber(selectedItem.remix_count)} remix
                </span>
                <span>{formatPostedAt(selectedItem.posted_at)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
