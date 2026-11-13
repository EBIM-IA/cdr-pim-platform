import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DashboardOverview } from '@/components/dashboard-overview';
import { CatalogHome } from '@/components/catalog-home';
import { isAdministrator } from '@/lib/auth';
import { getCurrentActor } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Inicio',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const actor = await getCurrentActor();
  if (!actor?.capabilities.includes('menu:products:view')) redirect('/login');
  if (isAdministrator(actor.roles) && (await searchParams).view === 'dashboard')
    return <DashboardOverview />;
  return <CatalogHome canConfigure={isAdministrator(actor.roles)} />;
}
