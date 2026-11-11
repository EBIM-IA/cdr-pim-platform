'use client';
import type { UnifiedCodeRequestDto } from '@cdr/contracts';
import { useCallback, useEffect, useState } from 'react';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/status-badge';
import {
  createUnifiedCodeRequest,
  listUnifiedCodeRequests,
  updateUnifiedCodeRequest,
} from '@/lib/unified-code-requests-api';
const actions = {
  remove: 'Retirar del grupo',
  move: 'Mover a otro código unificador',
  correct: 'Corregir el código unificador',
};
export function UnifiedCodeRequestsDrawer({
  products,
  initialSku = '',
  onClose,
}: {
  products: readonly { sku: string; unifiedCode: string | null }[];
  initialSku?: string;
  onClose: () => void;
}) {
  const [requests, setRequests] = useState<UnifiedCodeRequestDto[]>([]);
  const [editing, setEditing] = useState<UnifiedCodeRequestDto | null>(null);
  const [sku, setSku] = useState(initialSku || products[0]?.sku || '');
  const [action, setAction] = useState<UnifiedCodeRequestDto['action']>('correct');
  const [proposedCode, setProposedCode] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setRequests(await listUnifiedCodeRequests());
  }, []);
  useEffect(() => {
    void load().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : 'No se pudo cargar la cola'),
    );
  }, [load]);
  const currentCode = editing
    ? editing.currentCode
    : (products.find((product) => product.sku === sku)?.unifiedCode ?? null);
  return (
    <WorkspaceDrawer
      title="Solicitudes de código unificador"
      busy={saving}
      unsavedChanges={Boolean(reason || proposedCode)}
      onClose={onClose}
    >
      <div className="space-y-5">
        <p className="rounded border bg-amber-50 p-3 text-sm">
          La solicitud queda <strong>Por enviar a AX</strong>. El PIM conserva el grupo y los
          valores actuales del SKU. El envío y la aplicación del cambio requieren el contrato de
          integración con AX.
        </p>
        {error ? (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
            {notice}
          </p>
        ) : null}
        <form
          className="space-y-4 rounded border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            setNotice(null);
            try {
              const fields = {
                action,
                proposedCode: action === 'remove' ? null : proposedCode.trim() || null,
                reason: reason.trim(),
              };
              if (editing)
                await updateUnifiedCodeRequest(editing.id, {
                  ...fields,
                  expectedVersion: editing.version,
                });
              else await createUnifiedCodeRequest({ ...fields, sku, currentCode });
              setNotice('Solicitud registrada y auditada: Por enviar a AX.');
              setEditing(null);
              setReason('');
              setProposedCode('');
              await load();
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : 'No se pudo guardar la solicitud',
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <h3 className="font-semibold">
            {editing ? 'Editar solicitud pendiente' : 'Registrar solicitud'}
          </h3>
          <fieldset
            disabled={saving}
            className="space-y-3 [&_select]:h-11 [&_select]:rounded-md [&_select]:border [&_select]:bg-white [&_select]:px-3"
          >
            <label className="grid gap-1.5 text-sm">
              SKU afectado
              <select
                required
                disabled={Boolean(editing)}
                value={sku}
                onChange={(event) => setSku(event.target.value)}
              >
                {products.map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.sku} · {product.unifiedCode ?? 'Sin unificador'}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Código actual: {currentCode ?? 'Sin código unificador'}
            </p>
            <label className="grid gap-1.5 text-sm">
              Cambio solicitado
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as typeof action)}
              >
                {Object.entries(actions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {action !== 'remove' ? (
              <label className="grid gap-1.5 text-sm">
                Código unificador propuesto
                <Input
                  required
                  maxLength={100}
                  value={proposedCode}
                  onChange={(event) => setProposedCode(event.target.value)}
                />
              </label>
            ) : null}
            <label className="grid gap-1.5 text-sm">
              Motivo
              <textarea
                required
                maxLength={4000}
                className="min-h-24 rounded border p-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </fieldset>
          <div className="flex justify-end gap-2">
            {editing ? (
              <Button
                variant="outline"
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setReason('');
                  setProposedCode('');
                }}
              >
                Cancelar edición
              </Button>
            ) : null}
            <Button disabled={saving || !sku} type="submit">
              {saving ? 'Guardando…' : editing ? 'Guardar solicitud' : 'Registrar solicitud'}
            </Button>
          </div>
        </form>
        <section>
          <h3 className="mb-2 font-semibold">Cola local · últimas 200 solicitudes</h3>
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{request.sku}</strong>
                  <StatusBadge tone="warning">Por enviar a AX</StatusBadge>
                </div>
                <p className="mt-2">
                  {actions[request.action]} · {request.currentCode ?? 'Sin código'}
                  {request.proposedCode ? ` → ${request.proposedCode}` : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {request.reason}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(request.updatedAt).toLocaleString('es-PE')} · v{request.version}
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditing(request);
                    setSku(request.sku);
                    setAction(request.action);
                    setProposedCode(request.proposedCode ?? '');
                    setReason(request.reason);
                    setError(null);
                  }}
                >
                  Editar solicitud
                </Button>
              </li>
            ))}
          </ul>
          {!requests.length ? (
            <p className="text-sm text-muted-foreground">Sin solicitudes registradas.</p>
          ) : null}
        </section>
      </div>
    </WorkspaceDrawer>
  );
}
