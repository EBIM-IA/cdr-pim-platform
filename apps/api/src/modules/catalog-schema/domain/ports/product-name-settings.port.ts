import type { ProductNameConfig } from '@cdr/contracts';

import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';

export interface ProductNameSettings {
  readonly config: ProductNameConfig;
  readonly version: number;
}
export interface ProductNameSettingsPort {
  get(): Promise<ProductNameSettings>;
  save(input: ProductNameSettings, audit: AuditEntry): Promise<ProductNameSettings>;
}
export const PRODUCT_NAME_SETTINGS = Symbol('ProductNameSettings');
