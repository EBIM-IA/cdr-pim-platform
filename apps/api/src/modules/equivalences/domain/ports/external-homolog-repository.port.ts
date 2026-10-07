import type { Uuid } from '@cdr/shared';

import type { ExternalHomolog } from '../entities/external-homolog';
import type { AuditAction } from '../../../audit/domain/entities/audit-entry';
import type { AuditWriteContext } from '../../../audit/domain/ports/audit.port';

export interface HomologProductMatch {
  readonly id: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly brand: string | null;
  readonly status: string;
}

export interface EligibleHomologMatch {
  readonly homolog: ExternalHomolog;
  readonly products: readonly HomologProductMatch[];
}

export interface HomologAuditWriteContext extends AuditWriteContext {
  readonly action: AuditAction;
}

export type ExternalHomologMutationResult =
  | { readonly kind: 'updated'; readonly value: ExternalHomolog }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'version_conflict'; readonly actualUpdatedAt: Date };

export interface ExternalHomologRepositoryPort {
  findGroupByCode(code: string): Promise<{ id: Uuid; code: string } | null>;
  findById(id: Uuid): Promise<ExternalHomolog | null>;
  list(unifiedCode?: string, includeInactive?: boolean): Promise<ExternalHomolog[]>;
  searchEligible(externalCode: string): Promise<EligibleHomologMatch[]>;
  /** Inserts the aggregate and its immutable audit event in one transaction. */
  insertWithAudit(homolog: ExternalHomolog, audit: HomologAuditWriteContext): Promise<void>;
  /** Optimistically updates the aggregate and audit event in one transaction. */
  updateWithAudit(
    homolog: ExternalHomolog,
    expectedUpdatedAt: Date,
    audit: HomologAuditWriteContext,
  ): Promise<ExternalHomologMutationResult>;
  saveImported(homolog: ExternalHomolog, audit: AuditWriteContext): Promise<void>;
}

export const EXTERNAL_HOMOLOG_REPOSITORY = Symbol('ExternalHomologRepositoryPort');
