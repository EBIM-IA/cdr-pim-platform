import { IMPORT_EXECUTION_LEASE_MS } from '../../domain/ports/import-execution.port';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { importExecutionSchema, type ImportExecutionDto } from '@cdr/contracts';
import {
  assertUuid,
  ConflictError,
  DependencyUnavailableError,
  isDomainError,
  newUuid,
} from '@cdr/shared';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../../../database/drizzle.client';
import { DATABASE } from '../../../../shared/tokens';
import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
import type {
  ClaimedImportExecution,
  ImportExecutionPort,
} from '../../domain/ports/import-execution.port';
import { importExecutions } from './import-executions.tables';
import { importBatches } from './imports.tables';
const LEASE_MS = 20 * 60 * 1000;
const actorSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  roles: z.array(z.enum(['ADMINISTRADOR', 'COMPRAS', 'VENTAS', 'ADMIN', 'EDITOR', 'VIEWER'])),
});
function dto(row: typeof importExecutions.$inferSelect): ImportExecutionDto {
  return importExecutionSchema.parse({
    ...row,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
}
@Injectable()
export class DrizzleImportExecutionAdapter implements ImportExecutionPort {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() @Inject(IMPORT_EXECUTION_LEASE_MS) private readonly leaseMs = LEASE_MS,
  ) {}
  async enqueue(
    batchId: Parameters<ImportExecutionPort['enqueue']>[0],
    totalRows: number,
    actor: AuthenticatedActor,
    now: Date,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [batch] = await tx
          .select()
          .from(importBatches)
          .where(eq(importBatches.id, batchId))
          .for('update');
        const [existing] = await tx
          .select()
          .from(importExecutions)
          .where(eq(importExecutions.batchId, batchId));
        if (existing) return dto(existing);
        if (!batch || batch.status !== 'previewed')
          throw new ConflictError('El lote ya no está disponible para encolar.');
        const [row] = await tx
          .insert(importExecutions)
          .values({ batchId, totalRows, actor, queuedAt: now, updatedAt: now })
          .returning();
        return dto(row!);
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('import-execution', error);
    }
  }
  async get(batchId: Parameters<ImportExecutionPort['get']>[0]) {
    try {
      const [row] = await this.db
        .select()
        .from(importExecutions)
        .where(eq(importExecutions.batchId, batchId));
      return row ? dto(row) : null;
    } catch (error) {
      throw new DependencyUnavailableError('import-execution', error);
    }
  }
  async claim(
    batchId: Parameters<ImportExecutionPort['get']>[0],
    now: Date,
  ): Promise<ClaimedImportExecution | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(importExecutions)
          .where(
            and(
              eq(importExecutions.batchId, batchId),
              sql`(${importExecutions.status}='queued' OR (${importExecutions.status}='processing' AND ${importExecutions.leaseUntil}<${now.toISOString()}::timestamptz))`,
            ),
          )
          .limit(1)
          .for('update');
        const row = rows[0];
        if (!row) return null;
        const token = newUuid();
        await tx
          .update(importExecutions)
          .set({
            status: 'processing',
            leaseToken: token,
            leaseUntil: new Date(now.getTime() + this.leaseMs),
            startedAt: row.startedAt ?? now,
            updatedAt: now,
          })
          .where(eq(importExecutions.batchId, row.batchId));
        return { batchId: assertUuid(row.batchId), token, actor: actorSchema.parse(row.actor) };
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('import-execution', error);
    }
  }
  async undispatched(limit: number) {
    try {
      const rows = await this.db
        .select({ batchId: importExecutions.batchId })
        .from(importExecutions)
        .where(
          sql`${importExecutions.status}='queued' AND ${importExecutions.dispatchedAt} IS NULL`,
        )
        .orderBy(importExecutions.queuedAt)
        .limit(limit);
      return rows.map((row) => assertUuid(row.batchId));
    } catch (error) {
      throw new DependencyUnavailableError('import-execution-dispatch', error);
    }
  }
  async markDispatched(batchId: Parameters<ImportExecutionPort['get']>[0], now: Date) {
    try {
      await this.db
        .update(importExecutions)
        .set({ dispatchedAt: now })
        .where(eq(importExecutions.batchId, batchId));
    } catch (error) {
      throw new DependencyUnavailableError('import-execution-dispatch', error);
    }
  }
  async progress(claim: ClaimedImportExecution, processedRows: number, now: Date) {
    try {
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .update(importExecutions)
          .set({
            processedRows,
            updatedAt: now,
            leaseUntil: new Date(now.getTime() + this.leaseMs),
          })
          .where(
            and(
              eq(importExecutions.batchId, claim.batchId),
              eq(importExecutions.leaseToken, claim.token),
              eq(importExecutions.status, 'processing'),
            ),
          )
          .returning();
        if (!rows.length) throw new ConflictError('La ejecución perdió su turno de procesamiento.');
        await tx
          .update(importBatches)
          .set({ processingStartedAt: now })
          .where(and(eq(importBatches.id, claim.batchId), eq(importBatches.status, 'processing')));
      });
    } catch (error) {
      if (isDomainError(error)) throw error;
      throw new DependencyUnavailableError('import-execution', error);
    }
  }
  async finish(claim: ClaimedImportExecution, error: string | null, now: Date) {
    try {
      await this.db
        .update(importExecutions)
        .set({
          status: error ? 'failed' : 'completed',
          error,
          updatedAt: now,
          completedAt: now,
          leaseUntil: null,
          leaseToken: null,
          ...(error ? {} : { processedRows: sql`${importExecutions.totalRows}` }),
        })
        .where(
          and(
            eq(importExecutions.batchId, claim.batchId),
            eq(importExecutions.leaseToken, claim.token),
          ),
        );
    } catch (cause) {
      throw new DependencyUnavailableError('import-execution', cause);
    }
  }
}
