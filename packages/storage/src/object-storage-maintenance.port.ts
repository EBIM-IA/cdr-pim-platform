/** Private object inventory and identity-checked physical deletion, separate from serving files. */
export interface StorageObjectIdentity {
  readonly bucket: string;
  readonly key: string;
  readonly identity: string;
  readonly versionId: string | null;
  readonly etag: string | null;
  readonly modifiedAt: Date;
  readonly size: number;
  readonly deleteMarker: boolean;
}
export interface StorageInventoryPage {
  readonly items: readonly StorageObjectIdentity[];
  readonly nextCursor: string | null;
}
export interface ObjectStorageMaintenancePort {
  listPage(input: {
    readonly prefix: string;
    readonly cursor?: string | null;
    readonly limit: number;
  }): Promise<StorageInventoryPage>;
  purgeIdentity(object: StorageObjectIdentity): Promise<'deleted' | 'absent' | 'changed'>;
}
export const OBJECT_STORAGE_MAINTENANCE = Symbol('ObjectStorageMaintenancePort');
