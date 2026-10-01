import { productListSchema, productSchema } from '@cdr/contracts';

import { toProductListView, toProductView } from '@/lib/product-view';
import type { Product, ProductListResult, ProductQuery } from '@/lib/types';

const PRODUCTS_PROXY_PATH = '/api/catalog/products';

export class CatalogApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La API respondió con estado ${response.status}.`;
    throw new CatalogApiError(message, response.status);
  }
  return body;
}

export async function fetchProducts(
  query: ProductQuery = {},
  signal?: AbortSignal,
): Promise<ProductListResult> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.q) params.set('q', query.q);
  if (query.brand) params.set('brand', query.brand);
  if (query.status) params.set('status', query.status);

  const response = await fetch(`${PRODUCTS_PROXY_PATH}?${params.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const parsed = productListSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CatalogApiError('La respuesta del catálogo no coincide con el contrato compartido.');
  }
  return toProductListView(parsed.data);
}

export async function fetchProduct(id: string, signal?: AbortSignal): Promise<Product> {
  const response = await fetch(`${PRODUCTS_PROXY_PATH}/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const parsed = productSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new CatalogApiError('La respuesta del producto no coincide con el contrato compartido.');
  }
  return toProductView(parsed.data);
}
