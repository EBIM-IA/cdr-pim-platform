import type {
  ReportFormat,
  WorkspaceColumn,
  WorkspaceDto,
  WorkspaceQuery,
  WorkspaceRow,
} from '@cdr/contracts';

import { fetchWorkspace } from '@/lib/workspace-api';
import { csvDelimiter } from '@/lib/import-mapping';
import type { TabularData } from '@/lib/tabular-export';

export interface ReportDefinition {
  id: string;
  format: Exclude<ReportFormat, 'summary'>;
  title: string;
  description: string;
  icon: 'attributes' | 'reports' | 'clock' | 'products' | 'documents' | 'publication';
  client?: boolean;
  custom?: PersonalReport;
}
export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    id: 'attribute-report',
    format: 'attribute_changes',
    title: 'Reporte de atributos',
    icon: 'attributes',
    client: true,
    description:
      'Cada cambio de un SKU con completitud, obligatorios y opcionales faltantes, valor anterior y nuevo, fechas, origen, actor y motivo.',
  },
  {
    id: 'general-report',
    format: 'general_results',
    title: 'Reporte general (resultados)',
    icon: 'reports',
    client: true,
    description:
      'Ítems actualizados en el periodo con aplicaciones, OEM, homólogos y atributos con valor, antes y ahora. Los resultados se calculan con el historial registrado.',
  },
  {
    id: 'period-report',
    format: 'period_results',
    title: 'Resultados de periodo',
    icon: 'clock',
    client: true,
    description:
      'Ítems actualizados por mes y año, calculados desde los cambios registrados en el PIM y el periodo seleccionado.',
  },
  {
    id: 'products-by-category',
    format: 'products_by_category',
    title: 'Productos por categoría',
    icon: 'products',
    description:
      'Identificación ERP con los tres niveles del árbol, estado, completitud y última actualización. Al elegir una categoría final se agregan los atributos de su plantilla.',
  },
  {
    id: 'edited-information',
    format: 'edited_information',
    title: 'Información editada',
    icon: 'attributes',
    description:
      'Cada cambio de un producto: fecha, campo, valor anterior y nuevo, modificación anterior, origen, actor y motivo.',
  },
  {
    id: 'documents-by-sku',
    format: 'documents_by_sku',
    title: 'Imágenes y documentos por SKU',
    icon: 'documents',
    description:
      'Estado de fotografía, plano, ficha técnica, ficha de seguridad y certificado de cada SKU, con la fecha de la última carga.',
  },
  {
    id: 'publication-by-sku',
    format: 'publication_by_sku',
    title: 'Publicación PrestaShop por SKU',
    icon: 'publication',
    description:
      'Estado de publicación de cada SKU, motivo, atributos de su categoría y fecha de la última actualización.',
  },
];
export interface PersonalReport {
  id: string;
  title: string;
  file: string;
  fields: { header: string; field: string }[];
}
export interface ReportLayout {
  order: string[];
  hidden: string[];
}
export const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');
export function matchReportField(
  header: string,
  fields: readonly { id: string; label: string }[],
): string {
  const normalized = normalizeHeader(header);
  const exact = fields.find(
    (field) =>
      normalizeHeader(field.label) === normalized || normalizeHeader(field.id) === normalized,
  );
  if (exact) return exact.id;
  const aliases: Record<string, string> = {
    codigoarticulo: 'sku',
    codarticulo: 'sku',
    codigosku: 'sku',
    descripcion: 'name',
    producto: 'name',
    codigoproveedor: 'providerCode',
    codigounificador: 'unifiedCode',
    categoria1: 'categoryN1',
    categoria2: 'categoryN2',
    categoria3: 'categoryN3',
    completitud: 'completeness',
    completitudporcentaje: 'completeness',
    estado: 'status',
    ultimaactualizacion: 'updatedAt',
    plantilla: 'template',
    documentos: 'documents',
    tipoaplicacion: 'applicationType',
  };
  const candidate = aliases[normalized];
  return fields.some((field) => field.id === candidate) ? (candidate ?? '') : '';
}
export function parseCsvHeaders(source: string): string[] {
  const clean = source.replace(/^\uFEFF/u, '');
  const delimiter = csvDelimiter(clean);
  const cells: string[] = [];
  let cell = '',
    quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && (character === '\r' || character === '\n')) break;
    else if (!quoted && character === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('La primera fila del CSV tiene comillas sin cerrar.');
  cells.push(cell.trim());
  return cells.filter(Boolean);
}
export function personalReportsKey(actorId: string): string {
  return `cdr:reports:personal:${encodeURIComponent(actorId)}:v1`;
}
export function readPersonalReports(actorId: string): PersonalReport[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(personalReportsKey(actorId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is PersonalReport =>
        !!value &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        value.id.startsWith('personal-') &&
        typeof value.title === 'string' &&
        value.title.length <= 160 &&
        typeof value.file === 'string' &&
        Array.isArray(value.fields) &&
        value.fields.length > 0 &&
        value.fields.length <= 200 &&
        value.fields.every(
          (field: unknown) =>
            !!field &&
            typeof field === 'object' &&
            'header' in field &&
            typeof field.header === 'string' &&
            field.header.length <= 120 &&
            'field' in field &&
            typeof field.field === 'string',
        ),
    );
  } catch {
    return [];
  }
}
export function personalDefinition(report: PersonalReport): ReportDefinition {
  return {
    id: report.id,
    format: 'products_by_category',
    title: report.title,
    description: `Formato personal de ${report.file}. Los encabezados se completan con los datos actuales del PIM.`,
    icon: 'reports',
    client: true,
    custom: report,
  };
}
export function reportQuery(
  definition: ReportDefinition,
  filters: WorkspaceQuery = {},
): WorkspaceQuery {
  return {
    ...filters,
    report: definition.format,
    ...(definition.custom
      ? {
          field: [...new Set(definition.custom.fields.map((field) => field.field).filter(Boolean))],
        }
      : {}),
  };
}
/** Fetch all pages sequentially; never silently truncate a report at a response cap. */
export async function fetchCompleteReport(
  query: WorkspaceQuery,
  signal?: AbortSignal,
): Promise<WorkspaceDto> {
  const first = await fetchWorkspace('reports', signal, { ...query, page: 1, pageSize: 1000 });
  const rows = [...first.rows];
  const ids = new Set(rows.map((row) => row.id));
  let page = 2;
  while (rows.length < first.totalRows) {
    const next = await fetchWorkspace('reports', signal, {
      ...query,
      page: page++,
      pageSize: 1000,
    });
    if (
      next.columns.map((column) => column.key).join('\0') !==
      first.columns.map((column) => column.key).join('\0')
    )
      throw new Error('La estructura del reporte cambió. Vuelve a consultar antes de exportar.');
    let added = 0;
    for (const row of next.rows) {
      if (!ids.has(row.id)) {
        ids.add(row.id);
        rows.push(row);
        added += 1;
      }
    }
    if (!added)
      throw new Error(
        'El reporte cambió durante la consulta. Actualiza para obtener todas las filas.',
      );
  }
  return { ...first, rows, totalRows: rows.length };
}
export function reportColumns(
  definition: ReportDefinition,
  workspace: WorkspaceDto,
): WorkspaceColumn[] {
  return definition.custom
    ? definition.custom.fields.map((field, index) => ({
        key: `custom-${index}`,
        label: field.header,
        type: workspace.columns.find((column) => column.key === field.field)?.type ?? 'text',
      }))
    : workspace.columns;
}
export function reportRows(definition: ReportDefinition, workspace: WorkspaceDto): WorkspaceRow[] {
  if (!definition.custom) return workspace.rows;
  const fields = definition.custom.fields;
  return workspace.rows.map((row) => ({
    id: row.id,
    values: Object.fromEntries(
      fields.map((field, index) => [
        `custom-${index}`,
        field.field ? (row.values[field.field] ?? null) : null,
      ]),
    ),
  }));
}
export function projectReport(
  columns: readonly WorkspaceColumn[],
  rows: readonly WorkspaceRow[],
  layout: ReportLayout,
  columnFilters: Readonly<Record<string, string>> = {},
): TabularData {
  const valid = new Map(columns.map((column) => [column.key, column]));
  const order = [...new Set([...layout.order, ...columns.map((column) => column.key)])].filter(
    (key) => valid.has(key) && !layout.hidden.includes(key),
  );
  // A category can remove the only visible dynamic attribute from a saved layout.
  if (!order.length && columns[0]) order.push(columns[0].key);
  const filtered = rows.filter((row) =>
    Object.entries(columnFilters).every(
      ([key, value]) =>
        !value ||
        String(row.values[key] ?? '')
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .includes(
            value
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .toLowerCase(),
          ),
    ),
  );
  return {
    headers: order.map((key) => valid.get(key)?.label ?? key),
    rows: filtered.map((row) => order.map((key) => row.values[key] ?? null)),
  };
}
