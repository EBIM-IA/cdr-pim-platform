import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { PreviewImportInput } from '@cdr/contracts';
import {
  type Clock,
  ConflictError,
  NotFoundError,
  assertUuid,
  getCorrelationId,
  newUuid,
} from '@cdr/shared';

import { CLOCK } from '../../../shared/tokens';
import { AuditAction, createAuditEntry } from '../../audit/domain/entities/audit-entry';
import { AUDIT_PORT, type AuditPort } from '../../audit/domain/ports/audit.port';
import type { AuthenticatedActor } from '../../identity/domain/entities/role';
import { ImportBatch } from '../domain/entities/import-batch';
import {
  IMPORT_BATCH_REPOSITORY,
  type ImportBatchRepositoryPort,
} from '../domain/ports/import-batch-repository.port';
import { parseImportPayload } from './parse-import-payload';

@Injectable()
export class PreviewImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PreviewImportInput, actorId: string): Promise<ImportBatch> {
    const rows = parseImportPayload(input);
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          target: input.target,
          format: input.format,
          categoryCode: input.categoryCode ?? null,
          rows: rows.map((row) => row.data),
        }),
      )
      .digest('hex');
    const existing = await this.repository.findByIdempotency(input.target, input.idempotencyKey);
    if (existing) return assertSamePayload(existing, payloadHash);

    const preview = ImportBatch.preview(
      {
        target: input.target,
        format: input.format,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        categoryCode: input.categoryCode ?? null,
        createdBy: actorId,
        rows,
      },
      this.clock.now(),
    );
    return assertSamePayload(await this.repository.savePreview(preview), payloadHash);
  }
}

@Injectable()
export class GetImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
  ) {}

  async execute(id: string): Promise<ImportBatch> {
    const batch = await this.repository.findById(assertUuid(id, 'importBatchId'));
    if (!batch) throw new NotFoundError('ImportBatch', id);
    return batch;
  }
}

@Injectable()
export class ConfirmImportBatchUseCase {
  constructor(
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly repository: ImportBatchRepositoryPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(id: string, actor: AuthenticatedActor): Promise<ImportBatch> {
    const batch = await this.repository.findById(assertUuid(id, 'importBatchId'));
    if (!batch) throw new NotFoundError('ImportBatch', id);
    const before = batch.toSnapshot();
    const now = this.clock.now();
    batch.confirm(now);
    await this.repository.saveConfirmation(batch);
    const after = batch.toSnapshot();
    if (before.status !== after.status) {
      await this.audit.record(
        createAuditEntry({
          resourceType: 'import_batch',
          resourceId: after.id,
          action: AuditAction.Imported,
          actorId: actor.id,
          source: `import:${after.target}`,
          correlationId: getCorrelationId() ?? newUuid(),
          occurredAt: now,
          changes: {
            status: { before: before.status, after: after.status },
            confirmedAt: { before: before.confirmedAt, after: after.confirmedAt },
          },
        }),
      );
    }
    return (await this.repository.findById(after.id)) ?? batch;
  }
}

function assertSamePayload(batch: ImportBatch, payloadHash: string): ImportBatch {
  const snapshot = batch.toSnapshot();
  if (snapshot.payloadHash !== payloadHash) {
    throw new ConflictError('The idempotency key was already used with a different payload', {
      batchId: snapshot.id,
      target: snapshot.target,
    });
  }
  return batch;
}
