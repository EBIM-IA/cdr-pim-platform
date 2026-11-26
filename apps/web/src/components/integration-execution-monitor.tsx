'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { IntegrationExecutionMonitorDto } from '@cdr/contracts';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { WorkspaceDrawer } from './workspace-drawer';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { downloadCsv } from '@/lib/tabular-export';
const labels: Record<string, string> = {
  received: 'Recibido',
  previewed: 'Vista previa',
  queued: 'En cola',
  processing: 'Procesando',
  confirmed: 'Confirmado',
  completed: 'Terminado',
  failed: 'Fallido',
};
export function IntegrationExecutionMonitor({
  data,
  axBatchIds = {},
}: {
  data: IntegrationExecutionMonitorDto;
  axBatchIds?: Readonly<Record<string, string>>;
}) {
  const [selected, setSelected] = useState<
    IntegrationExecutionMonitorDto['executions'][number] | null
  >(null);
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState('');
  const [status, setStatus] = useState('');
  const rows = data.executions.filter(
    (row) =>
      (!system || row.system === system) &&
      (!status || row.status === status) &&
      (!query.trim() ||
        [row.id, axBatchIds[row.id], row.operation, row.actor, row.correlationId, row.error]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(query.trim().toLocaleLowerCase('es'))),
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          ['Lotes AX recibidos', data.summary.axBatches],
          ['Registros AX recibidos', data.summary.axRecords],
          ['Importaciones en curso', data.summary.importsProcessing],
          ['Importaciones fallidas', data.summary.importsFailed],
          ['Filas importadas confirmadas', data.summary.importRowsApplied],
        ].map(([label, count]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <strong className="text-2xl">{count}</strong>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Ejecuciones observadas</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Recepciones AX e importaciones persistidas. Recibido indica que el lote quedó guardado.
            Aplicar los lotes AX al catálogo requiere el mapeo y las reglas aprobadas.
          </p>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
            <label className="grid gap-1 text-xs font-semibold">
              Buscar integración o lote
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Lote, operación, actor o correlación…"
              />
            </label>
            <Select
              label="Integración"
              value={system}
              onChange={(event) => setSystem(event.target.value)}
            >
              <option value="">Todas</option>
              <option value="ax">Sismetic / AX</option>
              <option value="import">Importaciones</option>
            </Select>
            <Select
              label="Estado de ejecución"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  {
                    headers: [
                      'Sistema',
                      'Lote',
                      'Operación',
                      'Inicio',
                      'Estado',
                      'Recibidos',
                      'Aplicados',
                      'Errores',
                      'Duración ms',
                      'Actor / origen',
                      'Correlación',
                      'Resultado',
                    ],
                    rows: rows.map((row) => [
                      row.system === 'ax' ? 'Sismetic / AX' : 'Importación',
                      axBatchIds[row.id] ?? row.id,
                      row.operation,
                      row.startedAt,
                      labels[row.status],
                      row.records,
                      row.succeededRecords,
                      row.failedRecords,
                      row.durationMs,
                      row.actor,
                      row.correlationId,
                      row.error,
                    ]),
                  },
                  'ejecuciones-visibles',
                )
              }
            >
              Exportar ejecuciones visibles (CSV)
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                {['Operación', 'Inicio', 'Estado', 'Registros', 'Duración', 'Detalle'].map(
                  (label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.system}:${row.id}`} className="border-t">
                  <td className="p-3">
                    {row.operation}
                    <small className="mt-1 block text-muted-foreground">
                      {axBatchIds[row.id] ?? row.id}
                    </small>
                  </td>
                  <td className="p-3">{new Date(row.startedAt).toLocaleString('es-PE')}</td>
                  <td className="p-3">{labels[row.status]}</td>
                  <td className="p-3">{row.records}</td>
                  <td className="p-3">
                    {row.durationMs === null
                      ? 'Sin medición'
                      : `${(row.durationMs / 1000).toFixed(1)} s`}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                      Ver ejecución
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {data.executions.length
                      ? 'No hay ejecuciones que coincidan con los filtros.'
                      : 'Todavía no hay ejecuciones registradas.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="border-t p-3 text-xs text-muted-foreground">
          {rows.length} de {data.executions.length} ejecuciones cargadas · últimas 50 ejecuciones
          observadas. El CSV conserva los filtros de esta tabla.
        </p>
      </Card>
      {selected ? (
        <WorkspaceDrawer title="Detalle de ejecución" onClose={() => setSelected(null)}>
          <dl className="space-y-3 text-sm">
            {[
              ['Identificador', selected.id],
              ['Lote', axBatchIds[selected.id] ?? selected.id],
              ['Operación', selected.operation],
              ['Estado', labels[selected.status]],
              ['Actor / origen', selected.actor ?? 'No registrado'],
              ['Correlación', selected.correlationId ?? 'No registrada'],
              ['Registros recibidos', selected.records],
              ['Registros aplicados', selected.succeededRecords ?? 'Sin procesamiento habilitado'],
              ['Errores de validación', selected.failedRecords ?? 'No evaluados'],
              ['Resultado', selected.error ?? 'Sin error de ejecución registrado'],
              ['Inicio', new Date(selected.startedAt).toLocaleString('es-PE')],
              [
                'Fin',
                selected.finishedAt
                  ? new Date(selected.finishedAt).toLocaleString('es-PE')
                  : 'Sin finalizar',
              ],
              [
                'Duración',
                selected.durationMs === null ? 'Sin medición' : `${selected.durationMs} ms`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <Button className="mt-5" size="sm" asChild>
            <Link
              href={
                selected.system === 'import'
                  ? `/imports?view=result&batch=${selected.id}`
                  : axBatchIds[selected.id]
                    ? `/integrations?view=batches&axBatchId=${encodeURIComponent(axBatchIds[selected.id] ?? '')}`
                    : '/integrations?view=batches'
              }
            >
              Abrir lote
            </Link>
          </Button>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
