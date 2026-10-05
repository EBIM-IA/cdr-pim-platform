import {
  type CatalogGridQuery,
  type CatalogGridResultDto,
  type CatalogGridSchemaDto,
  type CatalogCategorySummaryDto,
  type ProductAttributeSheetDto,
  type UpdateProductAttributeInput,
  type UpdatedProductAttributeDto,
  catalogCategoryListSchema,
  catalogGridResultSchema,
  catalogGridSchemaSchema,
  productAttributeSheetSchema,
  updatedProductAttributeSchema,
} from '@cdr/contracts';
import type { ZodType } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

const DYNAMIC_CATALOG_PATH = '/api/catalog/dynamic';

export class DynamicCatalogApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DynamicCatalogApiError';
  }
}

async function request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedBffFetch(`${DYNAMIC_CATALOG_PATH}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? body : undefined;
    throw new DynamicCatalogApiError(
      errorBody && 'message' in errorBody
        ? String(errorBody.message)
        : `La solicitud respondió con estado ${response.status}.`,
      response.status,
      errorBody && 'code' in errorBody ? String(errorBody.code) : undefined,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DynamicCatalogApiError(
      'La respuesta de la hoja de datos no coincide con el contrato compartido.',
    );
  }
  return parsed.data;
}

export function fetchCatalogCategories(signal?: AbortSignal): Promise<CatalogCategorySummaryDto[]> {
  return request('/categories', catalogCategoryListSchema, { signal });
}

export function fetchCatalogSchema(
  categoryId: string,
  signal?: AbortSignal,
): Promise<CatalogGridSchemaDto> {
  const query = new URLSearchParams({ categoryId });
  return request(`/schema?${query.toString()}`, catalogGridSchemaSchema, { signal });
}

export function fetchCatalogGrid(
  query: CatalogGridQuery,
  signal?: AbortSignal,
): Promise<CatalogGridResultDto> {
  const params = new URLSearchParams({
    categoryId: query.categoryId,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  for (const filter of query.filter) params.append('filter', filter);
  return request(`/grid?${params.toString()}`, catalogGridResultSchema, { signal });
}

export function fetchProductAttributeSheet(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductAttributeSheetDto> {
  return request(`/products/${encodeURIComponent(productId)}`, productAttributeSheetSchema, {
    signal,
  });
}

export function patchProductAttribute(
  productId: string,
  attributeKey: string,
  input: UpdateProductAttributeInput,
): Promise<UpdatedProductAttributeDto> {
  return request(
    `/products/${encodeURIComponent(productId)}/attributes/${encodeURIComponent(attributeKey)}`,
    updatedProductAttributeSchema,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}
