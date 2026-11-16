import { StatePanel } from '@/components/state-panel';
import type { Metadata } from 'next';

import { ProductDetailView } from '@/components/product-detail-view';
import { isAdministrator, isSalesOnly } from '@/lib/auth';
import { getCurrentActor } from '@/lib/server-auth';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export function generateMetadata(): Metadata {
  return { title: 'Detalle de producto' };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor?.capabilities.includes('menu:products:view'))
    return (
      <StatePanel
        variant="error"
        title="Sin permisos para esta pantalla"
        description="El módulo Productos está desactivado para tu perfil."
      />
    );
  const roles = actor?.roles ?? [];
  return (
    <ProductDetailView
      key={id}
      productId={id}
      canWriteAssets={actor?.capabilities.includes('catalog:write') ?? false}
      canReassignTemplate={actor?.capabilities.includes('attributes:write') ?? false}
      canWriteApplications={actor?.capabilities.includes('applications:write') ?? false}
      canWriteEquivalences={actor?.capabilities.includes('equivalences:write') ?? false}
      canViewQuality={actor?.capabilities.includes('menu:ai-quality:view') ?? false}
      showCompleteness={isAdministrator(roles)}
      consumerMode={!isAdministrator(roles)}
      showProductStatus={!isSalesOnly(roles)}
    />
  );
}
