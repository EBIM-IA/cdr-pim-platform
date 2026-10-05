import { Inject, Injectable } from '@nestjs/common';
import type { Uuid } from '@cdr/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
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

  async saveConfirmation(batch: ImportBatch): Promise<void> {
    const snapshot = batch.toSnapshot();
    await this.db
      .update(importBatches)
      .set({ status: snapshot.status, confirmedAt: snapshot.confirmedAt })
      .where(eq(importBatches.id, snapshot.id));
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
        errors: row.errors as string[],
      })),
      createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt,
    });
  }
}
