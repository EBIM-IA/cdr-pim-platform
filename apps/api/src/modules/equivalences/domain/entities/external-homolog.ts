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
  readonly name?: string | null;
  readonly referenceType?: string | null;
  readonly referenceSource?: string | null;
  readonly note?: string | null;

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
      name?: string | null;
      referenceType?: string | null;
      referenceSource?: string | null;
      note?: string | null;

      active?: boolean;
      approvalStatus?: HomologApprovalStatus;
      source?: HomologSource;
      importBatchId?: Uuid | null;
      id?: Uuid;
    },
    now: Date,
  ): ExternalHomolog {
    const externalCode = required(input.externalCode, 'externalCode', 160);
    const externalBrand = required(input.externalBrand, 'externalBrand', 160);
    return new ExternalHomolog({
      id: input.id ?? newUuid(),
      groupId: input.groupId,
      unifiedCode: required(input.unifiedCode, 'unifiedCode', 120).toUpperCase(),
      externalCode,
      externalBrand,
      name: optional(input.name, 'name', 500),
      referenceType: optional(input.referenceType, 'referenceType', 160),
      referenceSource: optional(input.referenceSource, 'referenceSource', 300),
      note: optional(input.note, 'note', 2000),
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
      Pick<
        ExternalHomologSnapshot,
        | 'externalCode'
        | 'externalBrand'
        | 'active'
        | 'approvalStatus'
        | 'name'
        | 'referenceType'
        | 'referenceSource'
        | 'note'
      >
    >,
    now: Date,
  ): void {
    this.state = {
      ...this.state,
      externalCode:
        input.externalCode === undefined
          ? this.state.externalCode
          : required(input.externalCode, 'externalCode', 160),
      externalBrand:
        input.externalBrand === undefined
          ? this.state.externalBrand
          : required(input.externalBrand, 'externalBrand', 160),
      name: input.name === undefined ? this.state.name : optional(input.name, 'name', 500),
      referenceType:
        input.referenceType === undefined
          ? this.state.referenceType
          : optional(input.referenceType, 'referenceType', 160),
      referenceSource:
        input.referenceSource === undefined
          ? this.state.referenceSource
          : optional(input.referenceSource, 'referenceSource', 300),
      note: input.note === undefined ? this.state.note : optional(input.note, 'note', 2000),
      active: input.active ?? this.state.active,
      approvalStatus: input.approvalStatus ?? this.state.approvalStatus,
      updatedAt: now,
    };
  }

  deactivate(now: Date): void {
    this.state = { ...this.state, active: false, updatedAt: now };
  }

  markImported(importBatchId: Uuid, now: Date): void {
    this.state = { ...this.state, source: 'import', importBatchId, updatedAt: now };
  }

  toSnapshot(): ExternalHomologSnapshot {
    return { ...this.state };
  }
}

function required(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} must not be blank`, { field });
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} must contain at most ${maxLength} characters`, {
      field,
      maxLength,
    });
  }
  return normalized;
}

function optional(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maxLength)
    throw new ValidationError(`${field} must contain at most ${maxLength} characters`, {
      field,
      maxLength,
    });
  return normalized;
}
