import { ConflictError, ValidationError, type Uuid, newUuid } from '@cdr/shared';

export type ImportTarget = 'category' | 'applications' | 'homologs' | 'oem';
export type ImportFormat = 'csv' | 'json';
export type ImportSourceFileFormat = 'csv' | 'xlsx';
export type ImportBatchStatus = 'previewed' | 'processing' | 'confirmed' | 'failed';
export type ImportValue = string | number | boolean | null | string[];
export type ImportRecord = Readonly<Record<string, ImportValue>>;

export interface ImportRow {
  readonly rowNumber: number;
  readonly valid: boolean;
  readonly data: ImportRecord;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  /** Internal confirmation data. It is persisted but never exposed through the HTTP DTO. */
  readonly metadata?: unknown;
}

export interface ImportBatchSnapshot {
  readonly id: Uuid;
  readonly target: ImportTarget;
  readonly format: ImportFormat;
  readonly originalFileName: string | null;
  readonly sourceFileFormat: ImportSourceFileFormat | null;
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
    input: Omit<
      ImportBatchSnapshot,
      'id' | 'status' | 'createdAt' | 'confirmedAt' | 'originalFileName' | 'sourceFileFormat'
    > & {
      id?: Uuid;
      originalFileName?: string | null;
      sourceFileFormat?: ImportSourceFileFormat | null;
    },
    now: Date,
  ): ImportBatch {
    return new ImportBatch({
      ...input,
      originalFileName: normalizeOriginalFileName(input.originalFileName),
      sourceFileFormat: normalizeSourceFileFormat(input.sourceFileFormat),
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
    if (this.state.status === 'failed') {
      throw new ConflictError('A failed import batch cannot be confirmed', {
        batchId: this.state.id,
      });
    }
    const validRows = this.state.rows.filter((row) => row.valid).length;
    if (validRows === 0) {
      throw new ConflictError('An import without valid rows cannot be confirmed', {
        batchId: this.state.id,
      });
    }
    this.state = { ...this.state, status: 'confirmed', confirmedAt: now };
  }

  startConfirmation(): void {
    if (this.state.status === 'confirmed') return;
    if (this.state.status !== 'previewed') {
      throw new ConflictError('The import batch is not available for confirmation', {
        batchId: this.state.id,
        status: this.state.status,
      });
    }
    this.state = { ...this.state, status: 'processing' };
  }

  failConfirmation(): void {
    if (this.state.status === 'processing') this.state = { ...this.state, status: 'failed' };
  }

  toSnapshot(): ImportBatchSnapshot {
    return { ...this.state, rows: [...this.state.rows] };
  }
}

function normalizeOriginalFileName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const name = value.trim();
  if (
    !name ||
    name.length > 255 ||
    name === '.' ||
    name === '..' ||
    !/^[^/\\\p{Cc}]+$/u.test(name)
  ) {
    throw new ValidationError('A safe original filename of at most 255 characters is required', {
      field: 'originalFileName',
    });
  }
  return name;
}

function normalizeSourceFileFormat(
  value: ImportSourceFileFormat | null | undefined,
): ImportSourceFileFormat | null {
  if (value === null || value === undefined) return null;
  if (value !== 'csv' && value !== 'xlsx') {
    throw new ValidationError('The original file format must be CSV or XLSX', {
      field: 'sourceFileFormat',
    });
  }
  return value;
}
