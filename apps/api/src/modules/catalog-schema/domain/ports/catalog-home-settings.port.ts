import type { CatalogHomeConfig } from '@cdr/contracts';

import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';

export interface CatalogHomeSettings {
  readonly config: CatalogHomeConfig;
  readonly version: number;
}
export interface CatalogHomeSettingsPort {
  get(): Promise<CatalogHomeSettings>;
  save(input: CatalogHomeSettings, audit: AuditEntry): Promise<CatalogHomeSettings>;
}
export const CATALOG_HOME_SETTINGS = Symbol('CatalogHomeSettings');
