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
  return records.map((rawRecord, index) => {
    const record = canonicalRecord(input.target, rawRecord);
    const errors = validateRecord(input.target, record);
    return {
      rowNumber: index + 1,
      valid: errors.length === 0,
      data: record,
      errors,
      warnings: [],
    };
  });
}

const aliases: Record<PreviewImportInput['target'], Readonly<Record<string, string>>> = {
  category: {
    codigo_articulo: 'sku',
    codigoArticulo: 'sku',
  },
  applications: {
    codigo_unificador: 'unifiedCode',
    tipo_aplicacion: 'vehicleType',
    tipo_vehiculo: 'vehicleType',
    marca_industria: 'make',
    marca: 'make',
    modelo_equipo: 'model',
    modelo: 'model',
    anio_desde: 'yearFrom',
    ano_desde: 'yearFrom',
    anio_hasta: 'yearTo',
    ano_hasta: 'yearTo',
    motor: 'engine',
    observacion: 'notes',
    observaciones: 'notes',
    notas: 'notes',
  },
  homologs: {
    codigo_unificador: 'unifiedCode',
    codigo_homologo: 'externalCode',
    marca: 'externalBrand',
    marca_homologo: 'externalBrand',
    estado_aprobacion: 'approvalStatus',
    activo: 'active',
  },
  oem: {
    codigo_unificador: 'unifiedCode',
    codigo_oem: 'oemCode',
    marcas: 'brands',
    estado_aprobacion: 'approvalStatus',
    activo: 'active',
  },
};

function canonicalRecord(target: PreviewImportInput['target'], record: ImportRecord): ImportRecord {
  const result: Record<string, ImportRecord[string]> = Object.create(null) as Record<
    string,
    ImportRecord[string]
  >;
  for (const [key, value] of Object.entries(record)) {
    const canonical = aliases[target][key] ?? key;
    if (result[canonical] === undefined || asText(result[canonical]) === '')
      result[canonical] = value;
  }
  if (target === 'oem' && (typeof result.brands === 'string' || Array.isArray(result.brands))) {
    result.brands = normalizeBrands(result.brands);
  }
  if (target === 'applications' && result.vehicleType !== undefined) {
    const vehicleType = normalizeVehicleType(result.vehicleType);
    if (vehicleType) result.vehicleType = vehicleType;
  }
  return result;
}

export function parseCsv(input: string): ImportRecord[] {
  if (input.includes('\0')) throw new ValidationError('CSV contains a NUL character');
  const delimiter = detectDelimiter(input);
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
    } else if (char === delimiter) {
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

/** Chooses the delimiter from the first logical record, ignoring separators inside quotes. */
function detectDelimiter(input: string): ',' | ';' {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break;
    } else if (!quoted && char === ',') {
      commas += 1;
    } else if (!quoted && char === ';') {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ';' : ',';
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
    validateRequiredText(record, 'unifiedCode', 120, errors);
    validateRequiredText(record, 'vehicleType', 120, errors);
    validateRequiredText(record, 'make', 160, errors);
    validateRequiredText(record, 'model', 200, errors);
    validateOptionalText(record, 'engine', 200, errors);
    validateOptionalText(record, 'notes', 2_000, errors);
    if (record.vehicleType !== undefined && !normalizeVehicleType(record.vehicleType)) {
      errors.push('vehicleType must be AUTOMOTRIZ or INDUSTRIAL');
    }
    validateOptionalYear(record, 'yearFrom', errors);
    validateOptionalYear(record, 'yearTo', errors);
    const from = asYear(record.yearFrom);
    const to = asYear(record.yearTo);
    if (from !== null && to !== null && from > to) errors.push('yearFrom must not exceed yearTo');
  }
  if (target === 'homologs') {
    validateRequiredText(record, 'unifiedCode', 120, errors);
    validateRequiredText(record, 'externalCode', 160, errors);
    validateRequiredText(record, 'externalBrand', 160, errors);
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
  if (target === 'oem') {
    validateRequiredText(record, 'unifiedCode', 120, errors);
    validateRequiredText(record, 'oemCode', 160, errors);
    validateBrands(record.brands, errors);
    validateApprovalStatus(record, errors);
    validateActive(record, errors);
  }
  return errors;
}

function normalizeVehicleType(value: unknown): 'AUTOMOTRIZ' | 'INDUSTRIAL' | null {
  const candidate = asText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
  if (['automotriz', 'automovil', 'automotive'].includes(candidate)) return 'AUTOMOTRIZ';
  if (['industrial', 'industria'].includes(candidate)) return 'INDUSTRIAL';
  return null;
}

function requireText(record: ImportRecord, key: string, errors: string[]): void {
  if (!asText(record[key])) errors.push(`${key} is required`);
}

function validateRequiredText(
  record: ImportRecord,
  key: string,
  maxLength: number,
  errors: string[],
): void {
  requireText(record, key, errors);
  validateOptionalText(record, key, maxLength, errors);
}

function validateOptionalText(
  record: ImportRecord,
  key: string,
  maxLength: number,
  errors: string[],
): void {
  const raw = record[key];
  if (Array.isArray(raw)) {
    errors.push(`${key} must be a scalar value`);
    return;
  }
  const value = asText(raw);
  if (value.length > maxLength) errors.push(`${key} must contain at most ${maxLength} characters`);
}

function validateApprovalStatus(record: ImportRecord, errors: string[]): void {
  if (record.approvalStatus === undefined) return;
  if (!['pending', 'approved', 'rejected'].includes(asText(record.approvalStatus))) {
    errors.push('approvalStatus must be pending, approved or rejected');
  }
}

function validateActive(record: ImportRecord, errors: string[]): void {
  if (record.active !== undefined && !['true', 'false', '1', '0'].includes(asText(record.active))) {
    errors.push('active must be true, false, 1 or 0');
  }
}

function normalizeBrands(value: string | string[]): string[] {
  const values = typeof value === 'string' ? value.split(/[,;|]/u) : value;
  return values.map((brand) => brand.trim()).filter(Boolean);
}

function validateBrands(value: ImportRecord[string] | undefined, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('brands must contain at least one brand');
    return;
  }
  if (value.length > 20) errors.push('brands must contain at most 20 brands');
  if (value.some((brand) => brand.length > 160)) {
    errors.push('Each brand must contain at most 160 characters');
  }
  const normalized = value.map((brand) => brand.toLocaleUpperCase('es'));
  if (new Set(normalized).size !== normalized.length) errors.push('brands must be unique');
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
