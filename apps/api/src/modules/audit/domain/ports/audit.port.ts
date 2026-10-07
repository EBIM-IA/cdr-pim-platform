import type { AuditEntry } from '../entities/audit-entry';

export interface AuditWriteContext {
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

/**
 * Outbound port for the audit trail.
 *
 * `record` atomically persists the event and all field-level rows. Business mutations must
 * use the database unit-of-work described in `docs/architecture/AUDIT_UNIT_OF_WORK.md` so
 * the domain write and this append happen in the same transaction.
 */
export interface AuditPort {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_PORT = Symbol('AuditPort');
