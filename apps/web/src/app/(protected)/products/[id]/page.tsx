import type { Metadata } from 'next';

import { ProductDetailView } from '@/components/product-detail-view';
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
  return (
    <ProductDetailView
      key={id}
      productId={id}
      canWriteAssets={actor?.capabilities.includes('catalog:write') ?? false}
    />
  );
}
