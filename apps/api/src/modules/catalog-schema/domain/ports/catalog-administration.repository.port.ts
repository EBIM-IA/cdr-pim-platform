import type { Uuid } from '@cdr/shared';

import type {
  AdminAttributeTemplate,
  AdminCatalogCategory,
  AdminTemplateAttribute,
  AttributeRoleAccess,
} from '../entities/catalog-administration';

export type AdminMutationResult<T> =
  | { readonly kind: 'updated'; readonly before: T; readonly after: T }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualUpdatedAt: Date };

export interface CatalogAdministrationRepositoryPort {
  listCategories(includeInactive: boolean): Promise<readonly AdminCatalogCategory[]>;
  updateCategory(input: {
    id: Uuid;
    name?: string;
    active?: boolean;
    position?: number;
    expectedUpdatedAt: Date;
    audit: AuditMetadata;
  }): Promise<AdminMutationResult<AdminCatalogCategory>>;
  listTemplates(categoryId?: Uuid): Promise<readonly AdminAttributeTemplate[]>;
  getTemplate(id: Uuid): Promise<AdminAttributeTemplate | null>;
  updateTemplateAttribute(input: {
    templateId: Uuid;
    attributeDefinitionId: Uuid;
    active?: boolean;
    required?: boolean;
    replicable?: boolean;
    searchable?: boolean;
    includeInTechnicalSheet?: boolean;
    position?: number;
    roleAccess?: readonly AttributeRoleAccess[];
    expectedUpdatedAt: Date;
    audit: AuditMetadata;
  }): Promise<AdminMutationResult<AdminTemplateAttribute>>;
}

export interface AuditMetadata {
  readonly actorId: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export const CATALOG_ADMINISTRATION_REPOSITORY = Symbol('CatalogAdministrationRepository');
