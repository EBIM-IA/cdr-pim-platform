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

/**
 * Offset pages can shift when another actor changes the catalog list. Discard an inconsistent
 * traversal and retry from page one; a partial set must never reach spreadsheet filters/export.
 */
export async function listAllProductCatalogs(
  query: { q?: string; includeDeleted?: boolean } = {},
  signal?: AbortSignal,
): Promise<ProductCatalogListDto> {
  const pageSize = 100;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal?.throwIfAborted();
    const first = await listProductCatalogs({ ...query, page: 1, pageSize }, signal);
    const total = first.total;
    const items: ProductCatalogDto[] = [];
    const ids = new Set<string>();
    let consistent = true;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    for (let page = 1; page <= pages; page += 1) {
      const next =
        page === 1 ? first : await listProductCatalogs({ ...query, page, pageSize }, signal);
      const expectedCount = Math.min(pageSize, total - (page - 1) * pageSize);
      if (
        next.total !== total ||
        next.page !== page ||
        next.pageSize !== pageSize ||
        next.items.length !== expectedCount ||
        next.items.some((item) => ids.has(item.id))
      ) {
        consistent = false;
        break;
      }
      for (const item of next.items) ids.add(item.id);
      if (ids.size !== items.length + next.items.length) {
        consistent = false;
        break;
      }
      items.push(...next.items);
    }
    if (consistent && ids.size === total) return { ...first, items };
  }
  throw new ProductCatalogsApiError(
    'La lista de catálogos cambió durante la carga. Actualiza para volver a intentarlo; no se pudo obtener una lista completa.',
    409,
  );
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
