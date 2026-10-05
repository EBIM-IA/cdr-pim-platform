import type { Uuid } from '@cdr/shared';

import type {
  AttributeValueSource,
  CatalogAttributeValue,
  CatalogGridProduct,
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

export interface ProductAttributeAssignment {
  readonly productId: Uuid;
  readonly definition: TemplateAttribute;
}

export interface AttributeChange {
  readonly productId: Uuid;
  readonly before: ProductAttributeCell | null;
  readonly after: ProductAttributeCell;
}

export type UpdateAttributePersistenceResult =
  | { readonly kind: 'updated'; readonly changes: readonly AttributeChange[] }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualVersion: number };

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
  findProductAttributeAssignment(
    productId: Uuid,
    attributeKey: string,
    roles: readonly string[],
  ): Promise<ProductAttributeAssignment | null>;
  updateAttribute(input: {
    productId: Uuid;
    attributeKey: string;
    value: CatalogAttributeValue;
    source: AttributeValueSource;
    expectedVersion: number;
    roles: readonly string[];
    now: Date;
    audit: {
      readonly actorId: string;
      readonly correlationId: string;
    };
  }): Promise<UpdateAttributePersistenceResult>;
}

export const DYNAMIC_CATALOG_REPOSITORY = Symbol('DynamicCatalogRepository');
