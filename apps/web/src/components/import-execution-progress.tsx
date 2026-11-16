'use client';
import { useEffect, useState } from 'react';
import type { ImportBatchDto, ImportExecutionDto } from '@cdr/contracts';
import { getImport, getImportExecution } from '@/lib/operational-api';
import { Button } from './ui/button';
export function ImportExecutionProgress({
  batchId,
  onBatch,
  onExecution,
}: {
  batchId: string;
  onBatch: (batch: ImportBatchDto) => void;
  onExecution: (value: ImportExecutionDto | null) => void;
}) {
  const [value, setValue] = useState<ImportExecutionDto | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const execution = await getImportExecution(batchId, controller.signal);
        if (controller.signal.aborted) return;
        setValue(execution);
        onExecution(execution);
        setError('');
        if (execution) {
          const batch = await getImport(batchId);
          if (controller.signal.aborted) return;
          onBatch(batch);
          if (['queued', 'processing'].includes(execution.status))
            timer = setTimeout(() => void poll(), 1500);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudo consultar el progreso.');
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [batchId, onBatch, onExecution, revision]);
  if (error)
    return (
      <div className="rounded border border-amber-200 p-4 text-sm">
        <p role="alert">{error}</p>
        <Button size="sm" variant="outline" onClick={() => setRevision((value) => value + 1)}>
          Reintentar seguimiento
        </Button>
      </div>
    );
  if (!value) return null;
  const percentage = value.totalRows
    ? Math.round((value.processedRows * 100) / value.totalRows)
    : 0;
  return (
    <div role="status" className="rounded-xl border bg-blue-50 p-4">
      <strong className="text-sm">
        {value.status === 'queued'
          ? 'En cola'
          : value.status === 'processing'
            ? 'Procesando'
            : value.status === 'completed'
              ? 'Procesamiento terminado'
              : 'Procesamiento fallido'}
      </strong>
      <p className="mt-1 text-xs">
        {value.processedRows} de {value.totalRows} filas válidas procesadas · {percentage}%
      </p>
      <progress
        aria-label="Progreso de importación"
        className="mt-2 w-full"
        value={value.processedRows}
        max={Math.max(value.totalRows, 1)}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        El estado y el progreso se conservan si cierras esta pantalla.
      </p>
      {value.error ? <p className="mt-2 text-xs text-red-700">{value.error}</p> : null}
    </div>
  );
}
