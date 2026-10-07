import type { Uuid } from '@cdr/shared';

import type {
  AttributeValueSource,
  CatalogAttributeValue,
  CatalogGridProduct,
  CatalogWorkbookColumn,
  CatalogWorkbookProduct,
  DynamicCatalogSchema,
  ProductAttributeCell,
  TemplateAttribute,
} from '../entities/catalog-schema';

export type AttributeFilterOperator = 'eq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';

export interface CatalogAttributeFilter {
  readonly key: string;
  readonly operator: AttributeFilterOperator;
  readonly value: string;
}

export interface CatalogGridOptions {
  readonly categoryId: Uuid;
  readonly roles: readonly string[];
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly filters: readonly CatalogAttributeFilter[];
}

export interface CatalogWorkbookOptions {
  readonly categoryId?: Uuid;
  readonly roles: readonly string[];
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly brand?: string;
  readonly status?: string;
  readonly applicationType?: string;
  readonly completeness?: 'complete' | 'attention' | 'critical';
  readonly filters: readonly CatalogAttributeFilter[];
  readonly columnFilters?: readonly CatalogWorkbookColumnFilter[];
  readonly sort?: CatalogWorkbookSort;
}

export interface CatalogWorkbookColumnFilter {
  readonly key: string;
  readonly values: readonly string[];
}

export interface CatalogWorkbookSort {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

export interface CatalogWorkbookResult {
  readonly columns: readonly CatalogWorkbookColumn[];
  readonly facets: {
    readonly brands: readonly string[];
    readonly applicationTypes: readonly string[];
    readonly statuses: readonly ('draft' | 'in_review' | 'published' | 'archived')[];
  };
  readonly items: readonly CatalogWorkbookProduct[];
  readonly total: number;
}

export interface ProductAttributeAssignment {
  readonly productId: Uuid;
  readonly definition: TemplateAttribute;
}

export interface AttributeChange {
  readonly productId: Uuid;
  readonly before: ProductAttributeCell | null;
  readonly after: ProductAttributeCell | null;
}

export type UpdateAttributePersistenceResult =
  | { readonly kind: 'updated'; readonly changes: readonly AttributeChange[] }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualVersion: number };

export interface AttributeUpdateRequest {
  readonly attributeKey: string;
  readonly value: CatalogAttributeValue | null;
  readonly expectedVersion: number;
}

export interface PersistedAttributeUpdate {
  readonly attributeKey: string;
  readonly changes: readonly AttributeChange[];
}

export type UpdateAttributesPersistenceResult =
  | { readonly kind: 'updated'; readonly updates: readonly PersistedAttributeUpdate[] }
  | { readonly kind: 'not_found'; readonly attributeKey: string }
  | {
      readonly kind: 'version_conflict';
      readonly attributeKey: string;
      readonly actualVersion: number;
    };

export interface DynamicCatalogRepositoryPort {
  listActiveCategories(roles: readonly string[]): Promise<
    readonly {
      id: Uuid;
      slug: string;
      name: string;
      path: string;
      templateId: Uuid;
      templateName: string;
      templateVersion: number;
    }[]
  >;
  getActiveSchema(categoryId: Uuid, roles: readonly string[]): Promise<DynamicCatalogSchema | null>;
  getProductSheet(
    productId: Uuid,
    roles: readonly string[],
  ): Promise<{ schema: DynamicCatalogSchema; product: CatalogGridProduct } | null>;
  listGrid(options: CatalogGridOptions): Promise<{ items: CatalogGridProduct[]; total: number }>;
  listWorkbook(options: CatalogWorkbookOptions): Promise<CatalogWorkbookResult>;
  findProductAttributeAssignment(
    productId: Uuid,
    attributeKey: string,
    roles: readonly string[],
  ): Promise<ProductAttributeAssignment | null>;
  updateAttribute(input: {
    productId: Uuid;
    attributeKey: string;
    value: CatalogAttributeValue | null;
    source: AttributeValueSource;
    expectedVersion: number;
    roles: readonly string[];
    now: Date;
    audit: {
      readonly actorId: string;
      readonly correlationId: string;
    };
  }): Promise<UpdateAttributePersistenceResult>;
  updateAttributes(input: {
    productId: Uuid;
    updates: readonly AttributeUpdateRequest[];
    source: AttributeValueSource;
    roles: readonly string[];
    now: Date;
    audit: {
      readonly actorId: string;
      readonly correlationId: string;
    };
  }): Promise<UpdateAttributesPersistenceResult>;
}

export const DYNAMIC_CATALOG_REPOSITORY = Symbol('DynamicCatalogRepository');
