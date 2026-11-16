'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  GitCompareArrows,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { QualityReviewDto, QualityDecisionInput } from '@cdr/contracts';
import { ProductChangesReviewProjection } from '@/components/product-changes-review-projection';
import { QualityDuplicateComparison } from '@/components/quality-duplicate-comparison';
import { QualityConflictForm } from '@/components/quality-conflict-form';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import {
  decideQualityReview,
  detectQualityDuplicates,
  listQualityReviews,
  getQualityReview,
} from '@/lib/quality-governance-api';
const states = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  changes_requested: 'Con ajuste',
} as const;
const kinds = {
  attribute: 'Atributo / fuentes',
  commercial: 'Contenido comercial',
  duplicate: 'Posible duplicado',
} as const;
const valueLabel = (value: unknown) =>
  value === null || value === undefined ? 'Sin valor' : String(value);
export function QualityGovernanceWorkspace({
  mode = 'review',
}: {
  mode?: 'review' | 'duplicates' | 'conflict';
}) {
  const [creatingConflict, setCreatingConflict] = useState(false);
  const [items, setItems] = useState<QualityReviewDto[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<QualityReviewDto['status'], number>>>({});
  const [productId, setProductId] = useState('');
  useEffect(() => {
    setProductId(new URLSearchParams(window.location.search).get('productId') ?? '');
  }, []);
  const [status, setStatus] = useState<QualityReviewDto['status'] | ''>('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QualityReviewDto | null>(null);
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState('');
  const [override, setOverride] = useState(false);
  const [humanValue, setHumanValue] = useState('');
  const [duplicateDecision, setDuplicateDecision] = useState<
    'equivalent' | 'distinct' | 'escalate'
  >('distinct');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const scope = {
          ...(mode === 'duplicates'
            ? { kind: 'duplicate' as const }
            : mode === 'conflict'
              ? { kind: 'attribute' as const, conflictsOnly: true }
              : {}),
          ...(productId ? { productId } : {}),
        };
        const countsRequest = Promise.allSettled(
          (Object.keys(states) as QualityReviewDto['status'][]).map(async (state) => ({
            state,
            total: (
              await listQualityReviews({ ...scope, status: state, page: 1, pageSize: 1 }, signal)
            ).total,
          })),
        );
        const result = await listQualityReviews(
          {
            ...(mode === 'duplicates'
              ? { kind: 'duplicate' }
              : mode === 'conflict'
                ? { kind: 'attribute', conflictsOnly: true }
                : {}),
            ...(status ? { status } : {}),
            ...(productId ? { productId } : {}),
            page,
            pageSize: 25,
          },
          signal,
        );
        if (!signal?.aborted) {
          setItems(result.items);
          setTotal(result.total);
        }
        const summaries = await countsRequest;
        if (!signal?.aborted)
          setCounts(
            Object.fromEntries(
              summaries
                .filter((entry) => entry.status === 'fulfilled')
                .map((entry) => [entry.value.state, entry.value.total]),
            ),
          );
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar la bandeja.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mode, status, page, productId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const open = useCallback((item: QualityReviewDto) => {
    setSelected(item);
    setReason(item.reason ?? '');
    const selectedIndex = item.status === 'pending' ? item.proposedIndex : item.chosenIndex;
    setChoice(selectedIndex === null ? '' : String(selectedIndex));
    setOverride(item.override);
    setHumanValue(
      valueLabel(
        item.status !== 'pending'
          ? item.chosenValue
          : item.kind === 'commercial'
            ? item.candidates[item.proposedIndex ?? 0]?.value
            : item.currentValue,
      ),
    );
    setError(null);
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('reviewId');
    if (!id) return;
    const controller = new AbortController();
    void getQualityReview(id, controller.signal)
      .then((item) => {
        if (!controller.signal.aborted) open(item);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No se pudo cargar la revisión solicitada.',
          );
      });
    return () => controller.abort();
  }, [open]);
  const decide = async (action: QualityDecisionInput['action']) => {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await decideQualityReview(selected.id, {
        version: selected.version,
        action,
        reason: reason.trim(),
        ...(choice === '' ? {} : { chosenIndex: Number(choice) }),
        ...(override
          ? {
              value:
                typeof selected.currentValue === 'number'
                  ? Number(humanValue)
                  : typeof selected.currentValue === 'boolean'
                    ? humanValue === 'true'
                    : humanValue,
            }
          : {}),
        ...(selected.kind === 'duplicate' ? { duplicateDecision } : {}),
      });
      setSelected(null);
      setNotice('Decisión guardada con motivo y trazabilidad.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la decisión.');
    } finally {
      setBusy(false);
    }
  };
  const detect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await detectQualityDuplicates();
      setNotice(
        `${result.created} alertas nuevas; ${result.scanned} pares con un identificador común. Los SKU conservan su identidad.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo ejecutar la detección.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      {mode === 'duplicates' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Alertas abiertas', counts.pending ?? '…', 'Requieren decisión humana'],
            [
              'Decisiones registradas',
              counts.approved !== undefined &&
              counts.rejected !== undefined &&
              counts.changes_requested !== undefined
                ? counts.approved + counts.rejected + counts.changes_requested
                : '…',
              'Con motivo y trazabilidad',
            ],
            [
              'Alertas consultadas',
              Object.keys(counts).length === Object.keys(states).length
                ? Object.values(counts).reduce((sum, count) => sum + count, 0)
                : '…',
              'Todos los estados del filtro',
            ],
            ['Fusiones automáticas', 0, 'El PIM nunca fusiona SKU'],
          ].map(([label, count, note]) => (
            <Card key={label} className="p-3">
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-2xl text-cdr-ink">{count}</strong>
              <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-3">
            <small className="text-muted-foreground">Solicitudes en esta vista</small>
            <strong className="mt-1 block text-2xl text-cdr-ink">{loading ? '…' : total}</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              {status ? states[status] : 'Todos los estados'}
            </p>
          </Card>
          <Card className="p-3">
            <ListChecks className="size-5 text-primary" />
            <strong className="mt-1 block text-sm">Revisión humana</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada decisión conserva candidatos, evidencia, autor y motivo.
            </p>
          </Card>
          <Card className="p-3">
            <ShieldAlert className="size-5 text-amber-600" />
            <strong className="mt-1 block text-sm">Identidad ERP protegida</strong>
            <p className="mt-1 text-xs text-muted-foreground">
              La detección nunca fusiona SKU. Los datos base ERP no se sobrescriben.
            </p>
          </Card>
        </div>
      )}
      {productId && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          Solicitudes del SKU seleccionado
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setProductId('');
              setPage(1);
            }}
          >
            Ver todos los SKU
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Estados de revisión">
        {Object.entries(states).map(([state, label]) => (
          <Button
            key={state}
            size="sm"
            variant={status === state ? 'default' : 'outline'}
            aria-pressed={status === state}
            onClick={() => {
              setStatus(state as QualityReviewDto['status']);
              setPage(1);
            }}
          >
            {label} · {counts[state as QualityReviewDto['status']] ?? '—'}
          </Button>
        ))}
        <Button
          size="sm"
          variant={status === '' ? 'default' : 'outline'}
          aria-pressed={status === ''}
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
        >
          Todas ·{' '}
          {Object.keys(counts).length === Object.keys(states).length
            ? Object.values(counts).reduce((sum, count) => sum + count, 0)
            : '—'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'conflict' && (
          <Button size="sm" onClick={() => setCreatingConflict(true)}>
            Registrar candidatos de fuentes
          </Button>
        )}
        <label className="text-xs font-medium">
          Estado{' '}
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            className="ml-2 rounded-md border bg-white p-2"
          >
            <option value="">Todos</option>
            {Object.entries(states).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
        {mode === 'duplicates' && (
          <Button size="sm" onClick={() => void detect()} disabled={busy}>
            <GitCompareArrows className="size-4" />
            Detectar posibles duplicados
          </Button>
        )}
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="font-semibold text-cdr-ink">
            {mode === 'duplicates'
              ? 'Alertas para revisión humana'
              : mode === 'conflict'
                ? 'Candidatos por fuente'
                : 'Solicitudes'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === 'duplicates'
              ? 'Coincidencias exactas de identificadores entre SKU diferentes. Una alerta no confirma que sean duplicados.'
              : 'Solicitudes guardadas de extracción documental, contenido comercial y fuentes.'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b bg-slate-50 text-muted-foreground">
              <tr>
                {[
                  'SKU',
                  'Tipo / atributo',
                  'Propuesta o evidencia',
                  'Solicitante',
                  'Estado',
                  'Acción',
                ].map((label) => (
                  <th key={label} className="p-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="p-4 font-semibold">
                    <Link className="text-primary underline" href={`/products/${item.productId}`}>
                      {item.sku}
                    </Link>
                    {item.productB && (
                      <span className="mt-1 block text-muted-foreground">
                        vs {item.productB.sku}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {kinds[item.kind]}
                    <small className="mt-1 block text-muted-foreground">
                      {item.attributeKey ?? item.channel?.toUpperCase()}
                    </small>
                  </td>
                  <td className="max-w-72 p-4">
                    <span className="line-clamp-2">
                      {item.kind === 'duplicate'
                        ? item.candidates[0]?.evidence
                        : valueLabel(item.candidates[item.proposedIndex ?? 0]?.value)}
                    </span>
                    {item.override && <StatusBadge tone="warning">Override humano</StatusBadge>}
                  </td>
                  <td className="p-4">
                    {item.requestedBy}
                    <small className="mt-1 block text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('es-PE')}
                    </small>
                  </td>
                  <td className="p-4">
                    <StatusBadge
                      tone={
                        item.status === 'approved'
                          ? 'success'
                          : item.status === 'pending'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {states[item.status]}
                    </StatusBadge>
                  </td>
                  <td className="p-4">
                    <Button variant="outline" size="sm" onClick={() => open(item)}>
                      {item.kind === 'duplicate' ? 'Comparar' : 'Revisar'}
                    </Button>
                  </td>
                </tr>
              ))}
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center">
                    <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                    Cargando solicitudes…
                  </td>
                </tr>
              ) : (
                items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                      No hay solicitudes para los filtros seleccionados.
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
          <span>
            {total} solicitudes · página {page}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 25 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </Card>
      {mode === 'review' && <ProductChangesReviewProjection />}
      {creatingConflict && (
        <QualityConflictForm
          onClose={() => setCreatingConflict(false)}
          onCreated={() => void load()}
        />
      )}
      {selected && (
        <WorkspaceDrawer
          title={`${selected.kind === 'duplicate' ? 'Comparación de SKU' : 'Revisión individual'} · ${selected.sku}`}
          onClose={() => setSelected(null)}
          busy={busy}
          unsavedChanges={!!reason && selected.status === 'pending'}
        >
          <div className="space-y-5">
            <div className="rounded-lg border bg-slate-50 p-4 text-xs">
              <p>Solicitante: {selected.requestedBy}</p>
              <p className="mt-1">Creada: {new Date(selected.createdAt).toLocaleString('es-PE')}</p>
              <p className="mt-1">
                Estado: {states[selected.status]} · versión {selected.version}
              </p>
              {selected.model && <p className="mt-1">Modelo: {selected.model}</p>}
              <Link
                className="mt-3 block text-primary underline"
                href={
                  selected.assetId
                    ? `/quality?view=extraction&productId=${selected.productId}&assetId=${selected.assetId}`
                    : selected.kind === 'commercial'
                      ? `/quality?view=commercial&productId=${selected.productId}`
                      : `/products/${selected.productId}`
                }
              >
                Abrir registro de origen
              </Link>
              {selected.status !== 'pending' && (
                <p className="mt-3 font-semibold">
                  Valor elegido: {valueLabel(selected.chosenValue)}
                  {selected.override ? ' · Override humano' : ''}
                </p>
              )}
            </div>
            {selected.productB ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: selected.productId,
                    sku: selected.sku,
                    name: valueLabel(selected.currentValue),
                    brand: null,
                  },
                  selected.productB,
                ].map((product) => (
                  <Card key={product.id} className="p-4">
                    <strong className="text-sm">{product.sku}</strong>
                    <p className="mt-2 text-xs">{product.name}</p>
                    {product.brand && <p className="mt-1 text-xs">{product.brand}</p>}
                    <Link
                      href={`/products/${product.id}`}
                      className="mt-3 block text-xs text-primary underline"
                    >
                      Abrir ficha y atributos
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <div>
                <h4 className="text-sm font-semibold">
                  {selected.attributeKey ??
                    `Contenido comercial ${selected.channel?.toUpperCase()}`}
                </h4>
                <p className="mt-2 rounded-lg border p-3 text-sm">
                  Valor anterior: {valueLabel(selected.currentValue)}
                </p>
              </div>
            )}
            {selected.productB && (
              <QualityDuplicateComparison
                productA={selected.productId}
                productB={selected.productB.id}
              />
            )}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Candidatos y evidencia conservados</h4>
              {selected.candidates.map((candidate, index) => (
                <label
                  key={index}
                  className={`block rounded-lg border p-4 text-sm ${choice === String(index) ? 'border-primary bg-blue-50' : ''}`}
                >
                  <div className="flex gap-2">
                    {selected.kind !== 'duplicate' && (
                      <input
                        type="radio"
                        name="candidate"
                        value={index}
                        checked={choice === String(index)}
                        onChange={() => setChoice(String(index))}
                        disabled={selected.status !== 'pending'}
                      />
                    )}
                    <strong>
                      {candidate.source}
                      {index === selected.proposedIndex ? ' · Propuesta' : ''}
                    </strong>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    {valueLabel(candidate.value)}
                  </p>
                  <small className="mt-2 block text-muted-foreground">
                    {candidate.evidence}
                    {candidate.confidence === null
                      ? ''
                      : ` · confianza ${Math.round(candidate.confidence * 100)} %`}
                  </small>
                </label>
              ))}
            </div>
            {selected.kind === 'duplicate' && selected.status === 'pending' && (
              <label className="block text-sm font-medium">
                Decisión humana
                <select
                  value={duplicateDecision}
                  onChange={(event) =>
                    setDuplicateDecision(event.target.value as typeof duplicateDecision)
                  }
                  className="mt-2 w-full rounded-md border p-2"
                >
                  <option value="distinct">No es duplicado · descartar alerta</option>
                  <option value="equivalent">Equivalentes · mantener SKU separados</option>
                  <option value="escalate">Posible duplicado real · escalar a ERP</option>
                </select>
              </label>
            )}
            {selected.kind !== 'duplicate' && selected.status === 'pending' && (
              <div>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(event) => setOverride(event.target.checked)}
                  />
                  Registrar un valor humano
                </label>
                {override && (
                  <input
                    aria-label="Valor humano"
                    value={humanValue}
                    onChange={(event) => setHumanValue(event.target.value)}
                    className="mt-2 w-full rounded-md border p-2"
                  />
                )}
              </div>
            )}
            {selected.status === 'pending' ? (
              <>
                <label className="block text-sm font-semibold">
                  Motivo obligatorio
                  <textarea
                    aria-label="Motivo de decisión"
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-lg border p-3 text-sm"
                  />
                </label>
                {(override ||
                  (choice !== String(selected.proposedIndex) && selected.kind === 'attribute')) && (
                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    La elección se registrará como override humano con su motivo.
                  </p>
                )}
                {selected.kind === 'commercial' && (
                  <p className="text-xs text-muted-foreground">
                    La aprobación conserva esta versión comercial revisada. La publicación de la
                    descripción e-commerce por variante se gestiona en su ficha.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || !reason.trim()}
                    onClick={() => void decide('reject')}
                  >
                    Rechazar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !reason.trim()}
                    onClick={() => void decide('request_changes')}
                  >
                    Solicitar ajuste
                  </Button>
                  <Button disabled={busy || !reason.trim()} onClick={() => void decide('approve')}>
                    <CheckCircle2 className="size-4" />
                    {selected.kind === 'duplicate' ? 'Guardar decisión' : 'Aprobar'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border p-4 text-sm">
                <strong>Decisión registrada por {selected.decidedBy}</strong>
                <p className="mt-2">{selected.reason}</p>
                {selected.duplicateDecision && <p className="mt-2">{selected.duplicateDecision}</p>}
                {selected.override && <StatusBadge tone="warning">Override humano</StatusBadge>}
              </div>
            )}
          </div>
        </WorkspaceDrawer>
      )}
    </div>
  );
}
