'use client';
import { useCallback, useEffect, useState } from 'react';
import type { QualityReviewDto } from '@cdr/contracts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { listQualityReviews, decideQualityReview } from '@/lib/quality-governance-api';
export function CommercialReviewHistory({
  productId,
  generatedReviewId,
  editedText,
}: {
  productId: string;
  generatedReviewId?: string;
  editedText?: string | null;
}) {
  const [versions, setVersions] = useState<QualityReviewDto[]>([]);
  const [selected, setSelected] = useState<QualityReviewDto | null>(null);
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const result = await listQualityReviews(
          { productId, kind: 'commercial', page: 1, pageSize: 100 },
          signal,
        );
        if (!signal?.aborted) setVersions(result.items);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No fue posible consultar las versiones.',
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [productId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, generatedReviewId]);
  const open = (version: QualityReviewDto) => {
    setSelected(version);
    setReason(version.reason ?? '');
    setText(
      editedText && version.id === generatedReviewId
        ? editedText
        : String(version.chosenValue ?? version.candidates[0]?.value ?? ''),
    );
    setError(null);
  };
  const decide = async (action: 'approve' | 'reject') => {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await decideQualityReview(selected.id, {
        version: selected.version,
        action,
        reason,
        chosenIndex: 0,
        ...(text !== selected.candidates[0]?.value ? { value: text } : {}),
      });
      setSelected(null);
      setNotice(
        action === 'approve'
          ? 'Versión comercial aprobada y guardada con trazabilidad.'
          : 'Versión rechazada; el texto y su motivo se conservan.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la revisión.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="font-semibold text-cdr-ink">Historial comercial y aprobación</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Propuestas B2C / B2B conservadas por fecha, modelo y decisión. La publicación e-commerce
            por variante se gestiona en la ficha.
          </p>
        </div>
        {notice && (
          <p role="status" className="m-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            {notice}
          </p>
        )}
        {error && !selected && (
          <p role="alert" className="m-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="overflow-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="border-b bg-slate-50">
              <tr>
                {['Fecha / canal', 'Texto comercial', 'Modelo', 'Estado', 'Acción'].map(
                  (heading) => (
                    <th key={heading} className="p-4">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-b last:border-0">
                  <td className="p-4">
                    {new Date(version.createdAt).toLocaleString('es-PE')}
                    <small className="mt-1 block">{version.channel?.toUpperCase()}</small>
                  </td>
                  <td className="max-w-80 p-4">
                    <span className="line-clamp-2">
                      {String(version.chosenValue ?? version.candidates[0]?.value ?? '')}
                    </span>
                  </td>
                  <td className="p-4">{version.model}</td>
                  <td className="p-4">
                    <StatusBadge
                      tone={
                        version.status === 'approved'
                          ? 'success'
                          : version.status === 'pending'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {version.status === 'approved'
                        ? 'Aprobada'
                        : version.status === 'pending'
                          ? 'Pendiente'
                          : version.status === 'rejected'
                            ? 'Rechazada'
                            : 'Con ajuste'}
                    </StatusBadge>
                  </td>
                  <td className="p-4">
                    <Button size="sm" variant="outline" onClick={() => open(version)}>
                      {version.status === 'pending' ? 'Revisar y aprobar' : 'Comparar versión'}
                    </Button>
                  </td>
                </tr>
              ))}
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Consultando versiones…
                  </td>
                </tr>
              ) : (
                versions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Aún no hay propuestas persistidas para este producto.
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {selected && (
        <WorkspaceDrawer
          title={`Versión comercial ${selected.channel?.toUpperCase()} · ${selected.sku}`}
          onClose={() => setSelected(null)}
          busy={busy}
          unsavedChanges={selected.status === 'pending' && !!reason}
        >
          <div className="space-y-5">
            <section>
              <h4 className="text-sm font-semibold">Descripción técnica al generar</h4>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3 text-sm">
                {String(selected.currentValue ?? 'Sin descripción técnica.')}
              </p>
            </section>
            <section>
              <h4 className="text-sm font-semibold">Propuesta original · {selected.model}</h4>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm">
                {String(selected.candidates[0]?.value ?? '')}
              </p>
            </section>
            <label className="block text-sm font-semibold">
              Versión comercial revisada
              <textarea
                aria-label="Versión comercial revisada"
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={selected.status !== 'pending'}
                maxLength={20000}
                className="mt-2 min-h-40 w-full rounded-lg border p-3 text-sm"
              />
            </label>
            {selected.status === 'pending' ? (
              <>
                <label className="block text-sm font-semibold">
                  Motivo
                  <textarea
                    aria-label="Motivo de aprobación comercial"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={2000}
                    className="mt-2 min-h-24 w-full rounded-lg border p-3 text-sm"
                  />
                </label>
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || !reason.trim()}
                    onClick={() => void decide('reject')}
                  >
                    Rechazar versión
                  </Button>
                  <Button
                    disabled={busy || !reason.trim() || !text.trim()}
                    onClick={() => void decide('approve')}
                  >
                    Aprobar contenido comercial
                  </Button>
                </div>
              </>
            ) : (
              <p className="rounded-lg border p-3 text-sm">
                {selected.decidedBy} · {selected.reason}
              </p>
            )}
          </div>
        </WorkspaceDrawer>
      )}
    </>
  );
}
