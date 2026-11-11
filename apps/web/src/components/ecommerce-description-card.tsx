'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import type { EcommerceDescriptionDto, ProductSalesVariantDto } from '@cdr/contracts';
import { fetchEcommerceDescription, saveEcommerceDescription } from '@/lib/ecommerce-api';
import { Button } from './ui/button';
import { StatusBadge } from './status-badge';
export function EcommerceDescriptionCard({
  variant,
  canManage,
  onSaved,
  friendlyName,
}: {
  variant: ProductSalesVariantDto;
  canManage: boolean;
  onSaved?: () => void;
  friendlyName?: string;
}) {
  const [value, setValue] = useState<EcommerceDescriptionDto | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState('');
  const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  const applicationId = variant.aplicacion?.id ?? null;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setValue(null);
    setError('');
    setEditing(false);
    setNotice('');
    void fetchEcommerceDescription(
      variant.productId,
      { type: variant.tipo, applicationId },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setValue(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudo consultar la descripción.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [variant.productId, variant.tipo, applicationId, revision]);
  const save = async (action: 'generate' | 'approve' | 'edit') => {
    if (!canManage || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveEcommerceDescription(variant.productId, {
        type: variant.tipo,
        applicationId,
        version: value?.version ?? 0,
        action,
        ...(action === 'edit' ? { text: { titulo: title, descripcion: description } } : {}),
      });
      setValue(saved);
      setEditing(false);
      setNotice(
        action === 'generate'
          ? 'Propuesta guardada para revisión.'
          : 'Descripción aprobada y guardada.',
      );
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el texto.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!canManage && !value && !error && !loading) return null;
  return (
    <section
      aria-label="Descripción para e-commerce"
      className="mb-5 rounded-lg border border-orange-200 bg-orange-50/40 p-4"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles aria-hidden="true" className="size-4 text-primary" />
            Descripción para e-commerce
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {variant.aplicacion
              ? `${variant.aplicacion.marcaVehiculo} ${variant.aplicacion.modelo}`
              : 'Línea industrial'}
          </p>
        </div>
        {value && canManage ? (
          <StatusBadge
            tone={value.stale ? 'danger' : value.status === 'approved' ? 'success' : 'warning'}
          >
            {value.stale
              ? 'Desactualizada'
              : value.status === 'approved'
                ? 'Aprobada'
                : 'Por revisar'}
          </StatusBadge>
        ) : null}
      </header>
      {canManage ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Nombre amigable:{' '}
          <strong className="font-semibold text-foreground">
            {friendlyName ?? variant.nombreAmigable}
          </strong>
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-xs">
          Consultando descripción…
        </p>
      ) : editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save('edit');
          }}
          className="space-y-3"
        >
          <label className="block text-xs font-semibold">
            Título
            <input
              aria-label="Título ecommerce"
              required
              maxLength={140}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded border bg-white p-2 font-normal"
              disabled={busy}
            />
          </label>
          <label className="block text-xs font-semibold">
            Descripción
            <textarea
              aria-label="Descripción ecommerce"
              required
              maxLength={900}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded border bg-white p-2 font-normal"
              disabled={busy}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Guardar y aprobar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : value ? (
        <>
          <h4 className="text-base font-semibold">{value.titulo}</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{value.descripcion}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Todavía no hay una descripción guardada para esta variante.
        </p>
      )}
      {value?.stale ? (
        <p className="mt-3 text-xs text-amber-900">
          Los datos cambiaron. Revisa o regenera el texto antes de aprobarlo.
        </p>
      ) : null}
      {!loading && !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {value ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${value.titulo}\n\n${value.descripcion}`)
                  .then(() => setNotice('Texto copiado.'))
                  .catch(() => setError('No se pudo copiar. Selecciona el texto para copiarlo.'));
              }}
            >
              <Copy aria-hidden="true" className="size-3.5" />
              Copiar texto
            </Button>
          ) : null}
          {canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void save('generate')}
              >
                <Sparkles aria-hidden="true" className="size-3.5" />
                {busy ? 'Procesando…' : value ? 'Otra versión con IA' : 'Generar con IA'}
              </Button>
              {value ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setTitle(value.titulo);
                      setDescription(value.descripcion);
                      setEditing(true);
                    }}
                  >
                    Corregir texto
                  </Button>
                  {value.status !== 'approved' && !value.stale ? (
                    <Button size="sm" disabled={busy} onClick={() => void save('approve')}>
                      Aprobar
                    </Button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {canManage && value ? (
        <p className="mt-3 text-[10px] text-muted-foreground">
          {value.origin === 'ai' ? `Generada con ${value.model}` : 'Editada manualmente'} · versión{' '}
          {value.version}
          {value.approvedBy ? ` · aprobada por ${value.approvedBy}` : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}{' '}
          <button
            type="button"
            className="underline"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Actualizar texto
          </button>
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-xs text-emerald-800">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
