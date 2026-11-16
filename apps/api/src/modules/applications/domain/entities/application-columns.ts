import { ValidationError } from '@cdr/shared';
export interface ApplicationAdditionalColumn {
  readonly key: string;
  readonly header: string;
  readonly label: string;
  readonly required: boolean;
  readonly aliases: readonly string[];
}
export interface ApplicationColumnSettings {
  readonly columns: readonly ApplicationAdditionalColumn[];
  readonly version: number;
}
export function normalizeApplicationColumnHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
}
const reserved = new Set(
  [
    'id',
    'groupId',
    'unifiedCode',
    'codigo_unificador',
    'Código Unificador',
    'vehicleType',
    'tipo_aplicacion',
    'tipo_vehiculo',
    'marca_industria',
    'marca_vehiculo',
    'Marca Vehículo',
    'make',
    'marca',
    'model',
    'Modelo',
    'modelo_equipo',
    'bodyStyle',
    'Tipo',
    'fuel',
    'Combustible',
    'traction',
    'Tracción',
    'displacement',
    'Cilindraje',
    'yearFrom',
    'anio_desde',
    'Año Desde',
    'yearTo',
    'anio_hasta',
    'Año Hasta',
    'area',
    'Área',
    'subarea',
    'Subárea',
    'engine',
    'Motor',
    'notes',
    'notas',
    'observaciones',
    'source',
    'active',
    'additionalFields',
    'constructor',
    'prototype',
    '__proto__',
  ].map(normalizeApplicationColumnHeader),
);
export function validateApplicationColumns(columns: readonly ApplicationAdditionalColumn[]): void {
  if (columns.length > 60) throw new ValidationError('Máximo 60 columnas adicionales');
  const keys = new Set<string>(),
    headers = new Set<string>();
  for (const column of columns) {
    if (
      !/^[a-z][a-z0-9_]{0,79}$/u.test(column.key) ||
      !column.label.trim() ||
      column.label.length > 160 ||
      !column.header.trim() ||
      column.header.length > 120 ||
      column.aliases.length > 20
    )
      throw new ValidationError('La columna adicional no es válida');
    if (keys.has(column.key) || reserved.has(normalizeApplicationColumnHeader(column.key)))
      throw new ValidationError('La clave de columna ya existe o está reservada');
    keys.add(column.key);
    for (const header of new Set(
      [column.key, column.header, column.label, ...column.aliases].map(
        normalizeApplicationColumnHeader,
      ),
    )) {
      if (!header || headers.has(header) || reserved.has(header))
        throw new ValidationError(
          'Los encabezados y alias deben ser únicos y distintos de las columnas base',
        );
      headers.add(header);
    }
  }
}
export function validateApplicationAdditionalFields(
  fields: Readonly<Record<string, string | null>>,
  columns: readonly ApplicationAdditionalColumn[],
  partial = false,
): void {
  if (Object.keys(fields).length > 60) throw new ValidationError('Máximo 60 campos adicionales');
  for (const [key, value] of Object.entries(fields)) {
    if (
      !columns.some((column) => column.key === key) ||
      (typeof value !== 'string' && value !== null) ||
      (typeof value === 'string' && value.length > 500)
    )
      throw new ValidationError('Campo adicional no configurado o valor no válido', {
        attributeKey: key,
      });
  }
  for (const column of columns)
    if (
      column.required &&
      (!partial || Object.hasOwn(fields, column.key)) &&
      !fields[column.key]?.trim()
    )
      throw new ValidationError(`El campo ${column.label} es obligatorio`);
}
