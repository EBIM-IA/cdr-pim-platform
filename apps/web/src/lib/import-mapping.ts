import type { ImportFormat, ImportTarget } from '@cdr/contracts';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
}
export const importFields: Record<Exclude<ImportTarget, 'category'>, readonly ImportField[]> = {
  applications: [
    { key: 'unifiedCode', label: 'Código unificador', required: true },
    { key: 'make', label: 'Marca del vehículo / industria', required: true },
    { key: 'model', label: 'Modelo del vehículo / equipo', required: true },
    { key: 'vehicleType', label: 'Tipo de aplicación' },
    { key: 'bodyStyle', label: 'Tipo / carrocería' },
    { key: 'fuel', label: 'Combustible' },
    { key: 'traction', label: 'Tracción' },
    { key: 'displacement', label: 'Cilindraje' },
    { key: 'yearFrom', label: 'Año desde' },
    { key: 'yearTo', label: 'Año hasta' },
    { key: 'engine', label: 'Motor' },
    { key: 'area', label: 'Área' },
    { key: 'subarea', label: 'Subárea' },
    { key: 'notes', label: 'Observaciones' },
  ],
  homologs: [
    { key: 'unifiedCode', label: 'Código unificador', required: true },
    { key: 'externalCode', label: 'Código homólogo', required: true },
    { key: 'externalBrand', label: 'Marca homólogo', required: true },
    { key: 'approvalStatus', label: 'Estado de aprobación' },
    { key: 'active', label: 'Activo' },
  ],
  oem: [
    { key: 'unifiedCode', label: 'Código unificador', required: true },
    { key: 'oemCode', label: 'Código OEM', required: true },
    { key: 'brands', label: 'Marcas', required: true },
    { key: 'approvalStatus', label: 'Estado de aprobación' },
    { key: 'active', label: 'Activo' },
  ],
};
const normalized = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
export function matchImportField(header: string, fields: readonly ImportField[]): string {
  const value = normalized(header);
  const exact = fields.find(
    (field) => normalized(field.key) === value || normalized(field.label) === value,
  );
  if (exact) return exact.key;
  const aliases: Record<string, string> = {
    codigoarticulo: 'sku',
    codarticulo: 'sku',
    tipovehiculo: 'vehicleType',
    tipoaplicacion: 'vehicleType',
    marca: 'make',
    marcavehiculo: 'make',
    marcaindustria: 'make',
    modeloequipo: 'model',
    modelo: 'model',
    tipo: 'bodyStyle',
    aniodesde: 'yearFrom',
    anodesde: 'yearFrom',
    anohasta: 'yearTo',
    aniohasta: 'yearTo',
    estadoaprobacion: 'approvalStatus',
    codigohomologo: 'externalCode',
    marcahomologo: 'externalBrand',
    observacion: 'notes',
    notas: 'notes',
  };
  const candidate = aliases[value];
  return fields.some((field) => field.key === candidate) ? (candidate ?? '') : '';
}
export function csvDelimiter(input: string): ',' | ';' {
  let quoted = false,
    commas = 0,
    semicolons = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\r' || char === '\n')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}
export function parseImportSource(
  payload: string,
  format: ImportFormat,
): Record<string, unknown>[] {
  if (format === 'json') {
    const records: unknown = JSON.parse(payload);
    if (
      !Array.isArray(records) ||
      records.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    )
      throw new Error('La hoja no contiene registros válidos.');
    return records as Record<string, unknown>[];
  }
  const input = payload.replace(/^\uFEFF/u, '');
  const delimiter = csvDelimiter(input);
  const matrix: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? '';
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (!quoted && cell.length)
        throw new Error('Una comilla comienza dentro de una celda sin delimitar.');
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('El archivo tiene una celda con comillas sin cerrar.');
  row.push(cell.trim());
  if (row.some(Boolean)) matrix.push(row);
  const headers = matrix.shift() ?? [];
  if (
    headers.some(
      (header) => !header || ['__proto__', 'constructor', 'prototype'].includes(header),
    ) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('Los encabezados deben tener nombres únicos y válidos.');
  return matrix.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`La fila ${index + 2} no tiene ${headers.length} columnas.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']));
  });
}
export function mapImportRecords(
  records: readonly Record<string, unknown>[],
  mapping: Readonly<Record<string, string>>,
  fields: readonly ImportField[],
): Record<string, unknown>[] {
  const selected = Object.entries(mapping).filter(([, key]) => key);
  const keys = selected.map(([, key]) => key);
  if (new Set(keys).size !== keys.length)
    throw new Error('Cada campo de destino debe asignarse a una sola columna.');
  if (keys.some((key) => !fields.some((field) => field.key === key)))
    throw new Error('El mapeo contiene un campo que ya no está disponible.');
  const missing = fields.filter((field) => field.required && !keys.includes(field.key));
  if (missing.length)
    throw new Error(
      `Mapea los campos obligatorios: ${missing.map((field) => field.label).join(', ')}.`,
    );
  if (!selected.length) throw new Error('Asigna al menos una columna antes de validar.');
  return records.map((record) =>
    Object.fromEntries(selected.map(([header, key]) => [key, record[header] ?? null])),
  );
}
