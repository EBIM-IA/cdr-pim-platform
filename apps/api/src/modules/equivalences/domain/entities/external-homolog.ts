import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

export const HomologApprovalStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;
export type HomologApprovalStatus =
  (typeof HomologApprovalStatus)[keyof typeof HomologApprovalStatus];
export type HomologSource = 'manual' | 'import';

export interface ExternalHomologSnapshot {
  readonly id: Uuid;
  readonly groupId: Uuid;
  readonly unifiedCode: string;
  readonly externalCode: string;
  readonly externalBrand: string;
  readonly active: boolean;
  readonly approvalStatus: HomologApprovalStatus;
  readonly source: HomologSource;
  readonly importBatchId: Uuid | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class ExternalHomolog {
  private constructor(private state: ExternalHomologSnapshot) {}

  static create(
    input: {
      groupId: Uuid;
      unifiedCode: string;
      externalCode: string;
      externalBrand: string;
      active?: boolean;
      approvalStatus?: HomologApprovalStatus;
      source?: HomologSource;
      importBatchId?: Uuid | null;
      id?: Uuid;
    },
    now: Date,
  ): ExternalHomolog {
    const externalCode = required(input.externalCode, 'externalCode');
    const externalBrand = required(input.externalBrand, 'externalBrand');
    return new ExternalHomolog({
      id: input.id ?? newUuid(),
      groupId: input.groupId,
      unifiedCode: required(input.unifiedCode, 'unifiedCode').toUpperCase(),
      externalCode,
      externalBrand,
      active: input.active ?? true,
      approvalStatus: input.approvalStatus ?? HomologApprovalStatus.Pending,
      source: input.source ?? 'manual',
      importBatchId: input.importBatchId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: ExternalHomologSnapshot): ExternalHomolog {
    return new ExternalHomolog(snapshot);
  }

  get eligibleForSearch(): boolean {
    return this.state.active && this.state.approvalStatus === HomologApprovalStatus.Approved;
  }

  update(
    input: Partial<
      Pick<ExternalHomologSnapshot, 'externalCode' | 'externalBrand' | 'active' | 'approvalStatus'>
    >,
    now: Date,
  ): void {
    this.state = {
      ...this.state,
      externalCode:
        input.externalCode === undefined
          ? this.state.externalCode
          : required(input.externalCode, 'externalCode'),
      externalBrand:
        input.externalBrand === undefined
          ? this.state.externalBrand
          : required(input.externalBrand, 'externalBrand'),
      active: input.active ?? this.state.active,
      approvalStatus: input.approvalStatus ?? this.state.approvalStatus,
      updatedAt: now,
    };
  }

  toSnapshot(): ExternalHomologSnapshot {
    return { ...this.state };
  }
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} must not be blank`, { field });
  return normalized;
}
