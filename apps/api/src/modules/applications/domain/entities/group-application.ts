import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

export type ApplicationSource = 'manual' | 'import';

export interface GroupApplicationSnapshot {
  readonly id: Uuid;
  readonly groupId: Uuid;
  readonly unifiedCode: string;
  readonly vehicleType: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly yearFrom: number | null;
  readonly yearTo: number | null;
  readonly engine: string | null;
  readonly notes: string | null;
  readonly active: boolean;
  readonly source: ApplicationSource;
  readonly importBatchId: Uuid | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type EditableApplicationFields = Pick<
  GroupApplicationSnapshot,
  'vehicleType' | 'make' | 'model' | 'yearFrom' | 'yearTo' | 'engine' | 'notes'
>;

export class GroupApplication {
  private constructor(private state: GroupApplicationSnapshot) {}

  static create(
    input: {
      groupId: Uuid;
      unifiedCode: string;
      source?: ApplicationSource;
      importBatchId?: Uuid | null;
      id?: Uuid;
    } & Partial<EditableApplicationFields>,
    now: Date,
  ): GroupApplication {
    const fields = normalizeFields(input);
    validateYearRange(fields.yearFrom, fields.yearTo);
    if (
      ![fields.vehicleType, fields.make, fields.model, fields.engine, fields.notes].some(Boolean)
    ) {
      throw new ValidationError('An application requires descriptive compatibility data');
    }
    return new GroupApplication({
      id: input.id ?? newUuid(),
      groupId: input.groupId,
      unifiedCode: input.unifiedCode.trim().toUpperCase(),
      ...fields,
      active: true,
      source: input.source ?? 'manual',
      importBatchId: input.importBatchId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: GroupApplicationSnapshot): GroupApplication {
    return new GroupApplication(snapshot);
  }

  update(input: Partial<EditableApplicationFields> & { active?: boolean }, now: Date): void {
    const merged = normalizeFields({
      vehicleType: input.vehicleType === undefined ? this.state.vehicleType : input.vehicleType,
      make: input.make === undefined ? this.state.make : input.make,
      model: input.model === undefined ? this.state.model : input.model,
      yearFrom: input.yearFrom === undefined ? this.state.yearFrom : input.yearFrom,
      yearTo: input.yearTo === undefined ? this.state.yearTo : input.yearTo,
      engine: input.engine === undefined ? this.state.engine : input.engine,
      notes: input.notes === undefined ? this.state.notes : input.notes,
    });
    validateYearRange(merged.yearFrom, merged.yearTo);
    this.state = {
      ...this.state,
      ...merged,
      active: input.active ?? this.state.active,
      updatedAt: now,
    };
  }

  deactivate(now: Date): void {
    this.state = { ...this.state, active: false, updatedAt: now };
  }

  toSnapshot(): GroupApplicationSnapshot {
    return { ...this.state };
  }
}

function nullableText(value: string | null | undefined): string | null {
  const result = value?.trim() ?? '';
  return result.length > 0 ? result : null;
}

function normalizeFields(input: Partial<EditableApplicationFields>): EditableApplicationFields {
  return {
    vehicleType: nullableText(input.vehicleType),
    make: nullableText(input.make),
    model: nullableText(input.model),
    yearFrom: input.yearFrom ?? null,
    yearTo: input.yearTo ?? null,
    engine: nullableText(input.engine),
    notes: nullableText(input.notes),
  };
}

function validateYearRange(yearFrom: number | null, yearTo: number | null): void {
  if (yearFrom !== null && (!Number.isInteger(yearFrom) || yearFrom < 1886 || yearFrom > 2200)) {
    throw new ValidationError('yearFrom is outside the supported range');
  }
  if (yearTo !== null && (!Number.isInteger(yearTo) || yearTo < 1886 || yearTo > 2200)) {
    throw new ValidationError('yearTo is outside the supported range');
  }
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    throw new ValidationError('yearFrom must be less than or equal to yearTo');
  }
}
