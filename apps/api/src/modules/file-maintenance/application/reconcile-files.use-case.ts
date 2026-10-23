import { fileMaintenanceErrorCode } from '../domain/entities/file-maintenance-error';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { type Clock, getCorrelationId, newUuid } from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import {
  PRODUCT_ASSET_OBJECT_REFERENCES,
  type ProductAssetObjectReferencesPort,
} from '../../product-assets/domain/ports/product-asset-object-references.port';
import {
  PRODUCT_CATALOG_OBJECT_REFERENCES,
  type ProductCatalogObjectReferencesPort,
} from '../../product-catalogs/domain/ports/product-catalog-object-references.port';
import {
  DEFAULT_FILE_MAINTENANCE_OPTIONS,
  FILE_INVENTORY,
  FILE_MAINTENANCE_OPTIONS,
  FILE_MAINTENANCE_REPOSITORY,
  type FileInventoryPort,
  type FileMaintenanceOptions,
  type FileMaintenanceRepositoryPort,
  type FileObjectIdentity,
  type FileObjectLockScope,
  type FileObjectReference,
} from '../domain/ports/file-maintenance.port';

const NAMESPACES = ['products/', 'product-catalogs/'] as const;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PRODUCT_KEY = new RegExp(
  `^products/${UUID}/(?:images|documents)/${UUID}\\.(?:pdf|png|jpg|jpeg|webp|dwg)$`,
  'iu',
);
const CATALOG_KEY = new RegExp(`^product-catalogs/${UUID}/${UUID}\\.pdf$`, 'iu');
export const managedFileKey = (key: string): boolean =>
  PRODUCT_KEY.test(key) || CATALOG_KEY.test(key);
export interface FileCleanupSummary {
  readonly status: 'disabled' | 'busy' | 'completed';
  pages: number;
  observed: number;
  protected: number;
  deleted: number;
  absent: number;
  changed: number;
  failed: number;
  reclaimedBytes: number;
  failureCodes: Record<string, number>;
}
@Injectable()
export class ReconcileFilesUseCase {
  private readonly options: FileMaintenanceOptions;
  constructor(
    @Inject(FILE_MAINTENANCE_REPOSITORY) private readonly repository: FileMaintenanceRepositoryPort,
    @Inject(FILE_INVENTORY) private readonly inventory: FileInventoryPort,
    @Inject(PRODUCT_ASSET_OBJECT_REFERENCES)
    private readonly assets: ProductAssetObjectReferencesPort,
    @Inject(PRODUCT_CATALOG_OBJECT_REFERENCES)
    private readonly catalogs: ProductCatalogObjectReferencesPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(FILE_MAINTENANCE_OPTIONS) options?: FileMaintenanceOptions,
  ) {
    this.options = options ?? DEFAULT_FILE_MAINTENANCE_OPTIONS;
  }
  async execute(): Promise<FileCleanupSummary> {
    const summary: FileCleanupSummary = {
      status: this.options.enabled ? 'completed' : 'disabled',
      pages: 0,
      observed: 0,
      protected: 0,
      deleted: 0,
      absent: 0,
      changed: 0,
      failed: 0,
      reclaimedBytes: 0,
      failureCodes: {},
    };
    if (!this.options.enabled) return summary;
    const began = this.clock.now(),
      deadline = Date.now() + this.options.maxRunMs;
    const result = await this.repository.withRunLock(
      began,
      this.options.maxRunMs + 60000,
      async () => {
        for (const namespace of NAMESPACES) {
          let cursor = await this.repository.cursor(namespace);
          for (let page = 0; page < this.options.maxPagesPerRun && Date.now() < deadline; page++) {
            const inventory = await this.inventory.listPage({
              prefix: namespace,
              cursor,
              limit: this.options.pageSize,
            });
            if (inventory.nextCursor && inventory.nextCursor === cursor)
              throw new Error('Object inventory cursor did not advance');
            const items = inventory.items.filter((object) => managedFileKey(object.key));
            const byBucket = new Map<string, FileObjectIdentity[]>();
            for (const object of items) {
              const group = byBucket.get(object.bucket) ?? [];
              group.push(object);
              byBucket.set(object.bucket, group);
            }
            for (const [bucket, objects] of byBucket) {
              const references = await this.references(
                bucket,
                objects.map((object) => object.key),
              );
              const now = this.clock.now();
              await this.repository.observeBatch(
                objects.map((object) => ({
                  object,
                  unreferencedAt: references.some(
                    (reference) => reference.key === object.key && reference.protected,
                  )
                    ? null
                    : now,
                })),
                now,
              );
              summary.protected += objects.filter((object) =>
                references.some((reference) => reference.key === object.key && reference.protected),
              ).length;
            }
            summary.pages++;
            summary.observed += items.length;
            cursor = inventory.nextCursor;
            await this.repository.saveCursor(namespace, cursor, this.clock.now());
            if (!cursor) break;
          }
        }
        const cutoff = new Date(this.clock.now().getTime() - 30 * 86400000);
        const candidates = await this.repository.due(cutoff, this.options.maxObjectsPerRun);
        for (const candidate of candidates) {
          if (Date.now() >= deadline) break;
          try {
            await this.repository.withCandidate(candidate.id, async (current, scope) => {
              if (!managedFileKey(current.object.key) || current.firstUnreferencedAt > cutoff) {
                await this.repository.preserve(current.id, scope);
                return;
              }
              const references = await this.references(
                current.object.bucket,
                [current.object.key],
                scope,
              );
              if (
                references.some(
                  (reference) =>
                    reference.protected || (reference.retiredAt && reference.retiredAt > cutoff),
                )
              ) {
                await this.repository.preserve(current.id, scope);
                summary.protected++;
                return;
              }
              const outcome = await this.inventory.purgeIdentity(current.object);
              if (outcome === 'changed') {
                await this.repository.preserve(current.id, scope);
                summary.changed++;
                return;
              }
              const now = this.clock.now();
              await this.repository.complete(
                current.id,
                now,
                createAuditEntry({
                  resourceType: 'file_cleanup',
                  resourceId: current.id,
                  action: AuditAction.Deleted,
                  actorId: null,
                  source: 'system:file-maintenance',
                  correlationId: getCorrelationId() ?? newUuid(),
                  occurredAt: now,
                  changes: {
                    outcome: { after: outcome },
                    retainedDays: { after: 30 },
                    bytes: { before: current.object.size, after: outcome === 'deleted' ? 0 : null },
                    namespace: {
                      after: current.object.key.startsWith('products/')
                        ? 'products'
                        : 'product-catalogs',
                    },
                  },
                }),
                scope,
              );
              if (outcome === 'deleted') {
                summary.deleted++;
                summary.reclaimedBytes += current.object.size;
              } else summary.absent++;
            });
          } catch (error) {
            summary.failed++;
            const code = fileMaintenanceErrorCode(error);
            summary.failureCodes[code] = (summary.failureCodes[code] ?? 0) + 1;
            await this.repository.fail(candidate.id, this.clock.now());
          }
        }
        return summary;
      },
    );
    return result ?? { ...summary, status: 'busy' };
  }
  private async references(
    bucket: string,
    keys: readonly string[],
    scope?: FileObjectLockScope,
  ): Promise<readonly FileObjectReference[]> {
    // Sequential on a transaction scope: postgres.js transactions use one connection.
    const assets = await this.assets.inspect(bucket, keys, scope);
    const catalogs = await this.catalogs.inspect(bucket, keys, scope);
    return [...assets, ...catalogs];
  }
}
