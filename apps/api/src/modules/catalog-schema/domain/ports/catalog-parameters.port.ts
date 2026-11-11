import type { Uuid } from '@cdr/shared';
import type { AuditMetadata } from './catalog-administration.repository.port';
export type CatalogParameterKind =
  'unit' | 'material' | 'seal' | 'identifier' | 'brand' | 'application' | 'synonym';
export interface CatalogParameter {
  id: Uuid;
  kind: CatalogParameterKind;
  value: string;
  description: string;
  target: string | null;
  logoDataUrl: string | null;
  active: boolean;
  version: number;
  updatedAt: Date;
}
export interface CatalogParametersPort {
  list(kind: CatalogParameterKind): Promise<CatalogParameter[]>;
  save(
    input: Omit<CatalogParameter, 'updatedAt' | 'version'> & {
      expectedVersion: number;
      audit: AuditMetadata;
    },
  ): Promise<CatalogParameter>;
}
export const CATALOG_PARAMETERS = Symbol('CatalogParameters');
