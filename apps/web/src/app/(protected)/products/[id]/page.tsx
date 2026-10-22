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
  const roles = actor?.roles ?? [];
  return (
    <ProductDetailView
      key={id}
      productId={id}
      canWriteAssets={actor?.capabilities.includes('catalog:write') ?? false}
      canReassignTemplate={actor?.capabilities.includes('attributes:write') ?? false}
      showCompleteness={isAdministrator(roles)}
      showProductStatus={!isSalesOnly(roles)}
    />
  );
}
