import { Inject, Injectable } from '@nestjs/common';
import {
  assertUuid,
  ConflictError,
  ForbiddenError,
  isDomainError,
  NotFoundError,
  type Clock,
} from '@cdr/shared';
import { CLOCK } from '../../../shared/tokens';
import {
  actorHasCapability,
  Capability,
  type AuthenticatedActor,
} from '../../identity/domain/entities/role';
import {
  IMPORT_BATCH_REPOSITORY,
  type ImportBatchRepositoryPort,
} from '../domain/ports/import-batch-repository.port';
import { IMPORT_EXECUTION, type ImportExecutionPort } from '../domain/ports/import-execution.port';
import { ConfirmImportBatchUseCase } from './manage-import-batches.use-cases';
import { isRetryableImportFailure } from './import-execution-errors';
@Injectable()
export class ImportExecutionUseCases {
  constructor(
    @Inject(IMPORT_EXECUTION) private readonly executions: ImportExecutionPort,
    @Inject(IMPORT_BATCH_REPOSITORY) private readonly batches: ImportBatchRepositoryPort,
    private readonly confirm: ConfirmImportBatchUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async enqueue(id: string, actor: AuthenticatedActor) {
    if (!actorHasCapability(actor, Capability.ImportsExecute))
      throw new ForbiddenError('Este perfil no puede importar.');
    const batchId = assertUuid(id),
      batch = await this.batches.findById(batchId);
    if (!batch) throw new NotFoundError('ImportBatch', id);
    const snapshot = batch.toSnapshot();
    const existing = await this.executions.get(batchId);
    if (existing) return existing;
    if (snapshot.status !== 'previewed')
      throw new ConflictError('Solo se puede encolar una vista previa pendiente.');
    if (!snapshot.rows.some((row) => row.valid))
      throw new ConflictError('El lote no tiene filas válidas.');
    return this.executions.enqueue(
      batchId,
      snapshot.rows.filter((row) => row.valid).length,
      actor,
      this.clock.now(),
    );
  }
  get(id: string) {
    return this.executions.get(assertUuid(id));
  }
  /** Called only by the IMPORT_BATCH worker after validating an SQS envelope. */
  async processBatch(rawBatchId: string) {
    const batchId = assertUuid(rawBatchId);
    const execution = await this.executions.get(batchId);
    if (!execution) throw new NotFoundError('ImportExecution', batchId);
    if (execution.status === 'completed' || execution.status === 'failed') return;
    const claim = await this.executions.claim(batchId, this.clock.now());
    if (!claim)
      throw new ConflictError(
        'La importación ya está en procesamiento; reintenta la entrega más tarde.',
      );
    try {
      const batch = await this.batches.findById(claim.batchId);
      if (!batch) throw new NotFoundError('ImportBatch', claim.batchId);
      const snapshot = batch.toSnapshot();
      if (snapshot.status === 'failed') {
        await this.executions.finish(
          claim,
          'La confirmación del lote falló. Revisa los errores y genera una nueva vista previa.',
          this.clock.now(),
        );
        return;
      }
      await this.confirm.execute(claim.batchId, claim.actor, async (processedRows) => {
        await this.executions.progress(claim, processedRows, this.clock.now());
      });
      const result = await this.batches.findById(claim.batchId);
      await this.executions.finish(
        claim,
        result?.toSnapshot().status === 'confirmed'
          ? null
          : 'El lote no pudo confirmar filas válidas. Revisa los errores por fila.',
        this.clock.now(),
      );
    } catch (error) {
      // A synchronous confirmation (or an uncertain final database response) may have
      // committed the same batch. Reconcile that durable result before deciding failure.
      const persisted = await this.batches.findById(claim.batchId);
      if (persisted?.toSnapshot().status === 'confirmed') {
        await this.executions.finish(claim, null, this.clock.now());
        return;
      }
      // Keep the ownership lease recoverable and let SQS redeliver after it expires.
      if (isRetryableImportFailure(error)) throw error;
      await this.executions.finish(
        claim,
        isDomainError(error)
          ? error.message
          : 'No fue posible completar la importación. Revisa los resultados guardados antes de volver a importar.',
        this.clock.now(),
      );
    }
  }
}
