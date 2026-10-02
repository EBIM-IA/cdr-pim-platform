import type { WorkspaceColumn, WorkspaceMetric, WorkspaceRow } from '@cdr/contracts';

const integerFormatter = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 });
const dateTimeFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatWorkspaceDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export function formatWorkspaceMetric(metric: WorkspaceMetric): string {
  if (metric.format === 'datetime' && typeof metric.value === 'string') {
    return formatWorkspaceDateTime(metric.value);
  }
  if (metric.format === 'integer' && typeof metric.value === 'number') {
    return integerFormatter.format(metric.value);
  }
  return String(metric.value);
}

export function formatWorkspaceCell(
  value: WorkspaceRow['values'][string] | undefined,
  column: WorkspaceColumn,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'datetime' && typeof value === 'string') {
    return formatWorkspaceDateTime(value);
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return numberFormatter.format(value);
  return String(value);
}

export function isCompactWorkspaceStatus(value: string): boolean {
  return value.length <= 30 && !/[\r\n]/u.test(value);
}

function normalized(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
}

export function filterWorkspaceRows(
  rows: readonly WorkspaceRow[],
  columns: readonly WorkspaceColumn[],
  query: string,
): WorkspaceRow[] {
  const term = normalized(query.trim());
  if (!term) return [...rows];

  return rows.filter((row) =>
    [row.id, ...columns.map((column) => row.values[column.key])].some((value) =>
      normalized(value).includes(term),
    ),
  );
}
