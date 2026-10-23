import {
  type ProductCatalogCreateInput,
  type ProductCatalogDetailDto,
  type ProductCatalogDto,
  type ProductCatalogGeneratedShareDto,
  type ProductCatalogListDto,
  type ProductCatalogShareCreateInput,
  type ProductCatalogShareDto,
  type ProductCatalogUpdateInput,
  productCatalogDetailSchema,
  productCatalogGeneratedShareSchema,
  productCatalogListSchema,
  productCatalogSchema,
  productCatalogShareSchema,
} from '@cdr/contracts';
import type { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

export class ProductCatalogsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ProductCatalogsApiError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await authenticatedBffFetch(`/api/product-catalogs${path}`, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación respondió con estado ${response.status}.`;
    throw new ProductCatalogsApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ProductCatalogsApiError('No se pudo interpretar la respuesta de catálogos.', 502);
  return parsed.data;
}

export function listProductCatalogs(
  query: { page?: number; pageSize?: number; q?: string; includeDeleted?: boolean } = {},
  signal?: AbortSignal,
): Promise<ProductCatalogListDto> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 100),
    includeDeleted: String(query.includeDeleted ?? false),
  });
  if (query.q?.trim()) params.set('q', query.q.trim());
  return request(`?${params}`, productCatalogListSchema, { signal });
}

/** Fetch every page so spreadsheet filters and export never silently omit later results. */
export async function listAllProductCatalogs(
  query: { q?: string; includeDeleted?: boolean } = {},
  signal?: AbortSignal,
): Promise<ProductCatalogListDto> {
  const first = await listProductCatalogs({ ...query, page: 1, pageSize: 100 }, signal);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await listProductCatalogs({ ...query, page, pageSize: 100 }, signal);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  return { ...first, items: unique };
}

export function getProductCatalog(
  id: string,
  signal?: AbortSignal,
): Promise<ProductCatalogDetailDto> {
  return request(`/${encodeURIComponent(id)}`, productCatalogDetailSchema, { signal });
}

function metadataForm(
  input: ProductCatalogCreateInput | ProductCatalogUpdateInput,
  file?: File,
): FormData {
  const body = new FormData();
  body.set('title', input.title);
  body.set('description', input.description);
  body.set('validFrom', input.validFrom);
  body.set('validUntil', input.validUntil ?? '');
  if ('expectedUpdatedAt' in input) body.set('expectedUpdatedAt', input.expectedUpdatedAt);
  if (file) body.set('file', file);
  return body;
}

export function createProductCatalog(
  input: ProductCatalogCreateInput,
  file: File,
): Promise<ProductCatalogDto> {
  return request('', productCatalogSchema, { method: 'POST', body: metadataForm(input, file) });
}
export function updateProductCatalog(
  id: string,
  input: ProductCatalogUpdateInput,
  file?: File,
): Promise<ProductCatalogDto> {
  return request(`/${encodeURIComponent(id)}`, productCatalogSchema, {
    method: 'POST',
    body: metadataForm(input, file),
  });
}

const jsonVersion = (expectedUpdatedAt: string) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expectedUpdatedAt }),
});
export function deleteProductCatalog(
  id: string,
  expectedUpdatedAt: string,
): Promise<ProductCatalogDto> {
  return request(`/${encodeURIComponent(id)}`, productCatalogSchema, {
    method: 'DELETE',
    ...jsonVersion(expectedUpdatedAt),
  });
}
export function restoreProductCatalog(
  id: string,
  expectedUpdatedAt: string,
): Promise<ProductCatalogDto> {
  return request(`/${encodeURIComponent(id)}/restore`, productCatalogSchema, {
    method: 'POST',
    ...jsonVersion(expectedUpdatedAt),
  });
}
export function createProductCatalogShare(
  id: string,
  input: ProductCatalogShareCreateInput,
): Promise<ProductCatalogGeneratedShareDto> {
  return request(`/${encodeURIComponent(id)}/shares`, productCatalogGeneratedShareSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
export function revokeProductCatalogShare(
  id: string,
  shareId: string,
  expectedUpdatedAt: string,
): Promise<ProductCatalogShareDto> {
  return request(
    `/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}/revoke`,
    productCatalogShareSchema,
    {
      method: 'POST',
      ...jsonVersion(expectedUpdatedAt),
    },
  );
}
export function productCatalogDownloadUrl(
  id: string,
  disposition: 'inline' | 'attachment' = 'inline',
): string {
  return `/api/product-catalogs/${encodeURIComponent(id)}/file?disposition=${disposition}`;
}
