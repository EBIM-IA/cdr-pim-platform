import type { Metadata } from 'next';
import { productListQuerySchema, type ProductStatus } from '@cdr/contracts';

import { ProductsCatalog } from '@/components/products-catalog';

export const metadata: Metadata = {
  title: 'Productos',
};

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string | string[];
    brand?: string | string[];
    status?: string | string[];
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const parsed = productListQuerySchema.safeParse({
    q: first(raw.q),
    brand: first(raw.brand),
    status: first(raw.status),
  });
  const initialSearch = parsed.success ? (parsed.data.q ?? '') : '';
  const initialBrand = parsed.success ? (parsed.data.brand ?? '') : '';
  const initialStatus: ProductStatus | '' = parsed.success ? (parsed.data.status ?? '') : '';

  return (
    <ProductsCatalog
      key={JSON.stringify([initialSearch, initialBrand, initialStatus])}
      initialSearch={initialSearch}
      initialBrand={initialBrand}
      initialStatus={initialStatus}
    />
  );
}
