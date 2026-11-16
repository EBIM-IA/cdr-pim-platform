import type { ImportExecutionDto } from '@cdr/contracts';
import type { Uuid } from '@cdr/shared';
import type { AuthenticatedActor } from '../../../identity/domain/entities/role';
export interface ClaimedImportExecution {
  readonly batchId: Uuid;
  readonly token: Uuid;
  readonly actor: AuthenticatedActor;
}
export interface ImportExecutionPort {
  enqueue(
    batchId: Uuid,
    totalRows: number,
    actor: AuthenticatedActor,
    now: Date,
  ): Promise<ImportExecutionDto>;
  get(batchId: Uuid): Promise<ImportExecutionDto | null>;
  /** Claim the execution named by an SQS message; this is not a work queue scan. */
  claim(batchId: Uuid, now: Date): Promise<ClaimedImportExecution | null>;
  undispatched(limit: number): Promise<Uuid[]>;
  markDispatched(batchId: Uuid, now: Date): Promise<void>;
  progress(claim: ClaimedImportExecution, processedRows: number, now: Date): Promise<void>;
  finish(claim: ClaimedImportExecution, error: string | null, now: Date): Promise<void>;
}
export const IMPORT_EXECUTION = Symbol('ImportExecutionPort');

export const IMPORT_EXECUTION_LEASE_MS = Symbol('ImportExecutionLeaseMs');
