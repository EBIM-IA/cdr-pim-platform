'use client';

import type { WorkspaceDto, WorkspaceQuery } from '@cdr/contracts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Columns3,
  Copy,
  Download,
  FileText,
  GitBranch,
  Link2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { downloadReportPdf } from '@/lib/report-pdf';
import {
  REPORT_DEFINITIONS,
  fetchCompleteReport,
  matchReportField,
  parseCsvHeaders,
  personalDefinition,
  personalReportsKey,
  projectReport,
  readPersonalReports,
  reportColumns,
  reportQuery,
  reportRows,
  type PersonalReport,
  type ReportDefinition,
  type ReportLayout,
} from '@/lib/reports';
import { downloadWorkbookXlsx, type TabularData } from '@/lib/tabular-export';
import { fetchWorkspace } from '@/lib/workspace-api';
import { parseFirstXlsxWorksheet } from '@/lib/xlsx-import';

import styles from './reports-workspace.module.css';

const icons = {
  attributes: SlidersHorizontal,
  reports: BarChart3,
  clock: Clock3,
  products: Boxes,
  documents: FileText,
  publication: CheckCircle2,
};
const indicators = [
  {
    key: 'quality',
    title: 'Calidad del catálogo',
    description: 'Completitud, obligatorios faltantes, imágenes y documentos por plantilla.',
    unit: '% de completitud promedio',
    icon: ShieldCheck,
    href: '/quality',
    capability: 'menu:ai-quality:view',
  },
  {
    key: 'duplicates',
    title: 'Posibles duplicados',
    description: 'Alertas de similitud y decisiones humanas; nunca fusiones.',
    unit: 'alertas abiertas',
    icon: Copy,
    href: '/quality?view=duplicates',
    capability: 'menu:ai-quality:view',
  },
  {
    key: 'unifiers',
    title: 'Código Unificador y Homólogos',
    description: 'Grupos por código unificador, homólogos y OEM.',
    unit: 'códigos unificadores',
    icon: Link2,
    href: '/equivalences',
    capability: 'menu:equivalences:view',
  },
  {
    key: 'publication',
    title: 'Publicación por canal',
    description: 'SKU publicables, pendientes y bloqueados para PrestaShop.',
    unit: 'SKU publicables',
    icon: CheckCircle2,
    href: '/publication',
    capability: 'menu:publication:view',
  },
  {
    key: 'integrations',
    title: 'Integraciones',
    description: 'Lotes, errores, reintentos y fechas por conector.',
    unit: 'registros con error',
    icon: GitBranch,
    href: '/integrations',
    capability: 'menu:integrations:view',
  },
  {
    key: 'traceability',
    title: 'Trazabilidad',
    description: 'Cambios, fuente, actor, motivo y override humano.',
    unit: 'eventos registrados',
    icon: SlidersHorizontal,
    href: '/administration?view=audit',
    capability: 'menu:administration:view',
  },
  {
    key: 'searches',
    title: 'Búsquedas',
    description: 'Consultas frecuentes, fallidas y sin resultados.',
    unit: 'consultas registradas',
    icon: Search,
    href: '/reports?view=searches',
    capability: 'menu:reports:view',
  },
  {
    key: 'catalog',
    title: 'Catálogo / exportación',
    description: 'Listado filtrable del catálogo con origen de datos.',
    unit: 'SKU en el catálogo',
    icon: Boxes,
    href: '/products',
    capability: 'menu:products:view',
  },
] as const;
const number = (value: number) =>
  new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 }).format(value);
const emptyLayout: ReportLayout = { order: [], hidden: [] };
const layoutKey = (actor: string, id: string) =>
  `cdr:reports:columns:${encodeURIComponent(actor)}:${id}`;
function savedLayout(actor: string, id: string): ReportLayout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(layoutKey(actor, id)) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'order' in value &&
      Array.isArray(value.order) &&
      value.order.every((key) => typeof key === 'string') &&
      'hidden' in value &&
      Array.isArray(value.hidden) &&
      value.hidden.every((key) => typeof key === 'string')
    )
      return { order: value.order, hidden: value.hidden };
  } catch {
    /* Browser storage is optional. */
  }
  return emptyLayout;
}
function persistLayout(actor: string, id: string, layout: ReportLayout) {
  try {
    localStorage.setItem(layoutKey(actor, id), JSON.stringify(layout));
  } catch {
    /* This visit still supports column configuration. */
  }
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo cargar el reporte.';
}

export function ReportsWorkspace({
  actorId,
  canManageFormats = false,
  capabilities = [],
}: {
  actorId: string;
  canManageFormats?: boolean;
  capabilities?: readonly string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get('view') ?? 'reports';
  const [summary, setSummary] = useState<WorkspaceDto | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [revision, setRevision] = useState(0);
  const [personal, setPersonal] = useState<PersonalReport[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [layout, setLayout] = useState<ReportLayout>(emptyLayout);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const exportController = useRef<AbortController | null>(null);
  const definitions = useMemo(
    () => [...REPORT_DEFINITIONS, ...personal.map(personalDefinition)],
    [personal],
  );
  const definition = definitions.find(
    (candidate) => candidate.id === view || candidate.format === view,
  );
  const filterQuery = useMemo<WorkspaceQuery>(
    () => ({
      ...(categoryId ? { categoryId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(debouncedQuery.trim() ? { q: debouncedQuery.trim() } : {}),
    }),
    [categoryId, from, to, debouncedQuery],
  );
  const invalidDates = !!from && !!to && from > to;
  const pendingSearch = query !== debouncedQuery;
  useEffect(() => {
    setPersonal(readPersonalReports(actorId));
  }, [actorId]);
  useEffect(() => {
    const controller = new AbortController();
    setSummaryError('');
    fetchWorkspace('reports', controller.signal, { report: 'summary' })
      .then(setSummary)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setSummaryError(errorText(failure));
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setCategoryId('');
    setFrom('');
    setTo('');
    setQuery('');
    setDebouncedQuery('');
    setColumnFilters({});
    setColumnsOpen(false);
    setSort(null);
    setPage(1);
    setLayout(savedLayout(actorId, view));
    setMessage('');
  }, [actorId, view]);
  useEffect(() => {
    if (!definition) {
      setWorkspace(null);
      return;
    }
    if (invalidDates) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setWorkspace(null);
    fetchCompleteReport(reportQuery(definition, filterQuery), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setWorkspace(data);
          setPage(1);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(errorText(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [definition, filterQuery, invalidDates, revision]);
  useEffect(() => () => exportController.current?.abort(), []);
  const columns = useMemo(
    () => (definition && workspace ? reportColumns(definition, workspace) : []),
    [definition, workspace],
  );
  const rows = useMemo(() => {
    if (!definition || !workspace) return [];
    const result = [...reportRows(definition, workspace)];
    if (sort)
      result.sort((left, right) => {
        const a = left.values[sort.key],
          b = right.values[sort.key];
        return (
          (typeof a === 'number' && typeof b === 'number'
            ? a - b
            : String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true })) *
          sort.direction
        );
      });
    return result;
  }, [definition, workspace, sort]);
  const effectiveLayout = useMemo(() => {
    const order = [...new Set([...layout.order, ...columns.map((column) => column.key)])].filter(
      (key) => columns.some((column) => column.key === key),
    );
    const hidden = layout.hidden.filter((key) => order.includes(key));
    return { order, hidden: hidden.length === order.length ? hidden.slice(1) : hidden };
  }, [columns, layout]);
  const projected = useMemo(
    () => projectReport(columns, rows, effectiveLayout, columnFilters),
    [columns, rows, effectiveLayout, columnFilters],
  );
  const visibleColumns = effectiveLayout.order
    .filter((key) => !effectiveLayout.hidden.includes(key))
    .map((key) => columns.find((column) => column.key === key))
    .filter((column) => column !== undefined);
  const categories = summary?.reportCategories ?? [];
  const filterDescription = [
    categoryId
      ? `Categoría: ${categories.find((category) => category.id === categoryId)?.path ?? categoryId}`
      : 'Todas las categorías',
    from || to ? `Fechas: ${from || '…'} – ${to || '…'}` : '',
    debouncedQuery ? `Búsqueda: «${debouncedQuery}»` : '',
    ...Object.entries(columnFilters)
      .filter(([, value]) => value)
      .map(
        ([key, value]) =>
          `${columns.find((column) => column.key === key)?.label ?? key}: «${value}»`,
      ),
  ]
    .filter(Boolean)
    .join(' · ');
  const hasFilters =
    categoryId || from || to || query || Object.values(columnFilters).some(Boolean);
  function updateLayout(next: ReportLayout) {
    setLayout(next);
    if (definition) persistLayout(actorId, definition.id, next);
  }
  function openReport(id: string) {
    router.push(`/reports?view=${encodeURIComponent(id)}`);
  }
  function clearFilters() {
    setCategoryId('');
    setFrom('');
    setTo('');
    setQuery('');
    setDebouncedQuery('');
    setColumnFilters({});
    setPage(1);
  }
  async function exportReport(target: ReportDefinition, format: 'xlsx' | 'pdf') {
    if (exporting) return;
    setExporting(true);
    setError('');
    setMessage('Preparando todas las filas del reporte…');
    const controller = new AbortController();
    exportController.current = controller;
    try {
      const active = target.id === definition?.id;
      const data =
        active && workspace
          ? workspace
          : await fetchCompleteReport(
              reportQuery(target, active ? filterQuery : {}),
              controller.signal,
            );
      const targetColumns = reportColumns(target, data);
      const targetRows = active ? rows : reportRows(target, data);
      const projection = projectReport(
        targetColumns,
        targetRows,
        active ? effectiveLayout : savedLayout(actorId, target.id),
        active ? columnFilters : {},
      );
      const context = active ? filterDescription : 'Todas las categorías · Sin filtros de fecha';
      if (format === 'pdf')
        downloadReportPdf(projection, target.title, `${context} · ${projection.rows.length} filas`);
      else
        downloadWorkbookXlsx(
          [
            { ...projection, sheetName: target.title },
            {
              sheetName: 'Filtros',
              headers: ['Parámetro', 'Valor'],
              rows: [
                ['Reporte', target.title],
                ['Filtros', context],
                ['Filas', projection.rows.length],
                ['Generado', data.generatedAt],
              ],
            },
          ],
          target.title,
        );
      setMessage(
        `${target.title}: ${number(projection.rows.length)} filas exportadas a ${format === 'pdf' ? 'PDF' : 'Excel'}.`,
      );
    } catch (failure) {
      setError(errorText(failure));
      setMessage('');
    } finally {
      setExporting(false);
      exportController.current = null;
    }
  }
  async function exportAll() {
    if (exporting) return;
    setExporting(true);
    setError('');
    const controller = new AbortController();
    exportController.current = controller;
    try {
      const sheets: TabularData[] = [];
      for (const [index, target] of definitions.entries()) {
        setMessage(`Preparando ${index + 1} de ${definitions.length}: ${target.title}…`);
        const data = await fetchCompleteReport(reportQuery(target), controller.signal);
        sheets.push({
          ...projectReport(
            reportColumns(target, data),
            reportRows(target, data),
            savedLayout(actorId, target.id),
          ),
          sheetName: target.title,
        });
      }
      downloadWorkbookXlsx(sheets, 'Reportes CDR');
      setMessage(
        `${sheets.length} reportes exportados en un libro de Excel, una hoja por reporte.`,
      );
    } catch (failure) {
      setError(errorText(failure));
      setMessage('');
    } finally {
      setExporting(false);
      exportController.current = null;
    }
  }
  function savePersonal(report: PersonalReport) {
    const next = [...personal, report];
    localStorage.setItem(personalReportsKey(actorId), JSON.stringify(next));
    setPersonal(next);
    setDrawer(false);
    openReport(report.id);
  }
  function removePersonal(report: PersonalReport) {
    if (
      !canManageFormats ||
      !window.confirm(`¿Quitar el formato personal «${report.title}» de este navegador?`)
    )
      return;
    try {
      const next = personal.filter((item) => item.id !== report.id);
      localStorage.setItem(personalReportsKey(actorId), JSON.stringify(next));
      setPersonal(next);
      setMessage('Formato personal quitado.');
    } catch {
      setError('No se pudo actualizar el almacenamiento de este navegador.');
    }
  }
  function tile(target: ReportDefinition) {
    const Icon = icons[target.icon];
    const metadata = summary?.reportFormats?.find((item) => item.format === target.format);
    return (
      <article
        key={target.id}
        className={`${styles.tile} ${target.custom ? styles.custom : ''}`}
        aria-label={target.title}
      >
        <span className={styles.bubble}>
          <Icon aria-hidden="true" />
        </span>
        <h3 className={styles.title}>
          {target.title}
          {target.client ? (
            <span className={styles.badge}>{target.custom ? 'Formato cargado' : 'Excel v2'}</span>
          ) : null}
        </h3>
        <p className={styles.description} title={target.description}>
          {target.description}
        </p>
        <p className={styles.tally}>
          <b>{metadata ? number(metadata.totalRows) : '—'}</b> filas ·{' '}
          {target.custom?.fields.length ?? metadata?.columnCount ?? '—'} columnas
        </p>
        {target.custom ? <small className={styles.note}>Guardado en este navegador</small> : null}
        <div className={styles.actions}>
          <Button
            variant="dark"
            onClick={() => openReport(target.id)}
            aria-label={`Abrir ${target.title}`}
          >
            Abrir
          </Button>
          <Button
            variant="outline"
            disabled={exporting || !summary}
            onClick={() => void exportReport(target, 'xlsx')}
            aria-label={`Excel ${target.title}`}
          >
            Excel
          </Button>
          <Button
            variant="outline"
            disabled={exporting || !summary}
            onClick={() => void exportReport(target, 'pdf')}
            aria-label={`PDF ${target.title}`}
          >
            PDF
          </Button>
          {target.custom && canManageFormats ? (
            <Button
              variant="ghost"
              onClick={() => removePersonal(target.custom!)}
              aria-label={`Quitar ${target.title}`}
            >
              Quitar
            </Button>
          ) : null}
        </div>
      </article>
    );
  }
  return (
    <div className={styles.workspace}>
      {definition ? (
        <nav className={styles.crumb} aria-label="Ruta del reporte">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <button onClick={() => router.push('/reports')}>Reportes</button>
          <span>/</span>
          <span aria-current="page">{definition.title}</span>
        </nav>
      ) : null}
      <PageHeader
        title={definition?.title ?? (view === 'searches' ? 'Reporte de búsquedas' : 'Reportes')}
        description={
          definition?.description ??
          'Indicadores definidos para calidad, búsquedas, equivalencias e integraciones.'
        }
        actions={
          definition || view === 'searches' ? (
            <Button variant="outline" onClick={() => router.push('/reports')}>
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Volver a reportes
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={exporting || !summary}
              onClick={() => void exportAll()}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Exportar todo (Excel)
            </Button>
          )
        }
      />
      <ScreenGuide
        objective="Consultar los formatos del cliente y los indicadores del PIM con datos registrados."
        actions={[
          'Abre un formato y filtra por categoría, fechas o texto.',
          'Selecciona y ordena columnas; Excel y PDF conservan la selección y los filtros.',
          'Carga encabezados de una plantilla para crear una configuración personal en este navegador.',
        ]}
        dataSource="Catálogo, historial de cambios, documentos y publicación persistidos en el PIM."
        limitation="Los indicadores sin una fuente de datos registrada se muestran como no disponibles."
      />
      {message ? (
        <div role="status" className={styles.message}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {error}{' '}
          <button className="underline" onClick={() => setRevision((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}
      {summaryError ? (
        <StatePanel
          variant="error"
          title="No se pudieron cargar los reportes"
          description={summaryError}
          actionLabel="Reintentar"
          onAction={() => setRevision((value) => value + 1)}
        />
      ) : null}
      {!definition && view !== 'searches' ? (
        <>
          <section className={styles.section} aria-labelledby="client-reports">
            <h2 className={styles.heading} id="client-reports">
              Reportes del cliente
            </h2>
            <p className={styles.subtitle}>
              Formatos de las hojas de reporte de PLANTILLAS_PIM_v2.xlsx y los que se carguen desde
              una plantilla del cliente. Se filtran por categoría y fechas y se descargan en Excel o
              PDF.
            </p>
            <div className={styles.grid}>
              {definitions.filter((target) => target.client).map(tile)}
            </div>
            <div className={styles.newLine}>
              <span>¿Llegó otra plantilla de reporte del cliente?</span>
              {canManageFormats ? (
                <Button disabled={!summary?.reportFields?.length} onClick={() => setDrawer(true)}>
                  Nuevo formato desde plantilla del cliente (Excel)
                </Button>
              ) : (
                <span>Un ADMINISTRADOR puede cargarla como nuevo formato.</span>
              )}
            </div>
          </section>
          <section className={styles.section} aria-labelledby="additional-reports">
            <h2 className={styles.heading} id="additional-reports">
              Reportes adicionales del PIM
            </h2>
            <p className={styles.subtitle}>
              Formatos que complementan los reportes del cliente con información actual del
              catálogo.
            </p>
            <div className={styles.grid}>
              {definitions.filter((target) => !target.client).map(tile)}
            </div>
          </section>
          <section aria-labelledby="pim-indicators">
            <h2 className={`${styles.heading} mb-2.5`} id="pim-indicators">
              Indicadores del PIM
            </h2>
            <div className={styles.grid}>
              {indicators.map((indicator) => {
                const metric = summary?.reportIndicators?.find(
                  (item) => item.key === indicator.key,
                );
                const available = metric?.status === 'available' && metric.value !== null;
                const Icon = indicator.icon;
                const canOpen = capabilities.includes(indicator.capability);
                return (
                  <article
                    key={indicator.key}
                    aria-label={indicator.title}
                    className={`${styles.tile} ${styles.indicator}`}
                  >
                    <span className={styles.bubble}>
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className={styles.title}>{indicator.title}</h3>
                    <p className={styles.description} title={indicator.description}>
                      {indicator.description}
                    </p>
                    <p className={styles.tally}>
                      <b>{available ? number(metric.value!) : summary ? 'Sin datos' : '—'}</b>{' '}
                      {available ? indicator.unit : ''}
                    </p>
                    <small className={styles.note}>
                      {metric?.detail ?? 'Consultando datos del PIM…'}
                    </small>
                    <div className={styles.actions}>
                      {canOpen ? (
                        <Button asChild variant="dark">
                          <Link href={indicator.href} aria-label={`Abrir ${indicator.title}`}>
                            Abrir
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          variant="dark"
                          disabled
                          title="Tu rol no tiene acceso a este módulo"
                        >
                          Abrir
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className={styles.footnote}>
              Los valores se calculan desde los registros del PIM. «Sin datos» indica que todavía no
              existe una fuente registrada para ese indicador.
            </p>
          </section>
        </>
      ) : null}
      {view === 'searches' ? (
        <section className={styles.tableCard}>
          <div className={styles.tableHeading}>
            <h2>Consultas frecuentes, fallidas y sin resultados</h2>
            <p>
              {summary?.reportIndicators?.find((item) => item.key === 'searches')?.detail ??
                'El sistema todavía no registra telemetría de consultas para construir este reporte.'}
            </p>
          </div>
          <div className={styles.empty}>
            No hay métricas de búsquedas registradas. Las búsquedas del catálogo siguen disponibles.
          </div>
          {capabilities.includes('menu:products:view') ? (
            <div className="p-4">
              <Button asChild variant="dark">
                <Link href="/products?view=search">Abrir búsqueda</Link>
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {definition ? (
        <>
          <div
            className={styles.toolbar}
            role="toolbar"
            aria-label="Filtros y exportación del reporte"
          >
            <label className={`${styles.field} ${styles.category}`}>
              <span>Categoría</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.path}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Desde</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                max={to || undefined}
              />
            </label>
            <label className={styles.field}>
              <span>Hasta</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                min={from || undefined}
              />
            </label>
            <label className={`${styles.field} ${styles.search}`}>
              <span>Buscar</span>
              <input
                type="search"
                placeholder="Buscar en el reporte…"
                value={query}
                maxLength={200}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {hasFilters ? (
              <Button variant="ghost" onClick={clearFilters}>
                Limpiar
              </Button>
            ) : null}
            <Button
              disabled={exporting || loading || !workspace || invalidDates || pendingSearch}
              onClick={() => void exportReport(definition, 'xlsx')}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Excel
            </Button>
            <Button
              variant="outline"
              disabled={exporting || loading || !workspace || invalidDates || pendingSearch}
              onClick={() => void exportReport(definition, 'pdf')}
            >
              <FileText className="size-3.5" aria-hidden="true" />
              PDF
            </Button>
            <Button
              variant="ghost"
              aria-expanded={columnsOpen}
              aria-controls="report-columns"
              disabled={!workspace}
              onClick={() => setColumnsOpen(!columnsOpen)}
            >
              <Columns3 className="size-3.5" aria-hidden="true" />
              Columnas · {visibleColumns.length}
            </Button>
          </div>
          {invalidDates ? (
            <div role="alert" className={`${styles.message} ${styles.error}`}>
              La fecha Hasta debe ser igual o posterior a Desde.
            </div>
          ) : null}
          {columnsOpen ? (
            <section
              className={styles.columnPanel}
              id="report-columns"
              aria-label="Columnas del reporte"
            >
              <strong className="text-sm">Columnas del reporte</strong>
              <p>
                Marca las que quieres ver y ordénalas. Se aplica a la pantalla, al Excel y al PDF.
                Guardado en este navegador.
              </p>
              <ol>
                {effectiveLayout.order.map((key, index) => {
                  const column = columns.find((item) => item.key === key)!;
                  const hidden = effectiveLayout.hidden.includes(key);
                  function move(offset: number) {
                    const order = [...effectiveLayout.order];
                    const other = order[index + offset];
                    if (!other) return;
                    order[index] = other;
                    order[index + offset] = key;
                    updateLayout({ ...effectiveLayout, order });
                  }
                  return (
                    <li key={key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!hidden}
                          disabled={!hidden && visibleColumns.length === 1}
                          onChange={() =>
                            updateLayout({
                              ...effectiveLayout,
                              hidden: hidden
                                ? effectiveLayout.hidden.filter((item) => item !== key)
                                : [...effectiveLayout.hidden, key],
                            })
                          }
                        />
                        {column.label}
                      </label>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          disabled={index === 0}
                          aria-label={`Subir ${column.label}`}
                          onClick={() => move(-1)}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={index === effectiveLayout.order.length - 1}
                          aria-label={`Bajar ${column.label}`}
                          onClick={() => move(1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <Button variant="outline" onClick={() => updateLayout(emptyLayout)}>
                Restablecer columnas
              </Button>
            </section>
          ) : null}
          {loading ? (
            <div role="status" className={styles.message}>
              Consultando todas las filas del reporte…
            </div>
          ) : null}
          {workspace ? (
            <section className={styles.tableCard} aria-label="Resultado del reporte">
              <div className={styles.tableHeading}>
                <h2>
                  {definition.title} · {number(projected.rows.length)} filas ·{' '}
                  {projected.headers.length} columnas
                </h2>
                <p>
                  {filterDescription}. Excel y PDF descargan todas las filas de esta consulta con
                  las mismas columnas, orden y filtros.
                </p>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {visibleColumns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          aria-sort={
                            sort?.key === column.key
                              ? sort.direction === 1
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            className={styles.tableSort}
                            onClick={() => {
                              setSort({
                                key: column.key,
                                direction:
                                  sort?.key === column.key && sort.direction === 1 ? -1 : 1,
                              });
                              setPage(1);
                            }}
                          >
                            {column.label}
                            <ArrowUpDown className="size-3" aria-hidden="true" />
                          </button>
                          <input
                            type="search"
                            aria-label={`Filtrar ${column.label}`}
                            placeholder="Filtrar…"
                            value={columnFilters[column.key] ?? ''}
                            onChange={(event) => {
                              setColumnFilters({
                                ...columnFilters,
                                [column.key]: event.target.value,
                              });
                              setPage(1);
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projected.rows.slice((page - 1) * 100, page * 100).map((row, index) => (
                      <tr key={`${page}-${index}`}>
                        {row.map((cell, column) => (
                          <td
                            key={visibleColumns[column]?.key ?? column}
                            title={String(cell ?? '')}
                          >
                            {cell === null || cell === undefined
                              ? '—'
                              : typeof cell === 'boolean'
                                ? cell
                                  ? 'Sí'
                                  : 'No'
                                : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!projected.rows.length ? (
                  <div className={styles.empty}>
                    Sin filas para estos filtros. Amplía el rango de fechas o elige otra categoría.
                  </div>
                ) : null}
              </div>
              <div className={styles.pagination}>
                <span>
                  {projected.rows.length
                    ? `${(page - 1) * 100 + 1}–${Math.min(page * 100, projected.rows.length)} de ${number(projected.rows.length)} filas`
                    : '0 filas'}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 100 >= projected.rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
              {workspace.notices.map((notice) => (
                <p key={notice.id} className="border-t px-3.5 py-2 text-xs text-muted-foreground">
                  <strong>{notice.title}: </strong>
                  {notice.message}
                </p>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
      {drawer ? (
        <NewReportDrawer
          fields={summary?.reportFields ?? []}
          onClose={() => setDrawer(false)}
          onSave={savePersonal}
        />
      ) : null}
    </div>
  );
}

function NewReportDrawer({
  fields,
  onClose,
  onSave,
}: {
  fields: NonNullable<WorkspaceDto['reportFields']>;
  onClose: () => void;
  onSave: (report: PersonalReport) => void;
}) {
  const [draft, setDraft] = useState<PersonalReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function close() {
    if (!draft || window.confirm('Hay una configuración sin guardar. ¿Descartarla?')) onClose();
  }
  async function read(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error('La plantilla debe pesar como máximo 10 MB.');
      const header = file.name.toLowerCase().endsWith('.xlsx')
        ? ((await parseFirstXlsxWorksheet(await file.arrayBuffer()))[0]
            ?.map(String)
            .map((value) => value.trim())
            .filter(Boolean) ?? [])
        : file.name.toLowerCase().endsWith('.csv')
          ? parseCsvHeaders(await file.text())
          : [];
      if (!header.length)
        throw new Error(
          'El archivo debe ser XLSX o CSV y contener encabezados en la primera fila.',
        );
      if (header.length > 200 || header.some((value) => value.length > 120))
        throw new Error('Usa como máximo 200 columnas con encabezados de hasta 120 caracteres.');
      setDraft({
        id: `personal-${crypto.randomUUID()}`,
        file: file.name,
        title: file.name
          .replace(/\.[^.]+$/u, '')
          .replace(/[_-]+/gu, ' ')
          .slice(0, 160),
        fields: header.map((value) => ({ header: value, field: matchReportField(value, fields) })),
      });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  const mapped = draft?.fields.filter((field) => field.field).length ?? 0;
  return (
    <WorkspaceDrawer
      title="Nuevo formato desde plantilla del cliente"
      onClose={close}
      busy={busy}
      unsavedChanges={!!draft}
    >
      <p className={styles.subtitle}>
        Sube el Excel o CSV del formato que entregue Casa del Rulimán. Se leen los encabezados de la
        primera fila y se mapean a campos del PIM. Puedes mapear a mano lo que no se reconozca o
        dejarlo vacío.
      </p>
      <p className={styles.message}>
        Guardado en este navegador, para tu usuario. Solo se guarda la configuración; las filas se
        consultan desde los datos actuales del PIM.
      </p>
      <label className={styles.drop}>
        <UploadCloud className="size-8 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <b>Selecciona la plantilla del reporte</b>
          <small>.xlsx .csv · solo se leen los encabezados · máximo 10 MB</small>
        </span>
        <input
          className="sr-only"
          type="file"
          accept=".xlsx,.csv"
          aria-label="Plantilla del reporte"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
            event.target.value = '';
          }}
        />
      </label>
      {busy ? <p role="status">Leyendo encabezados…</p> : null}
      {error ? (
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          {error}
        </p>
      ) : null}
      {draft ? (
        <>
          <label className={styles.field}>
            <span>Nombre del formato</span>
            <input
              value={draft.title}
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <p className="mt-3 text-xs text-muted-foreground">
            {draft.fields.length} columnas · {mapped} mapeadas · {draft.fields.length - mapped} sin
            mapear
          </p>
          <div className={styles.mapping}>
            <table>
              <thead>
                <tr>
                  <th>Encabezado del cliente</th>
                  <th>Campo del PIM</th>
                </tr>
              </thead>
              <tbody>
                {draft.fields.map((field, index) => (
                  <tr key={index}>
                    <th scope="row">{field.header}</th>
                    <td>
                      <select
                        aria-label={`Campo PIM para ${field.header}`}
                        value={field.field}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, position) =>
                              position === index ? { ...item, field: event.target.value } : item,
                            ),
                          })
                        }
                      >
                        <option value="">— Sin mapear (columna vacía) —</option>
                        {fields.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.drawerActions}>
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !draft.title.trim() || mapped === 0}
              onClick={() => {
                try {
                  onSave({ ...draft, title: draft.title.trim() });
                } catch {
                  setError(
                    'No se pudo guardar la configuración. Comprueba que el almacenamiento de este navegador esté habilitado.',
                  );
                }
              }}
            >
              Guardar formato
            </Button>
          </div>
          {mapped === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Mapea al menos una columna antes de guardar.
            </p>
          ) : null}
        </>
      ) : null}
    </WorkspaceDrawer>
  );
}
