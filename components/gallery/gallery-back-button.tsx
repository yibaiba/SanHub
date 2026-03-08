'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function GalleryBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-2 hover:bg-card/80 transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      返回上一页
    </button>
  );
}
