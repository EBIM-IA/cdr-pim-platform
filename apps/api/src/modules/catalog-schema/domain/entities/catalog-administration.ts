import type { Uuid } from '@cdr/shared';

import type { AttributeSourceAuthority, CatalogAttributeDataType } from './catalog-schema';

export type BusinessRole = 'ADMINISTRADOR' | 'COMPRAS' | 'VENTAS';

export interface AttributeRoleAccess {
  readonly role: BusinessRole;
  readonly canView: boolean;
  readonly canEdit: boolean;
  readonly canImport: boolean;
  readonly canExport: boolean;
}

export interface AdminCatalogCategory {
  readonly id: Uuid;
  readonly parentId: Uuid | null;
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly application: string | null;
  readonly sourcePriority: Readonly<
    Partial<Record<'tecdoc' | 'fabricante' | 'archivo' | 'manual', number>>
  >;
  readonly position: number;
  readonly active: boolean;
  readonly updatedAt: Date;
}

export interface AdminTemplateAttribute {
  readonly id: Uuid;
  readonly key: string;
  readonly label: string;
  readonly dataType: CatalogAttributeDataType;
  readonly unit: string | null;
  readonly allowedValues: readonly string[];
  readonly sourceAuthority: AttributeSourceAuthority;
  readonly required: boolean;
  readonly replicable: boolean;
  readonly searchable: boolean;
  readonly includeInTechnicalSheet: boolean;
  readonly active: boolean;
  readonly position: number;
  readonly updatedAt: Date;
  readonly roleAccess: readonly AttributeRoleAccess[];
}

export interface AdminAttributeTemplate {
  readonly id: Uuid;
  readonly categoryId: Uuid;
  readonly categoryName: string;
  readonly name: string;
  readonly version: number;
  readonly status: 'draft' | 'active' | 'retired';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attributes?: readonly AdminTemplateAttribute[];
}
