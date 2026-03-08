import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { GalleryBackButton } from '@/components/gallery/gallery-back-button';
import { getPublishedGenerations, getPublishedGenerationsCount } from '@/lib/db';
import { PublicGenerationCard } from '@/components/gallery/public-generation-card';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

function buildGalleryPageUrl(page: number): string {
  return page <= 1 ? '/gallery' : `/gallery?page=${page}`;
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const requestedPage = Math.max(Number(searchParams?.page || '1') || 1, 1);
  const total = await getPublishedGenerationsCount();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  if (page !== requestedPage) {
    redirect(buildGalleryPageUrl(page));
  }

  const offset = (page - 1) * PAGE_SIZE;
  const items = await getPublishedGenerations(PAGE_SIZE, offset);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-foreground/50">
              <Sparkles className="h-3.5 w-3.5" />
              SanHub Gallery
            </div>
            <h1 className="text-3xl font-light">公开作品广场</h1>
            <p className="text-sm text-foreground/50">浏览 SanHub 用户主动公开的本地作品</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <GalleryBackButton />
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2 text-foreground/70 hover:bg-card/70 hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </Link>
            <Link href="/login" className="rounded-xl bg-foreground px-4 py-2 text-background hover:opacity-90 transition-opacity">
              登录后进入工作台
            </Link>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center text-foreground/40">
            暂无公开作品
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <PublicGenerationCard key={item.publicShareId || item.id} item={item} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-foreground/50">
          <span>第 {page} / {totalPages} 页 · 共 {total} 个公开作品</span>
          <div className="flex items-center gap-2">
            <Link
              href={page > 1 ? `/gallery?page=${page - 1}` : '/gallery'}
              className={`inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-2 ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-card/70 transition-colors'}`}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Link>
            <Link
              href={page < totalPages ? `/gallery?page=${page + 1}` : `/gallery?page=${page}`}
              className={`inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-2 ${page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-card/70 transition-colors'}`}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
