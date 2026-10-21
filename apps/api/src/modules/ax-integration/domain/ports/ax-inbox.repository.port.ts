import type { AxProduct } from '@cdr/contracts';
import type { Uuid } from '@cdr/shared';

export interface AxInboxBatch {
  readonly id: Uuid;
  readonly recordIds: readonly Uuid[];
  readonly idLote: string;
  readonly fechaEnvio: Date;
  readonly sistemaOrigen: string | null;
  readonly productos: readonly AxProduct[];
  readonly requestHash: string;
  readonly receivedAt: Date;
  readonly correlationId: string;
}

export interface AxInboxReceipt {
  readonly idLote: string;
  readonly fechaEnvio: Date;
  readonly sistemaOrigen: string | null;
  readonly requestHash: string;
  readonly receivedAt: Date;
  readonly correlationId: string;
  readonly recordCount: number;
}

export interface AxInboxRepositoryPort {
  /** Stores a complete inbound batch atomically or returns its idempotent winner. */
  receive(batch: AxInboxBatch): Promise<AxInboxReceipt>;
  findByExternalId(idLote: string): Promise<AxInboxReceipt | null>;
}

export const AX_INBOX_REPOSITORY = Symbol('AxInboxRepositoryPort');
