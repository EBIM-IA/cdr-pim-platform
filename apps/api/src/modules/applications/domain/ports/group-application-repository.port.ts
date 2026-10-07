import type { Uuid } from '@cdr/shared';

import type { GroupApplication } from '../entities/group-application';
import type { AuditAction } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';

export interface ApplicationCriteria {
  readonly unifiedCode?: string;
  readonly productId?: Uuid;
  readonly includeInactive: boolean;
}

export interface ApplicationAuditWriteContext extends AuditWriteContext {
  readonly action: AuditAction;
}

export type GroupApplicationMutationResult =
  | { readonly kind: 'updated'; readonly value: GroupApplication }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualUpdatedAt: Date };

export interface GroupApplicationRepositoryPort {
  findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null>;
  findById(id: Uuid): Promise<GroupApplication | null>;
  list(criteria: ApplicationCriteria): Promise<GroupApplication[]>;
  /** Inserts the aggregate and its immutable audit event in one transaction. */
  insertWithAudit(
    application: GroupApplication,
    audit: ApplicationAuditWriteContext,
  ): Promise<void>;
  /** Optimistically updates the aggregate and audit event in one transaction. */
  updateWithAudit(
    application: GroupApplication,
    expectedUpdatedAt: Date,
    audit: ApplicationAuditWriteContext,
  ): Promise<GroupApplicationMutationResult>;
  /** Persists an import row and its immutable audit event in one database transaction. */
  saveImported(application: GroupApplication, audit: AuditWriteContext): Promise<void>;
}

export const GROUP_APPLICATION_REPOSITORY = Symbol('GroupApplicationRepositoryPort');
