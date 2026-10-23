import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import { DependencyUnavailableError, isDomainError, newUuid } from '@cdr/shared';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import {
  transactionForFileScope,
  withFileObjectLock,
} from '../../../../shared/persistence/file-object-lock';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type {
  CleanupCandidate,
  FileMaintenanceRepositoryPort,
  FileObjectIdentity,
  FileObjectLockScope,
} from '../../domain/ports/file-maintenance.port';
import {
  fileCleanupCandidates,
  fileInventoryCursors,
  fileMaintenanceLeases,
} from './file-maintenance.tables';
@Injectable()
export class DrizzleFileMaintenanceRepository implements FileMaintenanceRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('file-maintenance-database');
    }
  }
  async withRunLock<T>(now: Date, leaseMs: number, work: () => Promise<T>): Promise<T | null> {
    const token = newUuid();
    const [claimed] = await this.safe(() =>
      this.db
        .insert(fileMaintenanceLeases)
        .values({ name: 'file-cleanup', token, expiresAt: new Date(now.getTime() + leaseMs) })
        .onConflictDoUpdate({
          target: fileMaintenanceLeases.name,
          set: { token, expiresAt: new Date(now.getTime() + leaseMs) },
          where: lte(fileMaintenanceLeases.expiresAt, now),
        })
        .returning(),
    );
    if (!claimed) return null;
    try {
      return await work();
    } finally {
      await this.safe(() =>
        this.db
          .delete(fileMaintenanceLeases)
          .where(
            and(
              eq(fileMaintenanceLeases.name, 'file-cleanup'),
              eq(fileMaintenanceLeases.token, token),
            ),
          ),
      );
    }
  }
  async cursor(namespace: string): Promise<string | null> {
    const [row] = await this.safe(() =>
      this.db
        .select()
        .from(fileInventoryCursors)
        .where(eq(fileInventoryCursors.namespace, namespace)),
    );
    return row?.cursor ?? null;
  }
  async observeBatch(
    observations: readonly { object: FileObjectIdentity; unreferencedAt: Date | null }[],
    now: Date,
  ): Promise<void> {
    if (!observations.length) return;
    await this.safe(() =>
      this.db
        .insert(fileCleanupCandidates)
        .values(
          observations.map(({ object, unreferencedAt }) => ({
            id: newUuid(),
            bucket: object.bucket,
            objectKey: object.key,
            identity: object.identity,
            versionId: object.versionId,
            etag: object.etag,
            modifiedAt: object.modifiedAt,
            size: object.size,
            deleteMarker: object.deleteMarker,
            firstUnreferencedAt: unreferencedAt,
            lastObservedAt: now,
            status: unreferencedAt ? ('pending' as const) : ('protected' as const),
          })),
        )
        .onConflictDoUpdate({
          target: [
            fileCleanupCandidates.bucket,
            fileCleanupCandidates.objectKey,
            fileCleanupCandidates.identity,
          ],
          set: {
            lastObservedAt: now,
            firstUnreferencedAt: sql`CASE WHEN ${fileCleanupCandidates.status} = 'deleted' THEN ${fileCleanupCandidates.firstUnreferencedAt} WHEN excluded.first_unreferenced_at IS NULL THEN NULL ELSE COALESCE(${fileCleanupCandidates.firstUnreferencedAt}, excluded.first_unreferenced_at) END`,
            status: sql`CASE WHEN ${fileCleanupCandidates.status} = 'deleted' THEN 'deleted' ELSE excluded.status END`,
          },
        }),
    );
  }
  async saveCursor(namespace: string, cursor: string | null, now: Date): Promise<void> {
    await this.safe(() =>
      this.db
        .insert(fileInventoryCursors)
        .values({ namespace, cursor, updatedAt: now })
        .onConflictDoUpdate({
          target: fileInventoryCursors.namespace,
          set: { cursor, updatedAt: now },
        }),
    );
  }
  async due(cutoff: Date, limit: number): Promise<CleanupCandidate[]> {
    const rows = await this.safe(() =>
      this.db
        .select()
        .from(fileCleanupCandidates)
        .where(
          and(
            eq(fileCleanupCandidates.status, 'pending'),
            lte(fileCleanupCandidates.firstUnreferencedAt, cutoff),
          ),
        )
        .orderBy(
          sql`${fileCleanupCandidates.lastAttemptAt} ASC NULLS FIRST`,
          fileCleanupCandidates.firstUnreferencedAt,
          fileCleanupCandidates.id,
        )
        .limit(limit),
    );
    return rows.map(candidate);
  }
  async withCandidate<T>(
    id: string,
    work: (candidate: CleanupCandidate, scope: FileObjectLockScope) => Promise<T>,
  ): Promise<T | null> {
    const [known] = await this.safe(() =>
      this.db
        .select({ key: fileCleanupCandidates.objectKey })
        .from(fileCleanupCandidates)
        .where(eq(fileCleanupCandidates.id, id)),
    );
    if (!known) return null;
    return this.safe(() =>
      withFileObjectLock(this.db, known.key, async (scope) => {
        const tx = transactionForFileScope(scope);
        const [row] = await tx
          .select()
          .from(fileCleanupCandidates)
          .where(and(eq(fileCleanupCandidates.id, id), eq(fileCleanupCandidates.status, 'pending')))
          .for('update');
        if (!row) return null;
        return work(candidate(row), scope);
      }),
    );
  }
  async preserve(id: string, scope: FileObjectLockScope): Promise<void> {
    await transactionForFileScope(scope)
      .update(fileCleanupCandidates)
      .set({ status: 'protected', firstUnreferencedAt: null })
      .where(eq(fileCleanupCandidates.id, id));
  }
  async complete(
    id: string,
    now: Date,
    audit: AuditEntry,
    scope: FileObjectLockScope,
  ): Promise<void> {
    const tx = transactionForFileScope(scope);
    await tx
      .update(fileCleanupCandidates)
      .set({
        status: 'deleted',
        completedAt: now,
        lastAttemptAt: now,
        attempts: sql`${fileCleanupCandidates.attempts} + 1`,
      })
      .where(eq(fileCleanupCandidates.id, id));
    await recordAuditWithinTransaction(tx, audit);
  }
  async fail(id: string, now: Date): Promise<void> {
    await this.safe(() =>
      this.db
        .update(fileCleanupCandidates)
        .set({ attempts: sql`${fileCleanupCandidates.attempts} + 1`, lastAttemptAt: now })
        .where(and(eq(fileCleanupCandidates.id, id), eq(fileCleanupCandidates.status, 'pending'))),
    );
  }
}
function candidate(row: typeof fileCleanupCandidates.$inferSelect): CleanupCandidate {
  return {
    id: row.id,
    object: {
      bucket: row.bucket,
      key: row.objectKey,
      identity: row.identity,
      versionId: row.versionId,
      etag: row.etag,
      modifiedAt: row.modifiedAt,
      size: row.size,
      deleteMarker: row.deleteMarker,
    },
    firstUnreferencedAt: row.firstUnreferencedAt!,
  };
}
