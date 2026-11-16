import type { ImportExecutionDto } from '@cdr/contracts';
import {
  assertUuid,
  ConflictError,
  DependencyUnavailableError,
  FixedClock,
  ValidationError,
} from '@cdr/shared';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../identity/domain/entities/role';
import { ImportBatch } from '../domain/entities/import-batch';
import type { ImportBatchRepositoryPort } from '../domain/ports/import-batch-repository.port';
import type { ImportExecutionPort } from '../domain/ports/import-execution.port';
import type { ConfirmImportBatchUseCase } from './manage-import-batches.use-cases';
import { ImportExecutionUseCases } from './import-execution.use-cases';

const now = new Date('2026-11-16T18:00:00.000Z');
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };

function setup() {
  const batch = ImportBatch.preview(
    {
      target: 'homologs',
      format: 'json',
      idempotencyKey: 'retry-test',
      payloadHash: 'test',
      categoryCode: null,
      createdBy: actor.id,
      rows: [{ rowNumber: 1, valid: true, data: {}, errors: [], warnings: [] }],
    },
    now,
  );
  const batchId = batch.toSnapshot().id;
  const queued: ImportExecutionDto = {
    batchId,
    status: 'queued',
    processedRows: 0,
    totalRows: 1,
    queuedAt: now.toISOString(),
    startedAt: null,
    updatedAt: now.toISOString(),
    completedAt: null,
    error: null,
  };
  const claim = { batchId, token: assertUuid('10000000-0000-4000-8000-000000000001'), actor };
  const executions = {
    enqueue: vi.fn(),
    get: vi.fn().mockResolvedValue(queued),
    claim: vi.fn().mockResolvedValue(claim),
    undispatched: vi.fn(),
    markDispatched: vi.fn(),
    progress: vi.fn(),
    finish: vi.fn(),
  } satisfies ImportExecutionPort;
  const findById = vi.fn().mockResolvedValue(batch);
  const confirm = { execute: vi.fn() };
  const service = new ImportExecutionUseCases(
    executions,
    { findById } as unknown as ImportBatchRepositoryPort,
    confirm as unknown as ConfirmImportBatchUseCase,
    new FixedClock(now),
  );
  return { service, batch, batchId, findById, confirm, executions, claim };
}

describe('Import execution recovery', () => {
  it('keeps a busy synchronous confirmation retryable and reconciles its later committed result', async () => {
    const { service, batch, batchId, confirm, executions, claim } = setup();
    batch.startConfirmation();
    confirm.execute.mockRejectedValueOnce(new ConflictError('El lote ya está siendo confirmado'));
    await expect(service.processBatch(batchId)).rejects.toThrow('ya está siendo confirmado');
    expect(executions.finish).not.toHaveBeenCalled();
    expect(batch.toSnapshot().status).toBe('processing');
    batch.confirm(now);
    confirm.execute.mockResolvedValueOnce(batch);
    await expect(service.processBatch(batchId)).resolves.toBeUndefined();
    expect(executions.finish).toHaveBeenCalledWith(claim, null, now);
  });

  it('reconciles a confirmation committed while its final response reports a conflict', async () => {
    const { service, batch, batchId, confirm, executions, claim } = setup();
    confirm.execute.mockImplementation(async () => {
      batch.confirm(now);
      throw new ConflictError('La respuesta llegó después de la confirmación');
    });
    await expect(service.processBatch(batchId)).resolves.toBeUndefined();
    expect(executions.finish).toHaveBeenCalledWith(claim, null, now);
  });

  it.each([new DependencyUnavailableError('database'), new Error('Connection reset')])(
    'does not permanently fail a valid queued import on transient read failure: %s',
    async (failure) => {
      const { service, batchId, findById, confirm, executions } = setup();
      findById.mockRejectedValueOnce(failure);
      await expect(service.processBatch(batchId)).rejects.toBe(failure);
      expect(confirm.execute).not.toHaveBeenCalled();
      expect(executions.finish).not.toHaveBeenCalled();
    },
  );

  it('retains terminal validation failures as an explicit failed execution', async () => {
    const { service, batchId, confirm, executions, claim } = setup();
    confirm.execute.mockRejectedValueOnce(new ValidationError('Regla de validación definitiva'));
    await expect(service.processBatch(batchId)).resolves.toBeUndefined();
    expect(executions.finish).toHaveBeenCalledWith(claim, 'Regla de validación definitiva', now);
  });
});
