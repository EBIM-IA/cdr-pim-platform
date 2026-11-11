import type {
  QualityProductChangesDto,
  QualityCompletenessDto,
  QualityReviewDto,
  QualityReviewQuery,
  QualitySourcePriorityInput,
} from '@cdr/contracts';
import type { Uuid } from '@cdr/shared';
import type { AuditEntry } from '../../../audit/domain/entities/audit-entry';
import type { AttributeValueSource } from '../../../catalog-schema/domain/entities/catalog-schema';

export interface QualityAttributeApplication {
  readonly productId: Uuid;
  readonly attributeKey: string;
  readonly value: string | number | boolean | null;
  readonly expectedVersion: number;
  readonly source: AttributeValueSource;
  readonly roles: readonly string[];
  readonly now: Date;
  readonly actorId: string;
  readonly correlationId: string;
}
export interface QualityGovernancePort {
  productChanges(query: { page: number; pageSize: number }): Promise<QualityProductChangesDto>;
  completeness(): Promise<QualityCompletenessDto>;
  updatePriority(input: QualitySourcePriorityInput, audit: AuditEntry): Promise<void>;
  list(query: QualityReviewQuery): Promise<{ items: QualityReviewDto[]; total: number }>;
  find(id: string): Promise<QualityReviewDto | null>;
  create(items: readonly QualityReviewDto[], audit: AuditEntry): Promise<void>;
  /** Candidate CAS, attribute application (including replication), and audit commit together. */
  decide(
    item: QualityReviewDto,
    expectedVersion: number,
    audit: AuditEntry,
    application?: QualityAttributeApplication,
  ): Promise<void>;
}
export const QUALITY_GOVERNANCE = Symbol('QualityGovernancePort');
