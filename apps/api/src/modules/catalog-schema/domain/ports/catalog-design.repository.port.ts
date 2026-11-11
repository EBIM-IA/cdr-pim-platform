import type { Uuid } from '@cdr/shared';
import type {
  AdminCatalogCategory,
  AdminAttributeTemplate,
} from '../entities/catalog-administration';
import type { CatalogAttributeDataType, CatalogAttributeValue } from '../entities/catalog-schema';
import type { AuditMetadata } from './catalog-administration.repository.port';

export interface InheritancePreview {
  unifiedCode: string;
  sourceSkus: string[];
  attributes: {
    key: string;
    label: string;
    required: boolean;
    replicable: boolean;
    value: CatalogAttributeValue | null;
    conflict: boolean;
  }[];
}
export interface CategorySkuAssignmentRow {
  sku: string;
  categorySlug: string;
  variantKey?: string;
}
export interface CategorySkuAssignmentPreviewRow extends CategorySkuAssignmentRow {
  expectedTemplateId: Uuid | null;
  targetTemplateId: Uuid | null;
  error: string | null;
}
export interface CatalogDesignRepositoryPort {
  exportCategoryAssignments(): Promise<
    {
      sku: string;
      categorySlug: string | null;
      categoryPath: string | null;
      variantKey: string | null;
    }[]
  >;
  previewCategoryAssignments(
    rows: readonly CategorySkuAssignmentRow[],
  ): Promise<{ rows: CategorySkuAssignmentPreviewRow[] }>;
  confirmCategoryAssignments(
    rows: readonly (CategorySkuAssignmentRow & {
      expectedTemplateId: Uuid | null;
      targetTemplateId: Uuid;
    })[],
    audit: AuditMetadata,
  ): Promise<{ changed: number }>;
  createCategory(input: {
    id: Uuid;
    name: string;
    slug: string;
    parentId: Uuid | null;
    position: number;
    audit: AuditMetadata;
  }): Promise<AdminCatalogCategory>;
  moveCategory(input: {
    id: Uuid;
    parentId: Uuid | null;
    expectedUpdatedAt: Date;
    audit: AuditMetadata;
  }): Promise<AdminCatalogCategory>;
  configureTemplate(input: {
    id: Uuid;
    categoryId: Uuid;
    mode: 'assign' | 'copy' | 'empty';
    sourceTemplateId?: Uuid;
    name: string;
    expectedUpdatedAt: Date;
    audit: AuditMetadata;
  }): Promise<AdminAttributeTemplate>;
  addAttribute(input: {
    id: Uuid;
    templateId: Uuid;
    key: string;
    label: string;
    dataType: CatalogAttributeDataType;
    unit: string | null;
    allowedValues: string[];
    expectedUpdatedAt: Date;
    audit: AuditMetadata;
  }): Promise<AdminAttributeTemplate>;
  previewInheritance(templateId: Uuid, unifiedCode: string): Promise<InheritancePreview>;
}
export const CATALOG_DESIGN_REPOSITORY = Symbol('CatalogDesignRepository');
