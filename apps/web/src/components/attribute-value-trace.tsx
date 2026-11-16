'use client';
import { useEffect, useState } from 'react';
import type { AuditChangeDto, QualityReviewDto } from '@cdr/contracts';
import { listQualityReviews } from '@/lib/quality-governance-api';
import { listAuditChanges } from '@/lib/operational-api';
import { Button } from './ui/button';
import { WorkspaceDrawer } from './workspace-drawer';
const sources: Record<string, string> = {
  fabricante: 'Fabricante',
  archivo: 'Archivo',
  tecdoc: 'TecDoc',
  manual: 'Manual',
  ai: 'IA',
};
const display = (value: unknown) =>
  value === null || value === undefined
    ? 'Sin valor'
    : typeof value === 'boolean'
      ? value
        ? 'Sí'
        : 'No'
      : String(value);
export function AttributeValueTrace({
  productId,
  attributeKey,
  label,
}: {
  productId: string;
  attributeKey: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<QualityReviewDto[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [retry, setRetry] = useState(0);
  const [auditBusy, setAuditBusy] = useState(false);
  const [changes, setChanges] = useState<AuditChangeDto[]>([]),
    [auditPage, setAuditPage] = useState(1),
    [auditTotal, setAuditTotal] = useState(0),
    [auditError, setAuditError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    setAuditError('');
    setAuditBusy(true);
    setChanges([]);
    void listAuditChanges({
      resourceType: 'product',
      resourceId: productId,
      field: attributeKey,
      page: auditPage,
      pageSize: 20,
    })
      .then((data) => {
        if (active) {
          setChanges(data.items);
          setAuditTotal(data.total);
        }
      })
      .catch((cause) => {
        if (active)
          setAuditError(
            cause instanceof Error
              ? cause.message
              : 'No se pudo consultar el historial de valores.',
          );
      })
      .finally(() => {
        if (active) setAuditBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open, productId, attributeKey, auditPage, retry]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    void listQualityReviews(
      { productId, attributeKey, kind: 'attribute', page: reviewPage, pageSize: 20 },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items.filter((item) => item.attributeKey === attributeKey));
          setReviewTotal(data.total);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No se pudo consultar la trazabilidad.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [open, productId, attributeKey, reviewPage, retry]);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setAuditPage(1);
          setReviewPage(1);
          setItems([]);
          setChanges([]);
          setOpen(true);
        }}
        aria-label={`Trazabilidad de ${label ?? attributeKey}`}
      >
        Trazabilidad
      </Button>
      {open ? (
        <WorkspaceDrawer
          title={`Trazabilidad · ${label ?? attributeKey}`}
          onClose={() => setOpen(false)}
        >
          <p className="text-xs text-muted-foreground">
            Historial de candidatos y decisiones conservadas. La ficha muestra la fuente y versión
            del valor vigente; una decisión antigua no sustituye ese valor.
          </p>
          <section className="mt-4 border-b pb-4">
            <h3 className="text-sm font-semibold">Historial del valor</h3>
            {auditError ? (
              <div role="alert" className="mt-2 text-xs text-red-700">
                {auditError}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 block"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Reintentar historial
                </Button>
              </div>
            ) : null}
            {changes.map((change) => (
              <article key={change.id} className="mt-3 rounded border p-3 text-xs">
                <strong>
                  {display(change.before)} → {display(change.after)}
                </strong>
                <p className="mt-1">
                  {new Date(change.occurredAt).toLocaleString('es-PE')} ·{' '}
                  {change.actorId ?? 'Sistema'} · {change.source}
                </p>
                {change.reason ? <p className="mt-1">Motivo: {change.reason}</p> : null}
                <p className="mt-1 break-all text-muted-foreground">
                  Correlación: {change.correlationId}
                </p>
              </article>
            ))}
            {auditBusy && (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                Consultando historial…
              </p>
            )}
            {!auditBusy && !changes.length && !auditError ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No hay cambios auditados para este atributo.
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={auditBusy || auditPage === 1}
                onClick={() => setAuditPage((page) => page - 1)}
              >
                Anteriores
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={auditBusy || auditPage * 20 >= auditTotal}
                onClick={() => setAuditPage((page) => page + 1)}
              >
                Siguientes
              </Button>
            </div>
          </section>
          {busy ? (
            <p role="status" className="mt-4 text-sm">
              Consultando decisiones…
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="mt-4 text-sm text-red-700">
              {error}
              <Button
                size="sm"
                variant="outline"
                className="mt-2 block"
                onClick={() => setRetry((value) => value + 1)}
              >
                Reintentar decisiones
              </Button>
            </div>
          ) : null}
          {items.map((item) => (
            <article key={item.id} className="mt-4 rounded border p-3 text-sm">
              <header className="font-semibold">
                {item.status === 'approved'
                  ? 'Aprobado'
                  : item.status === 'rejected'
                    ? 'Rechazado'
                    : item.status === 'changes_requested'
                      ? 'Cambios solicitados'
                      : 'Pendiente'}{' '}
                · {new Date(item.updatedAt).toLocaleString('es-PE')}
              </header>
              <p className="mt-2 text-xs">
                Valor al solicitar: {display(item.currentValue)} · versión {item.attributeVersion}
              </p>
              <div className="mt-3 space-y-2">
                {item.candidates.map((candidate, index) => (
                  <div key={index} className="rounded bg-slate-50 p-2">
                    <strong className="text-xs">
                      {sources[candidate.source] ?? candidate.source}
                      {item.proposedIndex === index ? ' · propuesta por prioridad' : ''}
                      {item.chosenIndex === index ? ' · elegida por revisión' : ''}
                    </strong>
                    <p>{display(candidate.value)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {candidate.evidence}
                    </p>
                    {candidate.confidence !== null ? (
                      <p className="text-xs">
                        Confianza: {Math.round(candidate.confidence * 100)}%
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {item.status !== 'pending' ? (
                <dl className="mt-3 space-y-1 text-xs">
                  <div>Valor decidido: {display(item.chosenValue)}</div>
                  <div>Override humano: {item.override ? 'Sí' : 'No'}</div>
                  <div>Decidido por: {item.decidedBy ?? 'No registrado'}</div>
                  <div>Motivo: {item.reason ?? 'No registrado'}</div>
                </dl>
              ) : null}
            </article>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {reviewTotal} revisiones · página {reviewPage}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || reviewPage === 1}
              onClick={() => setReviewPage((value) => value - 1)}
            >
              Revisiones anteriores
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || reviewPage * 20 >= reviewTotal}
              onClick={() => setReviewPage((value) => value + 1)}
            >
              Revisiones siguientes
            </Button>
          </div>
          {!busy && !error && !items.length ? (
            <p className="mt-4 rounded border border-dashed p-4 text-sm">
              Este atributo todavía no tiene candidatos de fuentes ni decisiones registradas.
            </p>
          ) : null}
        </WorkspaceDrawer>
      ) : null}
    </>
  );
}
