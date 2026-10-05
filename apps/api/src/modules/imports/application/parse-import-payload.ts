import type { PreviewImportInput } from '@cdr/contracts';
import { ValidationError } from '@cdr/shared';

import type { ImportRecord, ImportRow } from '../domain/entities/import-batch';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_ROWS = 10_000;

export function parseImportPayload(input: PreviewImportInput): ImportRow[] {
  const records = input.format === 'csv' ? parseCsv(input.csv ?? '') : (input.records ?? []);
  if (records.length === 0) throw new ValidationError('The import contains no data rows');
  if (records.length > MAX_ROWS) {
    throw new ValidationError(`The import exceeds the ${MAX_ROWS} row limit`);
  }
  return records.map((record, index) => {
    const errors = validateRecord(input.target, record);
    return { rowNumber: index + 1, valid: errors.length === 0, data: record, errors };
  });
}

export function parseCsv(input: string): ImportRecord[] {
  if (input.includes('\0')) throw new ValidationError('CSV contains a NUL character');
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      if (cell.length > 0) throw new ValidationError('CSV quote starts inside an unquoted value');
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      matrix.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (quoted) throw new ValidationError('CSV contains an unterminated quoted value');
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) matrix.push(row);
  if (matrix.length === 0) return [];

  const headers = (matrix.shift() ?? []).map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '') : header,
  );
  if (headers.some((header) => !header)) throw new ValidationError('CSV headers cannot be blank');
  if (new Set(headers).size !== headers.length) {
    throw new ValidationError('CSV headers must be unique');
  }
  if (headers.some((header) => FORBIDDEN_KEYS.has(header))) {
    throw new ValidationError('CSV contains a forbidden header');
  }

  return matrix.map((values, index) => {
    if (values.length !== headers.length) {
      throw new ValidationError(
        `CSV row ${index + 1} has ${values.length} cells; expected ${headers.length}`,
      );
    }
    const record: Record<string, string> = Object.create(null) as Record<string, string>;
    headers.forEach((header, cellIndex) => {
      record[header] = values[cellIndex] ?? '';
    });
    return record;
  });
}

function validateRecord(target: PreviewImportInput['target'], record: ImportRecord): string[] {
  const errors: string[] = [];
  const keys = Object.keys(record);
  if (keys.some((key) => FORBIDDEN_KEYS.has(key))) errors.push('Contains a forbidden field name');
  if (target === 'category') {
    requireText(record, 'sku', errors);
    if (keys.filter((key) => key !== 'sku').length === 0) {
      errors.push('At least one attribute column is required');
    }
  }
  if (target === 'applications') {
    requireText(record, 'unifiedCode', errors);
    if (!['vehicleType', 'make', 'model', 'engine', 'notes'].some((key) => asText(record[key]))) {
      errors.push('At least one application description field is required');
    }
    validateOptionalYear(record, 'yearFrom', errors);
    validateOptionalYear(record, 'yearTo', errors);
    const from = asYear(record.yearFrom);
    const to = asYear(record.yearTo);
    if (from !== null && to !== null && from > to) errors.push('yearFrom must not exceed yearTo');
  }
  if (target === 'homologs') {
    requireText(record, 'unifiedCode', errors);
    requireText(record, 'externalCode', errors);
    requireText(record, 'externalBrand', errors);
    if (record.approvalStatus !== undefined) {
      const status = asText(record.approvalStatus);
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        errors.push('approvalStatus must be pending, approved or rejected');
      }
    }
    if (
      record.active !== undefined &&
      !['true', 'false', '1', '0'].includes(asText(record.active))
    ) {
      errors.push('active must be true, false, 1 or 0');
    }
  }
  return errors;
}

function requireText(record: ImportRecord, key: string, errors: string[]): void {
  if (!asText(record[key])) errors.push(`${key} is required`);
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asYear(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : null;
}

function validateOptionalYear(record: ImportRecord, key: string, errors: string[]): void {
  const text = asText(record[key]);
  if (!text) return;
  const value = asYear(record[key]);
  if (value === null || value < 1886 || value > 2200) errors.push(`${key} must be a valid year`);
}
