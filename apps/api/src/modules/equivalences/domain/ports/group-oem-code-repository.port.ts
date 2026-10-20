import type { OemCodeListQuery } from '@cdr/contracts';
import type { Uuid } from '@cdr/shared';

import type { GroupOemCode } from '../entities/group-oem-code';
import type { AuditAction } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';

export interface OemProductMatch {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly status: string;
}

export interface EligibleOemMatch {
  readonly oem: GroupOemCode;
  readonly products: readonly OemProductMatch[];
}

export interface OemAuditWriteContext extends AuditWriteContext {
  readonly action: AuditAction;
}

export type GroupOemCodeMutationResult =
  | { readonly kind: 'updated'; readonly value: GroupOemCode }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualUpdatedAt: Date };

export interface GroupOemCodeRepositoryPort {
  findGroupByCode(code: string): Promise<{ id: Uuid; code: string; automotive: boolean } | null>;
  findById(id: Uuid): Promise<GroupOemCode | null>;
  findByNaturalKey(groupId: Uuid, oemCode: string): Promise<GroupOemCode | null>;
  list(query: OemCodeListQuery): Promise<GroupOemCode[]>;
  searchEligible(query: string): Promise<EligibleOemMatch[]>;
  /** Inserts the aggregate and immutable audit event in one transaction. */
  insertWithAudit(oem: GroupOemCode, audit: OemAuditWriteContext): Promise<void>;
  saveImported(oem: GroupOemCode, audit: AuditWriteContext): Promise<void>;
  /** Optimistically updates the aggregate and audit event in one transaction. */
  updateWithAudit(
    oem: GroupOemCode,
    expectedUpdatedAt: Date,
    audit: OemAuditWriteContext,
  ): Promise<GroupOemCodeMutationResult>;
}

export const GROUP_OEM_CODE_REPOSITORY = Symbol('GroupOemCodeRepositoryPort');
