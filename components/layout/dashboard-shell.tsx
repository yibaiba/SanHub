'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { SafeUser } from '@/types';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { AnnouncementBanner } from '@/components/ui/announcement';

interface DashboardShellProps {
  user: SafeUser;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const isWorkspaceDetail = pathname.startsWith('/workspace/') && pathname !== '/workspace';

  return (
    <>
      {!isWorkspaceDetail && <Header user={user} />}
      <div className="flex relative z-10 min-h-screen">
        {isWorkspaceDetail ? (
          <aside className="fixed left-0 top-0 bottom-0 w-12 border-r border-border/70 bg-card/70 backdrop-blur">
            <Link
              href="/workspace"
              className="mt-4 ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-foreground/70 transition hover:border-border hover:text-foreground"
              title="返回工作空间"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </aside>
        ) : (
          <Sidebar user={user} />
        )}
        <main
          className={cn(
            'flex-1 min-w-0',
            isWorkspaceDetail
              ? 'ml-12 p-0 h-screen overflow-hidden'
              : 'lg:ml-56 p-6 lg:p-8 mt-14'
          )}
        >
          {!isWorkspaceDetail && <AnnouncementBanner />}
          {children}
        </main>
      </div>
    </>
  );
}
