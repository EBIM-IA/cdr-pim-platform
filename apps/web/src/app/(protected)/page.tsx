import { StatePanel } from '@/components/state-panel';
import { moduleMenuCapabilities, moduleSlugs } from '@/lib/module-definitions';
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
  if (!actor) redirect('/login');
  if (
    !actor.capabilities.includes('menu:products:view') &&
    !actor.capabilities.includes('menu:home:view')
  ) {
    const first = moduleSlugs.find((slug) =>
      actor.capabilities.includes(moduleMenuCapabilities[slug]),
    );
    if (first) redirect(`/${first}`);
    return (
      <StatePanel
        variant="empty"
        title="Sin módulos habilitados"
        description="Solicita a una persona administradora que habilite las pantallas necesarias para tu perfil."
      />
    );
  }
  if (isAdministrator(actor.roles) && (await searchParams).view === 'dashboard')
    return <DashboardOverview />;
  return <CatalogHome canConfigure={isAdministrator(actor.roles)} />;
}
