import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  CatalogWithShares,
  ProductCatalog,
  ProductCatalogShare,
} from '../entities/product-catalog';

export interface CatalogMutation {
  readonly catalog: ProductCatalog;
  readonly shares: readonly ProductCatalogShare[];
  readonly audit: AuditEntry;
}
export type CatalogVersion = Date | { readonly shareId: string; readonly updatedAt: Date };
export interface CatalogMetrics {
  catalogs: number;
  current: number;
  expiring: number;
  expired: number;
  scheduled: number;
  activeLinks: number;
  deleted: number;
}
export interface ProductCatalogRepositoryPort {
  list(query: {
    readonly page: number;
    readonly pageSize: number;
    readonly q?: string;
    readonly includeDeleted?: boolean;
    readonly now: Date;
  }): Promise<{ items: CatalogWithShares[]; total: number; metrics: CatalogMetrics }>;
  find(id: string): Promise<CatalogWithShares | null>;
  insert(
    catalog: ProductCatalog,
    audit: AuditEntry,
    assertObjectAvailable?: () => Promise<void>,
  ): Promise<CatalogWithShares>;
  mutate(
    id: string,
    expectedUpdatedAt: CatalogVersion,
    change: (current: CatalogWithShares) => CatalogMutation,
    assertObjectAvailable?: () => Promise<void>,
  ): Promise<CatalogWithShares>;
  accessShared(
    digest: string,
    now: Date,
    visit: boolean,
    authorize: (current: CatalogWithShares, share: ProductCatalogShare) => void,
  ): Promise<{ catalog: ProductCatalog; share: ProductCatalogShare } | null>;
}
export const PRODUCT_CATALOG_REPOSITORY = Symbol('ProductCatalogRepositoryPort');
export interface CatalogBinaryStoragePort {
  put(key: string, content: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}
export const CATALOG_BINARY_STORAGE = Symbol('CatalogBinaryStoragePort');
export interface CatalogShareTokenPort {
  generate(): { token: string; digest: string };
  digest(token: string): string;
}
export const CATALOG_SHARE_TOKEN = Symbol('CatalogShareTokenPort');
