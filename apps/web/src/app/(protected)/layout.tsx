import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { safeReturnTo } from '@/lib/auth';
import { isModuleSlug, moduleMenuCapabilities } from '@/lib/module-definitions';
import { getCurrentActor } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getCurrentActor();
  if (!actor) {
    const returnTo = safeReturnTo((await headers()).get('x-cdr-return-to'));
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  // Middleware supplies the actual request path. Resolve its module using the same
  // effective menu policy as the pages; enabling a menu never grants write capabilities.
  const path = safeReturnTo((await headers()).get('x-cdr-return-to')).split(/[?#]/u)[0] ?? '/';
  const route = path.split('/')[1] ?? '';
  const required =
    route === 'products'
      ? 'menu:products:view'
      : isModuleSlug(route)
        ? moduleMenuCapabilities[route]
        : null;
  if (required && !actor.capabilities.includes(required)) redirect('/');
  return <AppShell actor={actor}>{children}</AppShell>;
}
