import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';

export interface FileObjectIdentity {
  readonly bucket: string;
  readonly key: string;
  readonly identity: string;
  readonly versionId: string | null;
  readonly etag: string | null;
  readonly modifiedAt: Date;
  readonly size: number;
  readonly deleteMarker: boolean;
}
export interface FileInventoryPort {
  listPage(input: {
    readonly prefix: string;
    readonly cursor?: string | null;
    readonly limit: number;
  }): Promise<{
    readonly items: readonly FileObjectIdentity[];
    readonly nextCursor: string | null;
  }>;
  purgeIdentity(object: FileObjectIdentity): Promise<'deleted' | 'absent' | 'changed'>;
}
export const FILE_INVENTORY = Symbol('FileInventoryPort');
/** Opaque transaction scope: adapters share one connection without exposing a driver inward. */
export interface FileObjectLockScope {
  readonly id: symbol;
}
export interface FileObjectReference {
  readonly key: string;
  readonly protected: boolean;
  readonly retiredAt: Date | null;
}
export interface FileObjectReferencesPort {
  inspect(
    bucket: string,
    keys: readonly string[],
    scope?: FileObjectLockScope,
  ): Promise<readonly FileObjectReference[]>;
}
export interface CleanupCandidate {
  readonly id: string;
  readonly object: FileObjectIdentity;
  readonly firstUnreferencedAt: Date;
}
export interface FileMaintenanceRepositoryPort {
  withRunLock<T>(now: Date, leaseMs: number, work: () => Promise<T>): Promise<T | null>;
  cursor(namespace: string): Promise<string | null>;
  observeBatch(
    observations: readonly {
      readonly object: FileObjectIdentity;
      readonly unreferencedAt: Date | null;
    }[],
    now: Date,
  ): Promise<void>;
  saveCursor(namespace: string, cursor: string | null, now: Date): Promise<void>;
  due(cutoff: Date, limit: number): Promise<readonly CleanupCandidate[]>;
  withCandidate<T>(
    id: string,
    work: (candidate: CleanupCandidate, scope: FileObjectLockScope) => Promise<T>,
  ): Promise<T | null>;
  preserve(id: string, scope: FileObjectLockScope): Promise<void>;
  complete(id: string, now: Date, audit: AuditEntry, scope: FileObjectLockScope): Promise<void>;
  fail(id: string, now: Date): Promise<void>;
}
export const FILE_MAINTENANCE_REPOSITORY = Symbol('FileMaintenanceRepositoryPort');
export interface FileMaintenanceOptions {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly retentionDays: 30;
  readonly pageSize: number;
  readonly maxPagesPerRun: number;
  readonly maxObjectsPerRun: number;
  readonly maxRunMs: number;
}
export const FILE_MAINTENANCE_OPTIONS = Symbol('FileMaintenanceOptions');
export const DEFAULT_FILE_MAINTENANCE_OPTIONS: FileMaintenanceOptions = {
  enabled: false,
  intervalMs: 3600000,
  retentionDays: 30,
  pageSize: 100,
  maxPagesPerRun: 1,
  maxObjectsPerRun: 100,
  maxRunMs: 60000,
};
