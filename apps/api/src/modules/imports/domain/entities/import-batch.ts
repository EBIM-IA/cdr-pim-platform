import { ConflictError, type Uuid, newUuid } from '@cdr/shared';

export type ImportTarget = 'category' | 'applications' | 'homologs';
export type ImportFormat = 'csv' | 'json';
export type ImportBatchStatus = 'previewed' | 'confirmed' | 'failed';
export type ImportScalar = string | number | boolean | null;
export type ImportRecord = Readonly<Record<string, ImportScalar>>;

export interface ImportRow {
  readonly rowNumber: number;
  readonly valid: boolean;
  readonly data: ImportRecord;
  readonly errors: readonly string[];
}

export interface ImportBatchSnapshot {
  readonly id: Uuid;
  readonly target: ImportTarget;
  readonly format: ImportFormat;
  readonly status: ImportBatchStatus;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly categoryCode: string | null;
  readonly createdBy: string;
  readonly rows: readonly ImportRow[];
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
}

export class ImportBatch {
  private constructor(private state: ImportBatchSnapshot) {}

  static preview(
    input: Omit<ImportBatchSnapshot, 'id' | 'status' | 'createdAt' | 'confirmedAt'> & {
      id?: Uuid;
    },
    now: Date,
  ): ImportBatch {
    return new ImportBatch({
      ...input,
      id: input.id ?? newUuid(),
      status: 'previewed',
      createdAt: now,
      confirmedAt: null,
    });
  }

  static rehydrate(snapshot: ImportBatchSnapshot): ImportBatch {
    return new ImportBatch(snapshot);
  }

  confirm(now: Date): void {
    if (this.state.status === 'confirmed') return;
    const invalidRows = this.state.rows.filter((row) => !row.valid).length;
    if (invalidRows > 0) {
      throw new ConflictError('An import with invalid rows cannot be confirmed', {
        batchId: this.state.id,
        invalidRows,
      });
    }
    this.state = { ...this.state, status: 'confirmed', confirmedAt: now };
  }

  toSnapshot(): ImportBatchSnapshot {
    return { ...this.state, rows: [...this.state.rows] };
  }
}
