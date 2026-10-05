export interface AuditChangeFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly sku?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly field?: string;
  readonly source?: string;
  readonly actorId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface AuditChangeRecord {
  readonly id: string;
  readonly auditEntryId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly sku: string | null;
  readonly action: AuditAction;
  readonly field: string;
  readonly before: unknown | null;
  readonly after: unknown | null;
  readonly previousValueValidFrom: Date | null;
  readonly actorId: string | null;
  readonly source: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface AuditChangePage {
  readonly items: readonly AuditChangeRecord[];
  readonly total: number;
}

export interface AuditReadPort {
  listChanges(filter: AuditChangeFilter): Promise<AuditChangePage>;
}

export const AUDIT_READ_PORT = Symbol('AuditReadPort');
import type { AuditAction } from '../entities/audit-entry';
