import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { getPublishedGenerationsByUser, getPublishedGenerationsCountByUser, getUserById } from '@/lib/db';
import { PublicGenerationCard } from '@/components/gallery/public-generation-card';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

function buildCreatorGalleryPageUrl(userId: string, page: number): string {
  return page <= 1 ? `/gallery/creator/${userId}` : `/gallery/creator/${userId}?page=${page}`;
}

export default async function CreatorGalleryPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams?: { page?: string };
}) {
  const user = await getUserById(params.userId);
  if (!user) notFound();

  const requestedPage = Math.max(Number(searchParams?.page || '1') || 1, 1);
  const total = await getPublishedGenerationsCountByUser(params.userId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  if (page !== requestedPage) {
    redirect(buildCreatorGalleryPageUrl(params.userId, page));
  }

  const offset = (page - 1) * PAGE_SIZE;
  const items = await getPublishedGenerationsByUser(params.userId, PAGE_SIZE, offset);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <div className="space-y-3">
          <Link href="/gallery" className="inline-flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            返回公开作品广场
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card/60">
              <User className="h-5 w-5 text-foreground/60" />
            </div>
            <div>
              <h1 className="text-3xl font-light">{user.name} 的公开作品</h1>
              <p className="text-sm text-foreground/50">仅展示该创作者已公开的本地作品</p>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center text-foreground/40">
            该创作者暂未公开作品
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
              href={page > 1 ? `/gallery/creator/${params.userId}?page=${page - 1}` : `/gallery/creator/${params.userId}`}
              className={`inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-2 ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-card/70 transition-colors'}`}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Link>
            <Link
              href={page < totalPages ? `/gallery/creator/${params.userId}?page=${page + 1}` : `/gallery/creator/${params.userId}?page=${page}`}
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
