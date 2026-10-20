import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, type Uuid } from '@cdr/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import { recordAuditWithinTransaction } from '../../../../shared/persistence/record-audit-within-transaction';
import { AuditAction, createAuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';
import {
  ImportBatch,
  type ImportBatchSnapshot,
  type ImportFormat,
  type ImportRecord,
  type ImportTarget,
} from '../../domain/entities/import-batch';
import type { ImportBatchRepositoryPort } from '../../domain/ports/import-batch-repository.port';
import {
  importBatches,
  importRows,
  type ImportBatchRow,
  type ImportRowRow,
} from './imports.tables';

@Injectable()
export class DrizzleImportBatchRepository implements ImportBatchRepositoryPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: Uuid): Promise<ImportBatch | null> {
    const [batch] = await this.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, id))
      .limit(1);
    return batch ? this.toDomain(batch, await this.loadRows(batch.id)) : null;
  }

  async findByIdempotency(
    target: ImportTarget,
    idempotencyKey: string,
  ): Promise<ImportBatch | null> {
    const [batch] = await this.db
      .select()
      .from(importBatches)
      .where(
        and(eq(importBatches.target, target), eq(importBatches.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    return batch ? this.toDomain(batch, await this.loadRows(batch.id)) : null;
  }

  async savePreview(batch: ImportBatch): Promise<ImportBatch> {
    const snapshot = batch.toSnapshot();
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(importBatches)
        .values(this.batchValues(snapshot))
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        await tx.insert(importRows).values(
          snapshot.rows.map((row) => ({
            batchId: snapshot.id,
            rowNumber: row.rowNumber,
            valid: row.valid,
            data: row.data,
            metadata: metadataWithWarnings(row.metadata, row.warnings),
            errors: row.errors,
          })),
        );
        return batch;
      }

      const [winner] = await tx
        .select()
        .from(importBatches)
        .where(
          and(
            eq(importBatches.target, snapshot.target),
            eq(importBatches.idempotencyKey, snapshot.idempotencyKey),
          ),
        )
        .limit(1);
      if (!winner) throw new Error('Idempotent import insert lost without a winning row');
      const rows = await tx
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, winner.id))
        .orderBy(asc(importRows.rowNumber));
      return this.toDomain(winner, rows);
    });
  }

  async claimConfirmation(
    id: Uuid,
    audit: AuditWriteContext,
  ): Promise<
    | { readonly kind: 'claimed'; readonly batch: ImportBatch }
    | { readonly kind: 'confirmed'; readonly batch: ImportBatch }
    | { readonly kind: 'busy'; readonly status: string }
    | { readonly kind: 'not_found' }
  > {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, id))
        .for('update')
        .limit(1);
      if (!existing) return { kind: 'not_found' } as const;
      const rows = await tx
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, id))
        .orderBy(asc(importRows.rowNumber));
      const batch = this.toDomain(existing, rows);
      if (existing.status === 'confirmed') return { kind: 'confirmed', batch } as const;
      const staleBefore = new Date(audit.occurredAt.getTime() - CONFIRMATION_LEASE_MS);
      const canClaim =
        existing.status === 'previewed' ||
        (existing.status === 'processing' &&
          (existing.processingStartedAt === null || existing.processingStartedAt < staleBefore));
      if (!canClaim) return { kind: 'busy', status: existing.status } as const;

      const [claimed] = await tx
        .update(importBatches)
        .set({ status: 'processing', processingStartedAt: audit.occurredAt })
        .where(eq(importBatches.id, id))
        .returning();
      if (!claimed) return { kind: 'not_found' } as const;
      await recordAuditWithinTransaction(
        tx,
        createAuditEntry({
          resourceType: 'import_batch',
          resourceId: claimed.id,
          action: AuditAction.Updated,
          actorId: audit.actorId,
          source: `import:${claimed.target}`,
          correlationId: audit.correlationId,
          occurredAt: audit.occurredAt,
          changes: {
            status: { before: existing.status, after: 'processing' },
            processingStartedAt: {
              before: existing.processingStartedAt,
              after: audit.occurredAt,
            },
          },
        }),
      );
      return { kind: 'claimed', batch: this.toDomain(claimed, rows) } as const;
    });
  }

  async updateRowResult(
    batchId: Uuid,
    rowNumber: number,
    valid: boolean,
    errors: readonly string[],
  ): Promise<void> {
    await this.db
      .update(importRows)
      .set({ valid, errors: [...errors] })
      .where(and(eq(importRows.batchId, batchId), eq(importRows.rowNumber, rowNumber)));
  }

  async saveConfirmation(batch: ImportBatch, audit: AuditWriteContext): Promise<void> {
    const snapshot = batch.toSnapshot();
    const validRows = snapshot.rows.filter((row) => row.valid).length;
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(importBatches)
        .where(eq(importBatches.id, snapshot.id))
        .for('update')
        .limit(1);
      if (!current) throw new ConflictError('The claimed import batch no longer exists');
      if (current.status !== 'processing') {
        throw new ConflictError('The import batch no longer owns the confirmation claim', {
          batchId: snapshot.id,
          status: current.status,
        });
      }
      await tx
        .update(importBatches)
        .set({
          status: snapshot.status,
          confirmedAt: snapshot.confirmedAt,
          processingStartedAt: null,
          validRows,
          invalidRows: snapshot.rows.length - validRows,
        })
        .where(eq(importBatches.id, snapshot.id));
      await recordAuditWithinTransaction(
        tx,
        createAuditEntry({
          resourceType: 'import_batch',
          resourceId: snapshot.id,
          action: snapshot.status === 'confirmed' ? AuditAction.Imported : AuditAction.Updated,
          actorId: audit.actorId,
          source: `import:${snapshot.target}`,
          correlationId: audit.correlationId,
          occurredAt: audit.occurredAt,
          changes: {
            status: { before: current.status, after: snapshot.status },
            confirmedAt: { before: current.confirmedAt, after: snapshot.confirmedAt },
            processingStartedAt: { before: current.processingStartedAt, after: null },
            validRows: { before: current.validRows, after: validRows },
            invalidRows: {
              before: current.invalidRows,
              after: snapshot.rows.length - validRows,
            },
          },
        }),
      );
    });
  }

  private loadRows(batchId: string): Promise<ImportRowRow[]> {
    return this.db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batchId))
      .orderBy(asc(importRows.rowNumber));
  }

  private batchValues(snapshot: ImportBatchSnapshot) {
    const validRows = snapshot.rows.filter((row) => row.valid).length;
    return {
      id: snapshot.id,
      target: snapshot.target,
      format: snapshot.format,
      status: snapshot.status,
      idempotencyKey: snapshot.idempotencyKey,
      payloadHash: snapshot.payloadHash,
      categoryCode: snapshot.categoryCode,
      createdBy: snapshot.createdBy,
      totalRows: snapshot.rows.length,
      validRows,
      invalidRows: snapshot.rows.length - validRows,
      createdAt: snapshot.createdAt,
      confirmedAt: snapshot.confirmedAt,
    };
  }

  private toDomain(batch: ImportBatchRow, rows: ImportRowRow[]): ImportBatch {
    return ImportBatch.rehydrate({
      id: batch.id as Uuid,
      target: batch.target as ImportTarget,
      format: batch.format as ImportFormat,
      status: batch.status as ImportBatchSnapshot['status'],
      idempotencyKey: batch.idempotencyKey,
      payloadHash: batch.payloadHash,
      categoryCode: batch.categoryCode,
      createdBy: batch.createdBy,
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        valid: row.valid,
        data: row.data as ImportRecord,
        metadata: row.metadata,
        errors: row.errors as string[],
        warnings: warningsFromMetadata(row.metadata),
      })),
      createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt,
    });
  }
}

const CONFIRMATION_LEASE_MS = 15 * 60 * 1_000;
const WARNINGS_METADATA_KEY = '_warnings';

function metadataWithWarnings(
  metadata: unknown,
  warnings: readonly string[],
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return { ...base, [WARNINGS_METADATA_KEY]: [...warnings] };
}

function warningsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const warnings = (metadata as Record<string, unknown>)[WARNINGS_METADATA_KEY];
  return Array.isArray(warnings)
    ? warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
}
