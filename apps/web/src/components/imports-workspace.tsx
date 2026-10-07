'use client';

import {
  previewImportSchema,
  type ImportBatchDto,
  type ImportFormat,
  type ImportTarget,
} from '@cdr/contracts';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileSpreadsheet,
  Plus,
  ShieldAlert,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceData } from '@/components/use-workspace-data';
import { confirmImport, getImport, previewImport } from '@/lib/operational-api';
import { formatWorkspaceCell, formatWorkspaceMetric } from '@/lib/workspace-view';
import { cn } from '@/lib/utils';
import { readFirstXlsxWorksheet } from '@/lib/xlsx-import';
import { fetchCatalogCategories } from '@/lib/dynamic-catalog-api';

const wizardSteps = ['Archivo', 'SKU y plantilla', 'Mapeo', 'Validación', 'Confirmación'] as const;

const targetLabels: Record<ImportTarget, string> = {
  category: 'Atributos por categoría',
  applications: 'Aplicaciones por código unificador',
  homologs: 'Homólogos externos',
  oem: 'Códigos OEM por grupo automotriz',
};

const csvExamples: Record<ImportTarget, string> = {
  category: 'sku,descripcion_tecnica\nD1672,Descripción técnica actualizada por importación',
  applications:
    'unifiedCode,vehicleType,make,model,yearFrom,yearTo,engine\nD1672,Automóvil,Toyota,Hilux,2016,2024,2.8',
  homologs:
    'codigo_unificador,codigo_homologo,marca_homologo,estado_aprobacion,activo\nD1672,P-123,BOSCH,approved,true',
  oem: 'codigo_unificador,codigo_oem,marcas,estado_aprobacion,activo\nD1672,04465-0K240,TOYOTA;LEXUS,approved,true',
};

type ImportMode = 'history' | 'new' | 'result';

function newKey(target: ImportTarget): string {
  return `${target}-${crypto.randomUUID()}`;
}

function sourceColumns(payload: string, format: ImportFormat): string[] {
  if (format === 'csv') {
    return csvHeaderColumns(payload).slice(0, 20);
  }
  try {
    const value: unknown = JSON.parse(payload);
    if (!Array.isArray(value) || typeof value[0] !== 'object' || value[0] === null) return [];
    return Object.keys(value[0] as Record<string, unknown>).slice(0, 20);
  } catch {
    return [];
  }
}

function csvHeaderColumns(payload: string): string[] {
  const columns: string[] = [];
  const delimiter = detectCsvDelimiter(payload);
  let value = '';
  let quoted = false;
  for (let index = 0; index < payload.length; index += 1) {
    const char = payload[index] as string;
    if (char === '"') {
      if (quoted && payload[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      columns.push(value.trim());
      value = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break;
    } else value += char;
  }
  columns.push(value.trim());
  return columns.filter(Boolean);
}

function detectCsvDelimiter(payload: string): ',' | ';' {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < payload.length; index += 1) {
    const char = payload[index];
    if (char === '"') {
      if (quoted && payload[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

function localRowEstimate(payload: string, format: ImportFormat): number | null {
  if (format === 'csv') return Math.max(0, payload.split(/\r?\n/).filter(Boolean).length - 1);
  try {
    const value: unknown = JSON.parse(payload);
    return Array.isArray(value) ? value.length : null;
  } catch {
    return null;
  }
}

function BatchMetrics({ batch, result = false }: { batch: ImportBatchDto; result?: boolean }) {
  const warningRows = batch.rows.filter((row) => row.warnings.length > 0).length;
  const items = [
    ['Registros procesados', batch.totalRows, `Lote ${batch.id.slice(0, 8)}`, FileSpreadsheet],
    [result ? 'Aplicables' : 'Válidos', batch.validRows, targetLabels[batch.target], CheckCircle2],
    ['Advertencias', warningRows, 'Filas aplicables con avisos', Clock3],
    ['Rechazados', batch.invalidRows, 'Requieren corrección', XCircle],
  ] as const;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resultado del lote">
      {items.map(([label, value, note, Icon], index) => (
        <Card key={label} className="flex min-h-[118px] items-start gap-3 p-5">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full',
              index === 1
                ? 'bg-emerald-100 text-emerald-700'
                : index === 3
                  ? 'bg-red-100 text-red-600'
                  : 'bg-orange-100 text-primary',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <small className="text-muted-foreground">{label}</small>
            <strong className="mt-1 block text-2xl text-cdr-ink">{value}</strong>
            <small className="mt-1 block truncate text-muted-foreground">{note}</small>
          </span>
        </Card>
      ))}
    </section>
  );
}

function BatchRowsTable({ batch }: { batch: ImportBatchDto }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    batch.rows.forEach((row) => Object.keys(row.data).forEach((key) => keys.add(key)));
    return [...keys].slice(0, 8);
  }, [batch]);

  if (batch.rows.length === 0) {
    return <p className="p-5 text-sm text-muted-foreground">El archivo no contiene filas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Fila</th>
            <th className="px-4 py-3">Identificador</th>
            <th className="px-4 py-3">Campo</th>
            <th className="px-4 py-3">Validación</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {batch.rows.map((row) => {
            const identifier =
              row.data.sku ??
              row.data.unifiedCode ??
              row.data.externalCode ??
              row.data.oemCode ??
              '—';
            return (
              <tr key={row.rowNumber} className={row.valid ? '' : 'bg-red-50/50'}>
                <td className="px-4 py-3 font-semibold">{row.rowNumber}</td>
                <td className="px-4 py-3 font-mono text-xs">{String(identifier)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {columns.join(', ') || '—'}
                </td>
                <td className={cn('px-4 py-3 text-xs', !row.valid && 'text-red-700')}>
                  {row.errors.length > 0 ? (
                    row.errors.join(' · ')
                  ) : row.warnings.length > 0 ? (
                    <span className="text-amber-700">{row.warnings.join(' · ')}</span>
                  ) : (
                    'Sin observaciones'
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={row.valid ? (row.warnings.length > 0 ? 'warning' : 'success') : 'danger'}
                  >
                    {row.valid
                      ? row.warnings.length > 0
                        ? 'Advertencia'
                        : 'Correcto'
                      : 'Rechazado'}
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WizardStepper({ step }: { step: number }) {
  return (
    <ol className="grid overflow-hidden rounded-xl border sm:grid-cols-5" aria-label="Pasos">
      {wizardSteps.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          className={cn(
            'flex min-h-12 items-center gap-2 border-b px-4 text-xs font-semibold last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0',
            index === step
              ? 'bg-primary text-white'
              : index < step
                ? 'bg-orange-50 text-primary'
                : 'bg-slate-50 text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full border text-[10px]',
              index === step ? 'border-white/50' : 'border-current/25',
            )}
          >
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function ImportsWorkspace({ canExecute }: { canExecute: boolean }) {
  const [target, setTarget] = useState<ImportTarget>('applications');
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<
    { id: string; slug: string; name: string }[]
  >([]);
  const [payload, setPayload] = useState(csvExamples.applications);
  const [fileName, setFileName] = useState('aplicaciones.csv');
  const [idempotencyKey, setIdempotencyKey] = useState(() => newKey('applications'));
  const [batch, setBatch] = useState<ImportBatchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('history');
  const [step, setStep] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then((categories) => {
        setCategoryOptions(categories);
        setCategoryCode((current) => current || categories[0]?.slug || '');
      })
      .catch(() => setCategoryOptions([]));
    return () => controller.abort();
  }, []);
  const [resultId, setResultId] = useState('');
  const history = useWorkspaceData('imports');

  const columns = useMemo(() => sourceColumns(payload, format), [format, payload]);
  const rowEstimate = useMemo(() => localRowEstimate(payload, format), [format, payload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('view');
    const batchId = params.get('batch') ?? '';
    if (requested === 'new') setMode('new');
    if (requested === 'result' && batchId) {
      setMode('result');
      setResultId(batchId);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'result' || !resultId || batch?.id === resultId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void getImport(resultId)
      .then((loaded) => {
        if (active) setBatch(loaded);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el resultado.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [batch?.id, mode, resultId]);

  const navigate = (next: ImportMode, batchId = '') => {
    setMode(next);
    setResultId(batchId);
    const url = new URL(window.location.href);
    if (next === 'history') {
      url.searchParams.delete('view');
      url.searchParams.delete('batch');
    } else {
      url.searchParams.set('view', next);
      if (batchId) url.searchParams.set('batch', batchId);
      else url.searchParams.delete('batch');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const reset = () => {
    setPayload(format === 'csv' ? csvExamples[target] : '[]');
    setFileName(`${target}.${format}`);
    setIdempotencyKey(newKey(target));
    setBatch(null);
    setError(null);
    setStep(0);
  };

  const startNew = () => {
    reset();
    navigate('new');
  };

  const changeTarget = (value: ImportTarget) => {
    setTarget(value);
    setPayload(format === 'csv' ? csvExamples[value] : '[]');
    setFileName(`${value}.${format}`);
    setIdempotencyKey(newKey(value));
    setBatch(null);
  };

  const changeFormat = (value: ImportFormat) => {
    setFormat(value);
    setPayload(value === 'csv' ? csvExamples[target] : '[]');
    setFileName(`${target}.${value}`);
    setIdempotencyKey(newKey(target));
    setBatch(null);
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('El archivo supera el límite de 2 MB para esta vista previa.');
      return;
    }
    try {
      const lowerName = file.name.toLocaleLowerCase();
      const nextFormat: ImportFormat =
        lowerName.endsWith('.json') || lowerName.endsWith('.xlsx') ? 'json' : 'csv';
      const nextPayload = lowerName.endsWith('.xlsx')
        ? JSON.stringify(await readFirstXlsxWorksheet(file))
        : await file.text();
      if (new TextEncoder().encode(nextPayload).byteLength > 2_000_000) {
        setError('La primera hoja supera el límite de 2 MB después de convertirla a JSON.');
        return;
      }
      setPayload(nextPayload);
      setFileName(file.name);
      setFormat(nextFormat);
      setIdempotencyKey(newKey(target));
      setBatch(null);
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'No fue posible leer el archivo.');
    } finally {
      event.target.value = '';
    }
  };

  const validatePreview = async (): Promise<ImportBatchDto | null> => {
    setError(null);
    let records: unknown;
    if (format === 'json') {
      try {
        records = JSON.parse(payload);
      } catch {
        setError('El contenido JSON no tiene una sintaxis válida.');
        return null;
      }
    }
    const parsed = previewImportSchema.safeParse({
      target,
      format,
      idempotencyKey,
      ...(target === 'category' ? { categoryCode } : {}),
      ...(format === 'csv' ? { csv: payload } : { records }),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'La carga no es válida.');
      return null;
    }
    setLoading(true);
    try {
      const preview = await previewImport(parsed.data);
      setBatch(preview);
      return preview;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible validar la carga.',
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async () => {
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }
    if (step === 2) {
      const preview = batch ?? (await validatePreview());
      if (preview) setStep(3);
      return;
    }
    if (step === 3 && batch) setStep(4);
  };

  const confirm = async () => {
    if (!batch) return;
    setLoading(true);
    setError(null);
    try {
      const confirmed = await confirmImport(batch.id);
      setBatch(confirmed);
      navigate('result', confirmed.id);
      history.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible confirmar el lote.',
      );
    } finally {
      setLoading(false);
    }
  };

  const pageTitle =
    mode === 'history'
      ? 'Importaciones'
      : mode === 'new'
        ? 'Nueva importación'
        : 'Resultado de importación';
  const pageDescription =
    mode === 'history'
      ? 'Historial de cargas de enriquecimiento y estado persistido de cada lote.'
      : mode === 'new'
        ? 'Asistente controlado para validar archivos antes de confirmar su procesamiento.'
        : 'Validación y resultado por registro del lote persistido.';

  return (
    <>
      <PageHeader
        eyebrow="Ingreso de información"
        title={pageTitle}
        description={pageDescription}
        actions={
          mode === 'history' ? (
            <Button onClick={startNew}>
              <Plus aria-hidden="true" className="size-4" /> Nueva importación
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('history')}>
                Ver historial
              </Button>
              {mode === 'result' ? <Button onClick={startNew}>Nueva importación</Button> : null}
            </div>
          )
        }
      />
      <ScreenGuide
        objective={
          mode === 'history'
            ? 'Consulta lotes reales persistidos y abre el resultado detallado de cada uno.'
            : 'Guía la carga por archivo, identidad, mapeo, validación y confirmación sin crear SKU en ERP.'
        }
        actions={
          mode === 'history'
            ? ['Abre el resultado de un lote.', 'Inicia una nueva importación.']
            : [
                'Selecciona el archivo y su destino.',
                'Revisa columnas, identidad y validación por fila.',
                'Confirma las filas válidas y corrige después las filas rechazadas.',
              ]
        }
        dataSource="La vista previa, idempotencia, filas y confirmación se almacenan en el backend."
        limitation="La confirmación es parcial por fila para todos los destinos: las filas válidas se persisten y las rechazadas conservan su detalle. En atributos por categoría solo se aceptan SKU existentes, una categoría con plantilla activa y columnas importables para tu rol."
      />

      {error ? (
        <div
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {mode === 'history' ? (
        history.loading ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : history.error ? (
          <StatePanel
            variant="error"
            title="No fue posible cargar el historial"
            description={history.error}
            actionLabel="Reintentar"
            onAction={history.reload}
          />
        ) : history.workspace ? (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
              {history.workspace.metrics.slice(0, 4).map((metric, index) => {
                const Icon = [UploadCloud, CheckCircle2, XCircle, Clock3][index] ?? UploadCloud;
                return (
                  <Card key={metric.key} className="flex min-h-[118px] items-start gap-3 p-5">
                    <span className="grid size-9 place-items-center rounded-full bg-orange-100 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      <small className="text-muted-foreground">{metric.label}</small>
                      <strong className="mt-1 block text-2xl">
                        {formatWorkspaceMetric(metric)}
                      </strong>
                    </span>
                  </Card>
                );
              })}
            </section>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b p-5">
                <div>
                  <h2 className="font-semibold">Lotes de importación</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Historial real persistido.</p>
                </div>
                <Button variant="outline" onClick={history.reload}>
                  Actualizar
                </Button>
              </div>
              {history.workspace.rows.length === 0 ? (
                <div className="p-5">
                  <StatePanel
                    variant="empty"
                    title="Todavía no hay importaciones"
                    description="Inicia una nueva importación para validar y conservar el primer lote."
                    actionLabel="Nueva importación"
                    onAction={startNew}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Lote</th>
                        {history.workspace.columns.map((column) => (
                          <th key={column.key} className="px-4 py-3">
                            {column.label}
                          </th>
                        ))}
                        <th className="px-4 py-3">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.workspace.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-orange-50/40">
                          <td className="px-4 py-3 font-mono text-xs">{row.id.slice(0, 8)}</td>
                          {history.workspace?.columns.map((column) => {
                            const value = formatWorkspaceCell(row.values[column.key], column);
                            return (
                              <td key={column.key} className="px-4 py-3">
                                {column.type === 'status' ? (
                                  <StatusBadge tone={statusTone(value)}>{value}</StatusBadge>
                                ) : (
                                  value
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate('result', row.id)}
                            >
                              Ver resultado
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : null
      ) : null}

      {mode === 'new' ? (
        <div className="space-y-5">
          {!canExecute ? (
            <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-amber-950">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="font-semibold">Acceso de solo lectura</h2>
                <p className="text-sm">Tu rol no puede ejecutar importaciones.</p>
              </div>
            </Card>
          ) : null}
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-cdr-ink">Asistente de importación</h2>
            <div className="mt-4">
              <WizardStepper step={step} />
            </div>

            <div className="mt-6">
              {step === 0 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      label="Destino"
                      value={target}
                      disabled={!canExecute}
                      onChange={(event) => changeTarget(event.target.value as ImportTarget)}
                    >
                      <option value="category">Atributos por categoría</option>
                      <option value="applications">Aplicaciones</option>
                      <option value="homologs">Homólogos</option>
                      <option value="oem">Códigos OEM</option>
                    </Select>
                    <Select
                      label="Formato"
                      value={format}
                      disabled={!canExecute}
                      onChange={(event) => changeFormat(event.target.value as ImportFormat)}
                    >
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                    </Select>
                  </div>
                  <label className="grid min-h-40 cursor-pointer place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center">
                    <span>
                      <UploadCloud className="mx-auto size-9 text-primary" aria-hidden="true" />
                      <strong className="mt-3 block">Arrastra un archivo XLSX, CSV o JSON</strong>
                      <small className="mt-1 block text-muted-foreground">
                        Máximo 2 MB · el archivo no crea ni activa SKU.
                      </small>
                      <span className="mt-4 inline-flex rounded-lg border bg-white px-4 py-2 text-xs font-semibold">
                        Seleccionar archivo
                      </span>
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.csv,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      disabled={!canExecute}
                      onChange={(event) => void loadFile(event)}
                      className="sr-only"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                    Contenido del archivo
                    <textarea
                      className="min-h-36 w-full rounded-md border bg-white p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-cdr-ink"
                      value={payload}
                      disabled={!canExecute}
                      onChange={(event) => {
                        setPayload(event.target.value);
                        setBatch(null);
                      }}
                      spellCheck={false}
                    />
                  </label>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                  <Card className="overflow-hidden shadow-none">
                    <div className="border-b p-4">
                      <h3 className="font-semibold">SKU e identidad del lote</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        El contrato identifica registros existentes; no crea identidad maestra.
                      </p>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <small className="text-muted-foreground">Archivo</small>
                        <strong className="mt-1 block text-sm">{fileName}</strong>
                      </div>
                      <div className="rounded-lg border p-3">
                        <small className="text-muted-foreground">
                          Registros detectados localmente
                        </small>
                        <strong className="mt-1 block text-sm">
                          {rowEstimate ?? 'Por validar'}
                        </strong>
                      </div>
                      <div className="rounded-lg border p-3">
                        <small className="text-muted-foreground">Destino</small>
                        <strong className="mt-1 block text-sm">{targetLabels[target]}</strong>
                      </div>
                      <div className="rounded-lg border p-3">
                        <small className="text-muted-foreground">Identificador</small>
                        <strong className="mt-1 block text-sm">
                          {target === 'category' ? 'sku' : 'unifiedCode'}
                        </strong>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4 shadow-none">
                    <h3 className="font-semibold">Plantilla / destino</h3>
                    {target === 'category' ? (
                      <Select
                        label="Categoría con plantilla activa"
                        className="mt-4"
                        required
                        value={categoryCode}
                        disabled={!canExecute || categoryOptions.length === 0}
                        onChange={(event) => setCategoryCode(event.target.value)}
                      >
                        <option value="" disabled>
                          Selecciona una categoría
                        </option>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.slug}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        El destino se determina por el tipo de relación y el código unificador
                        entregado.
                      </p>
                    )}
                    <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
                      La API validará la identidad de cada fila en el paso Validación.
                    </div>
                  </Card>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <Card className="overflow-hidden shadow-none">
                    <div className="border-b p-4">
                      <h3 className="font-semibold">Mapeo de columnas · {targetLabels[target]}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        El contrato actual acepta nombres exactos; no persiste un mapeo
                        configurable.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] text-left text-sm">
                        <thead className="border-b bg-slate-50 text-[11px] uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Columna del archivo</th>
                            <th className="px-4 py-3">Atributo destino</th>
                            <th className="px-4 py-3">Modo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {columns.map((column) => (
                            <tr key={column}>
                              <td className="px-4 py-3 font-semibold">{column}</td>
                              <td className="px-4 py-3">{column}</td>
                              <td className="px-4 py-3">
                                <StatusBadge tone="info">Contrato exacto</StatusBadge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
                    No se inventa un mapeo visual: cambiar nombres de columnas requiere un contrato
                    backend que aún no existe.
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                batch ? (
                  <div className="space-y-5">
                    <BatchMetrics batch={batch} />
                    <Card className="overflow-hidden shadow-none">
                      <div className="border-b p-4">
                        <h3 className="font-semibold">Validación por registro</h3>
                        <p className="text-xs text-muted-foreground">
                          Respuesta real de la vista previa persistida.
                        </p>
                      </div>
                      <BatchRowsTable batch={batch} />
                    </Card>
                  </div>
                ) : (
                  <StatePanel
                    variant="empty"
                    title="Vista previa pendiente"
                    description="Continúa desde Mapeo para que el backend valide el archivo."
                  />
                )
              ) : null}

              {step === 4 && batch ? (
                <Card className="overflow-hidden shadow-none">
                  <div className="border-b p-5">
                    <h3 className="font-semibold">Confirmar procesamiento</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      La confirmación aplica las filas válidas de aplicaciones, homólogos o códigos
                      OEM y conserva las rechazadas para corregirlas.
                    </p>
                  </div>
                  <dl className="grid gap-0 divide-y p-5 text-sm">
                    {[
                      ['Archivo', fileName],
                      ['Destino', targetLabels[batch.target]],
                      ['Registros', String(batch.totalRows)],
                      ['Válidos', String(batch.validRows)],
                      ['Rechazados', String(batch.invalidRows)],
                      ['Clave de idempotencia', batch.idempotencyKey],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="max-w-[70%] break-all text-right font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="border-t bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
                    La carga es parcial: solo las filas marcadas como correctas se aplican. Conserva
                    el resultado para corregir y volver a cargar las filas rechazadas.
                  </div>
                </Card>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-5">
              {step === 0 ? (
                <Button variant="outline" onClick={() => navigate('history')}>
                  Cancelar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setStep((current) => current - 1)}
                  disabled={loading}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" /> Atrás
                </Button>
              )}
              {step < 4 ? (
                <Button
                  onClick={() => void nextStep()}
                  disabled={!canExecute || loading || !payload.trim()}
                >
                  {loading ? 'Validando…' : 'Continuar'}{' '}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  onClick={() => void confirm()}
                  disabled={!canExecute || loading || !batch || batch.validRows === 0}
                >
                  <FileCheck2 className="size-4" aria-hidden="true" />{' '}
                  {loading ? 'Confirmando…' : 'Confirmar lote'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {mode === 'result' ? (
        loading && !batch ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : batch ? (
          <div className="space-y-5">
            <BatchMetrics batch={batch} result />
            <Card className="overflow-hidden">
              <div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">Detalle por registro</h2>
                    <StatusBadge tone={statusTone(batch.status)}>
                      {batch.status === 'confirmed'
                        ? 'Confirmado'
                        : batch.status === 'failed'
                          ? 'Fallido'
                          : 'Vista previa'}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lote {batch.id} · creado {new Date(batch.createdAt).toLocaleString('es-PE')}
                  </p>
                </div>
                {batch.status === 'previewed' ? (
                  <Button
                    onClick={() => void confirm()}
                    disabled={!canExecute || loading || batch.validRows === 0}
                  >
                    {loading ? 'Confirmando…' : 'Confirmar lote'}
                  </Button>
                ) : null}
              </div>
              <BatchRowsTable batch={batch} />
              <div className="border-t bg-blue-50 px-5 py-3 text-xs leading-relaxed text-blue-950">
                Ningún SKU fue creado ni activado. Las filas inválidas permanecen en el resultado
                para su corrección.
              </div>
            </Card>
          </div>
        ) : (
          <StatePanel
            variant="error"
            title="Resultado no disponible"
            description={error ?? 'No se encontró el lote solicitado.'}
            actionLabel="Volver al historial"
            onAction={() => navigate('history')}
          />
        )
      ) : null}
    </>
  );
}
