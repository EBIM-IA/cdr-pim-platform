import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DashboardOverview } from '@/components/dashboard-overview';
import { getCurrentActor } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Inicio',
};

export default async function DashboardPage() {
  const actor = await getCurrentActor();
  if (!actor?.capabilities.includes('menu:home:view')) redirect('/products');
  return <DashboardOverview />;
}
