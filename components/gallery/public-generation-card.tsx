/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { Eye, Play, User } from 'lucide-react';
import type { PublishedGenerationRecord } from '@/lib/db';
import { formatDate, truncate } from '@/lib/utils';
import { resolveExpectedMediaType } from '../../lib/media-url-validator';
import { buildGenerationSharePath } from '@/lib/generation-urls';

export function PublicGenerationCard({ item }: { item: PublishedGenerationRecord }) {
  if (!item.publicShareId) {
    return null;
  }

  const mediaUrl = `/api/public/generations/${item.publicShareId}/media`;
  const detailUrl = buildGenerationSharePath(item.publicShareId);
  const authorUrl = `/gallery/creator/${item.authorId}`;
  const expectedMediaType = resolveExpectedMediaType(item.type);
  if (!expectedMediaType) {
    return null;
  }
  const isVideo = expectedMediaType === 'video';

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
      <Link href={detailUrl} prefetch={false} className="block bg-card/40">
        {isVideo ? (
          <video
            src={mediaUrl}
            className="aspect-video w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={mediaUrl}
            alt={item.prompt || 'published generation'}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        )}
      </Link>
      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <Link href={detailUrl} prefetch={false} className="block text-sm text-foreground hover:text-foreground/80 transition-colors">
            {item.prompt ? truncate(item.prompt, 96) : '无提示词'}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/40">
            <span>{formatDate(item.createdAt)}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {item.publicViewCount ?? 0}
            </span>
            {isVideo && (
              <span className="inline-flex items-center gap-1">
                <Play className="h-3.5 w-3.5" />
                视频
              </span>
            )}
          </div>
        </div>
        <Link href={authorUrl} className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground transition-colors">
          <User className="h-4 w-4" />
          {item.authorName}
        </Link>
      </div>
    </div>
  );
}
