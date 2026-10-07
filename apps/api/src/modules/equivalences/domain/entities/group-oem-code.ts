import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

export const OemApprovalStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;
export type OemApprovalStatus = (typeof OemApprovalStatus)[keyof typeof OemApprovalStatus];
export type OemSource = 'manual' | 'import';

export interface GroupOemCodeSnapshot {
  readonly id: Uuid;
  readonly groupId: Uuid;
  readonly unifiedCode: string;
  readonly oemCode: string;
  readonly brands: readonly string[];
  readonly active: boolean;
  readonly approvalStatus: OemApprovalStatus;
  readonly source: OemSource;
  readonly importBatchId: Uuid | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class GroupOemCode {
  private constructor(private state: GroupOemCodeSnapshot) {}

  static create(
    input: {
      groupId: Uuid;
      unifiedCode: string;
      oemCode: string;
      brands: readonly string[];
      active?: boolean;
      approvalStatus?: OemApprovalStatus;
      source?: OemSource;
      importBatchId?: Uuid | null;
      id?: Uuid;
    },
    now: Date,
  ): GroupOemCode {
    return new GroupOemCode({
      id: input.id ?? newUuid(),
      groupId: input.groupId,
      unifiedCode: normalizeCode(input.unifiedCode, 'unifiedCode', 120),
      oemCode: normalizeCode(input.oemCode, 'oemCode', 160),
      brands: normalizeBrands(input.brands),
      active: input.active ?? true,
      approvalStatus: input.approvalStatus ?? OemApprovalStatus.Pending,
      source: input.source ?? 'manual',
      importBatchId: input.importBatchId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: GroupOemCodeSnapshot): GroupOemCode {
    return new GroupOemCode({ ...snapshot, brands: [...snapshot.brands] });
  }

  get eligibleForSearch(): boolean {
    return this.state.active && this.state.approvalStatus === OemApprovalStatus.Approved;
  }

  update(
    input: Partial<Pick<GroupOemCodeSnapshot, 'oemCode' | 'brands' | 'active' | 'approvalStatus'>>,
    now: Date,
  ): void {
    this.state = {
      ...this.state,
      oemCode:
        input.oemCode === undefined
          ? this.state.oemCode
          : normalizeCode(input.oemCode, 'oemCode', 160),
      brands: input.brands === undefined ? this.state.brands : normalizeBrands(input.brands),
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

  toSnapshot(): GroupOemCodeSnapshot {
    return { ...this.state, brands: [...this.state.brands] };
  }
}

function normalizeCode(value: string, field: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/gu, ' ').toLocaleUpperCase('es');
  if (!normalized) throw new ValidationError(`${field} must not be blank`, { field });
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} must contain at most ${maxLength} characters`, {
      field,
      maxLength,
    });
  }
  return normalized;
}

function normalizeBrands(values: readonly string[]): string[] {
  if (values.length > 20) {
    throw new ValidationError('brands must contain at most 20 brands', {
      field: 'brands',
      maxItems: 20,
    });
  }
  const normalized = values
    .map((brand) => brand.trim().replace(/\s+/gu, ' ').toLocaleUpperCase('es'))
    .filter(Boolean);
  if (normalized.some((brand) => brand.length > 160)) {
    throw new ValidationError('Each OEM brand must contain at most 160 characters', {
      field: 'brands',
      maxLength: 160,
    });
  }
  const unique = [...new Set(normalized)];
  if (unique.length === 0) {
    throw new ValidationError('At least one OEM brand is required', { field: 'brands' });
  }
  return unique;
}
