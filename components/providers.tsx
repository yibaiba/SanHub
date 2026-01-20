'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/toaster';
import { SiteConfigProvider, ExtendedSiteConfig } from '@/components/providers/site-config-provider';

interface ProvidersProps {
  children: React.ReactNode;
  initialSiteConfig?: ExtendedSiteConfig;
}

export function Providers({ children, initialSiteConfig }: ProvidersProps) {
  return (
    <SessionProvider
      // Refetch session every 5 minutes to keep it fresh
      refetchInterval={5 * 60}
      // Refetch when window regains focus
      refetchOnWindowFocus={true}
    >
      <SiteConfigProvider initialConfig={initialSiteConfig}>
        {children}
        <Toaster />
      </SiteConfigProvider>
    </SessionProvider>
  );
}
