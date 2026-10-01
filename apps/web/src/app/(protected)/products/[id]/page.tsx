import type { Metadata } from 'next';

import { ProductDetailView } from '@/components/product-detail-view';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export function generateMetadata(): Metadata {
  return { title: 'Detalle de producto' };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  return <ProductDetailView key={id} productId={id} />;
}
