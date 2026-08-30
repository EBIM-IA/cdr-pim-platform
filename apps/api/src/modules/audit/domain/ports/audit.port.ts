import type { AuditEntry } from '../entities/audit-entry';

/**
 * Outbound port for the audit trail.
 *
 * Write-only by design at this stage: nothing in the application reads the trail back, so
 * there is no query method to get wrong. A `find` method arrives with the first screen that
 * actually needs it.
 */
export interface AuditPort {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_PORT = Symbol('AuditPort');
