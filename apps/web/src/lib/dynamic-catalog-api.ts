import {
  type CatalogGridQuery,
  type CatalogGridResultDto,
  type CatalogGridSchemaDto,
  type CatalogWorkbookQuery,
  type CatalogWorkbookResultDto,
  type CatalogCategorySummaryDto,
  type ProductAttributeSheetDto,
  type UpdateProductAttributeInput,
  type UpdateProductAttributesBatchInput,
  type UpdatedProductAttributeDto,
  type UpdatedProductAttributesBatchDto,
  catalogCategoryListSchema,
  catalogGridResultSchema,
  catalogGridSchemaSchema,
  catalogWorkbookResultSchema,
  productAttributeSheetSchema,
  updatedProductAttributeSchema,
  updatedProductAttributesBatchSchema,
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

export function fetchCatalogWorkbook(
  query: CatalogWorkbookQuery,
  signal?: AbortSignal,
): Promise<CatalogWorkbookResultDto> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.q) params.set('q', query.q);
  if (query.brand) params.set('brand', query.brand);
  if (query.status) params.set('status', query.status);
  if (query.applicationType) params.set('applicationType', query.applicationType);
  if (query.completeness) params.set('completeness', query.completeness);
  for (const filter of query.filter) params.append('filter', filter);
  for (const filter of query.columnFilter ?? []) params.append('columnFilter', filter);
  if (query.sort) params.set('sort', query.sort);
  return request(`/workbook?${params.toString()}`, catalogWorkbookResultSchema, { signal });
}

export function fetchProductAttributeSheet(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductAttributeSheetDto> {
  return request(`/products/${encodeURIComponent(productId)}`, productAttributeSheetSchema, {
    signal,
  });
}

export function fetchProductTechnicalSheet(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductAttributeSheetDto> {
  return request(
    `/products/${encodeURIComponent(productId)}/technical-sheet`,
    productAttributeSheetSchema,
    { signal },
  );
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

export function patchProductAttributes(
  productId: string,
  input: UpdateProductAttributesBatchInput,
  signal?: AbortSignal,
): Promise<UpdatedProductAttributesBatchDto> {
  return request(
    `/products/${encodeURIComponent(productId)}/attributes`,
    updatedProductAttributesBatchSchema,
    { method: 'PATCH', body: JSON.stringify(input), signal },
  );
}
