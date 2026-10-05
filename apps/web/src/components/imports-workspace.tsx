'use client';

import {
  previewImportSchema,
  type ImportBatchDto,
  type ImportFormat,
  type ImportTarget,
} from '@cdr/contracts';
import { CheckCircle2, FileUp, RefreshCw, ShieldAlert } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { confirmImport, previewImport } from '@/lib/operational-api';

const csvExamples: Record<ImportTarget, string> = {
  category: 'sku,diametro_interior,material\n6202-2RSR-L038-C3,15,acero',
  applications:
    'unifiedCode,vehicleType,make,model,yearFrom,yearTo,engine\nD1672,Automóvil,Toyota,Hilux,2016,2024,2.8',
  homologs:
    'unifiedCode,externalCode,externalBrand,approvalStatus,active\nD1672,OEM-123,BOSCH,approved,true',
};

function newKey(target: ImportTarget): string {
  return `${target}-${crypto.randomUUID()}`;
}

export function ImportsWorkspace({ canExecute }: { canExecute: boolean }) {
  const [target, setTarget] = useState<ImportTarget>('applications');
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [categoryCode, setCategoryCode] = useState('');
  const [payload, setPayload] = useState(csvExamples.applications);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newKey('applications'));
  const [batch, setBatch] = useState<ImportBatchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    batch?.rows.forEach((row) => Object.keys(row.data).forEach((key) => keys.add(key)));
    return [...keys].slice(0, 10);
  }, [batch]);

  const changeTarget = (value: ImportTarget) => {
    setTarget(value);
    setPayload(format === 'csv' ? csvExamples[value] : '[]');
    setIdempotencyKey(newKey(value));
    setBatch(null);
  };

  const changeFormat = (value: ImportFormat) => {
    setFormat(value);
    setPayload(value === 'csv' ? csvExamples[target] : '[]');
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
    setPayload(await file.text());
    setFormat(file.name.toLocaleLowerCase().endsWith('.json') ? 'json' : 'csv');
    setIdempotencyKey(newKey(target));
    setBatch(null);
  };

  const runPreview = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    let records: unknown;
    if (format === 'json') {
      try {
        records = JSON.parse(payload);
      } catch {
        setError('El contenido JSON no tiene una sintaxis válida.');
        return;
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
      return;
    }
    setLoading(true);
    try {
      setBatch(await previewImport(parsed.data));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible validar la carga.',
      );
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!batch) return;
    setLoading(true);
    setError(null);
    try {
      setBatch(await confirmImport(batch.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No fue posible confirmar el lote.',
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPayload(format === 'csv' ? csvExamples[target] : '[]');
    setIdempotencyKey(newKey(target));
    setBatch(null);
    setError(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Ingreso de información"
        title="Importaciones"
        description="Valida lotes CSV o JSON, revisa errores por fila y confirma solamente cargas limpias."
        actions={
          <Button variant="outline" onClick={reset}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Nueva carga
          </Button>
        }
      />
      <ScreenGuide
        objective="Ofrece un flujo controlado de vista previa y confirmación para atributos por categoría, aplicaciones y homólogos."
        actions={[
          'Selecciona el destino y carga un CSV o JSON de hasta 2 MB.',
          'Revisa la validez y los errores informados para cada fila.',
          'Confirma el lote únicamente cuando todas las filas sean válidas.',
        ]}
        dataSource="La validación, idempotencia, almacenamiento del lote y confirmación se ejecutan en el backend."
        limitation="La confirmación consolida el lote validado; el procesamiento asíncrono posterior depende del worker configurado."
      />

      {!canExecute ? (
        <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-amber-950">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Acceso de solo lectura</h2>
            <p className="text-sm">
              Tu rol no cuenta con la capacidad para ejecutar importaciones.
            </p>
          </div>
        </Card>
      ) : null}
      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Card className="mb-5 p-5">
        <form onSubmit={runPreview}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select
              label="Destino"
              value={target}
              disabled={!canExecute}
              onChange={(e) => changeTarget(e.target.value as ImportTarget)}
            >
              <option value="category">Atributos por categoría</option>
              <option value="applications">Aplicaciones</option>
              <option value="homologs">Homólogos</option>
            </Select>
            <Select
              label="Formato"
              value={format}
              disabled={!canExecute}
              onChange={(e) => changeFormat(e.target.value as ImportFormat)}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </Select>
            {target === 'category' ? (
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                Código de categoría
                <Input
                  required
                  value={categoryCode}
                  disabled={!canExecute}
                  onChange={(e) => setCategoryCode(e.target.value)}
                />
              </label>
            ) : null}
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Archivo CSV o JSON
              <span className="relative flex h-11 items-center rounded-md border bg-white px-3">
                <FileUp aria-hidden="true" className="mr-2 size-4" />
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  disabled={!canExecute}
                  onChange={(e) => void loadFile(e)}
                  className="min-w-0 text-xs"
                />
              </span>
            </label>
          </div>
          <label className="mt-4 grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Contenido a validar
            <textarea
              className="min-h-52 w-full rounded-md border bg-white p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-cdr-ink"
              value={payload}
              disabled={!canExecute}
              onChange={(e) => {
                setPayload(e.target.value);
                setBatch(null);
              }}
              spellCheck={false}
            />
          </label>
          <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-muted-foreground">
              Clave de idempotencia
              <Input
                value={idempotencyKey}
                disabled={!canExecute}
                onChange={(e) => setIdempotencyKey(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={!canExecute || loading || !payload.trim()}>
              <FileUp aria-hidden="true" className="size-4" />
              {loading ? 'Validando…' : 'Generar vista previa'}
            </Button>
          </div>
        </form>
      </Card>

      {batch ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Resultado del lote</h2>
                <StatusBadge
                  tone={
                    batch.status === 'confirmed'
                      ? 'success'
                      : batch.invalidRows > 0
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {batch.status === 'confirmed' ? 'Confirmado' : 'Vista previa'}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Lote {batch.id} · {batch.totalRows} filas
              </p>
            </div>
            {batch.status === 'previewed' ? (
              <Button onClick={() => void confirm()} disabled={loading || batch.invalidRows > 0}>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                {loading ? 'Confirmando…' : 'Confirmar carga'}
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted-foreground">Total</span>
              <strong className="block text-2xl">{batch.totalRows}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Válidas</span>
              <strong className="block text-2xl text-emerald-700">{batch.validRows}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Con errores</span>
              <strong className="block text-2xl text-red-700">{batch.invalidRows}</strong>
            </div>
          </div>
          {batch.rows.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">El archivo no contiene filas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Fila</th>
                    <th className="px-4 py-3">Estado</th>
                    {columns.map((column) => (
                      <th key={column} className="px-4 py-3">
                        {column}
                      </th>
                    ))}
                    <th className="px-4 py-3">Errores</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.valid ? '' : 'bg-red-50/50'}>
                      <td className="px-4 py-3 font-semibold">{row.rowNumber}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={row.valid ? 'success' : 'danger'}>
                          {row.valid ? 'Válida' : 'Error'}
                        </StatusBadge>
                      </td>
                      {columns.map((column) => (
                        <td key={column} className="max-w-48 truncate px-4 py-3">
                          {String(row.data[column] ?? '—')}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-xs text-red-700">
                        {row.errors.join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
