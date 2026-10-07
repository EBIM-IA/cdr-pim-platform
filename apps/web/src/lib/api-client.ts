import {
  API_PREFIX,
  type ApiError,
  type CatalogGridQuery,
  type CatalogGridResultDto,
  type CatalogGridSchemaDto,
  type CatalogWorkbookQuery,
  type CatalogWorkbookResultDto,
  type CatalogCategorySummaryDto,
  type LivenessResponse,
  type ProductDto,
  type ProductListDto,
  type ProductStatus,
  type ReadinessResponse,
  type SemanticSearchResponse,
  type ProductAttributeSheetDto,
  type UpdateProductAttributeInput,
  type UpdateProductAttributesBatchInput,
  type UpdatedProductAttributeDto,
  type UpdatedProductAttributesBatchDto,
  type WorkspaceDto,
  type WorkspaceSlug,
  apiErrorSchema,
  catalogCategoryListSchema,
  catalogGridResultSchema,
  catalogGridSchemaSchema,
  catalogWorkbookResultSchema,
  livenessResponseSchema,
  productListSchema,
  productAttributeSheetSchema,
  productSchema,
  readinessResponseSchema,
  semanticSearchResponseSchema,
  updatedProductAttributeSchema,
  updatedProductAttributesBatchSchema,
  workspaceSchema,
} from '@cdr/contracts';
import type { ZodTypeAny, z } from 'zod';

import { env } from '@/lib/env';
import { upstreamTimeoutSignal } from '@/lib/http-security';

/**
 * The single place the web app talks to the API.
 *
 * Two properties matter here:
 *
 *  1. **Every response is parsed with the shared contract schema.** If the API changes
 *     shape, the failure surfaces at the boundary with a clear message instead of as
 *     `undefined` deep inside a component.
 *  2. **Every request carries a correlation id**, so a user-reported problem can be traced
 *     through the API and the worker logs from one identifier.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Forwarded as `x-correlation-id`; generated when absent. */
  readonly correlationId?: string;
  readonly accessToken?: string;
  /** Next.js fetch caching. Defaults to no store: PIM data is edited constantly. */
  readonly revalidateSeconds?: number;
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  health(): Promise<LivenessResponse> {
    return this.get('/health/live', livenessResponseSchema);
  }

  readiness(): Promise<ReadinessResponse> {
    // A "down" readiness is still a well-formed 503 body, so it is read as data.
    return this.get('/health/ready', readinessResponseSchema, [200, 503]);
  }

  listProducts(
    page = 1,
    pageSize = 10,
    filters: { q?: string; brand?: string; status?: ProductStatus } = {},
  ): Promise<ProductListDto> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters.q) query.set('q', filters.q);
    if (filters.brand) query.set('brand', filters.brand);
    if (filters.status) query.set('status', filters.status);
    return this.get(`/products?${query.toString()}`, productListSchema);
  }

  getProduct(id: string): Promise<ProductDto> {
    return this.get(`/products/${encodeURIComponent(id)}`, productSchema);
  }

  listCatalogCategories(): Promise<CatalogCategorySummaryDto[]> {
    return this.get('/catalog/categories', catalogCategoryListSchema);
  }

  getCatalogGridSchema(categoryId: string): Promise<CatalogGridSchemaDto> {
    const query = new URLSearchParams({ categoryId });
    return this.get(`/catalog/schema?${query.toString()}`, catalogGridSchemaSchema);
  }

  listCatalogGrid(query: CatalogGridQuery): Promise<CatalogGridResultDto> {
    const params = new URLSearchParams({
      categoryId: query.categoryId,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.q) params.set('q', query.q);
    for (const filter of query.filter) params.append('filter', filter);
    return this.get(`/catalog/grid?${params.toString()}`, catalogGridResultSchema);
  }

  listCatalogWorkbook(query: CatalogWorkbookQuery): Promise<CatalogWorkbookResultDto> {
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
    return this.get(`/catalog/workbook?${params.toString()}`, catalogWorkbookResultSchema);
  }

  getProductAttributeSheet(productId: string): Promise<ProductAttributeSheetDto> {
    return this.get(
      `/catalog/products/${encodeURIComponent(productId)}`,
      productAttributeSheetSchema,
    );
  }

  getProductTechnicalSheet(productId: string): Promise<ProductAttributeSheetDto> {
    return this.get(
      `/catalog/products/${encodeURIComponent(productId)}/technical-sheet`,
      productAttributeSheetSchema,
    );
  }

  updateProductAttribute(
    productId: string,
    attributeKey: string,
    input: UpdateProductAttributeInput,
  ): Promise<UpdatedProductAttributeDto> {
    return this.request(
      `/catalog/products/${encodeURIComponent(productId)}/attributes/${encodeURIComponent(attributeKey)}`,
      updatedProductAttributeSchema,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }

  updateProductAttributes(
    productId: string,
    input: UpdateProductAttributesBatchInput,
  ): Promise<UpdatedProductAttributesBatchDto> {
    return this.request(
      `/catalog/products/${encodeURIComponent(productId)}/attributes`,
      updatedProductAttributesBatchSchema,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }

  semanticSearch(query: string, limit = 10): Promise<SemanticSearchResponse> {
    return this.get(
      `/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`,
      semanticSearchResponseSchema,
    );
  }

  getWorkspace(slug: WorkspaceSlug): Promise<WorkspaceDto> {
    return this.get(`/workspaces/${encodeURIComponent(slug)}`, workspaceSchema);
  }

  private async get<T extends ZodTypeAny>(
    path: string,
    schema: T,
    acceptedStatuses: number[] = [200],
  ): Promise<z.infer<T>> {
    return this.request(path, schema, { method: 'GET' }, acceptedStatuses);
  }

  private async request<T extends ZodTypeAny>(
    path: string,
    schema: T,
    init: Pick<RequestInit, 'method' | 'body'>,
    acceptedStatuses: number[] = [200],
  ): Promise<z.infer<T>> {
    const correlationId = this.options.correlationId ?? crypto.randomUUID();

    const response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'x-correlation-id': correlationId,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(this.options.accessToken
          ? { authorization: `Bearer ${this.options.accessToken}` }
          : {}),
      },
      ...(this.options.revalidateSeconds === undefined
        ? { cache: 'no-store' as const }
        : { next: { revalidate: this.options.revalidateSeconds } }),
      signal: upstreamTimeoutSignal(),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!acceptedStatuses.includes(response.status)) {
      const parsed = apiErrorSchema.safeParse(body);
      const error: ApiError['error'] | undefined = parsed.success ? parsed.data.error : undefined;
      throw new ApiClientError(
        response.status,
        error?.code ?? 'UNEXPECTED_RESPONSE',
        error?.message ?? `Request to ${path} failed with status ${response.status}`,
        error?.correlationId ?? correlationId,
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ApiClientError(
        response.status,
        'CONTRACT_MISMATCH',
        `The API response for ${path} does not match the shared contract: ${result.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
        correlationId,
      );
    }
    return result.data;
  }
}

/** Server-side client. Uses the internal base URL, which may not be publicly routable. */
export function createServerApiClient(options: Partial<ApiClientOptions> = {}): ApiClient {
  return new ApiClient({
    baseUrl: env.API_BASE_URL,
    ...options,
  });
}
