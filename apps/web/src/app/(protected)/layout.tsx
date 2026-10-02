import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { safeReturnTo } from '@/lib/auth';
import { getCurrentActor } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getCurrentActor();
  if (!actor) {
    const returnTo = safeReturnTo((await headers()).get('x-cdr-return-to'));
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return <AppShell actor={actor}>{children}</AppShell>;
}
