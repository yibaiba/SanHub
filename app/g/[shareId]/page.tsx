/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { ArrowLeft, Download, Eye, User } from 'lucide-react';
import { getPublishedGenerationByShareId, incrementPublishedGenerationViewCount } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { resolveExpectedMediaType } from '../../../lib/media-url-validator';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicGenerationPage({ params }: { params: { shareId: string } }) {
  const generation = await getPublishedGenerationByShareId(params.shareId);
  if (!generation) notFound();

  const expectedMediaType = resolveExpectedMediaType(generation.type);
  if (!expectedMediaType) notFound();

  const displayViews = await incrementPublishedGenerationViewCount(params.shareId);
  const mediaUrl = `/api/public/generations/${params.shareId}/media`;
  const downloadUrl = `${mediaUrl}?raw=true`;
  const isVideo = expectedMediaType === 'video';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Link href="/gallery" className="inline-flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              返回公开作品广场
            </Link>
            <h1 className="text-3xl font-light">公开作品详情</h1>
          </div>
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-background hover:opacity-90 transition-opacity"
          >
            <Download className="h-4 w-4" />
            下载作品
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/40">
          <div className="flex items-center justify-center bg-card/60 p-4">
            {isVideo ? (
              <video src={mediaUrl} controls autoPlay loop className="max-h-[70vh] w-full rounded-2xl object-contain" />
            ) : (
              <img src={mediaUrl} alt={generation.prompt || 'published generation'} className="max-h-[70vh] w-full rounded-2xl object-contain" />
            )}
          </div>
          <div className="space-y-4 border-t border-border/70 p-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/50">
              <span>{formatDate(generation.createdAt)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {displayViews}
              </span>
              <span>·</span>
              <Link href={`/gallery/creator/${generation.authorId}`} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                <User className="h-4 w-4" />
                {generation.authorName}
              </Link>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/80">
                {generation.prompt || '无提示词'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
