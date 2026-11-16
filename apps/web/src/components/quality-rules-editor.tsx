'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AdminTemplateDto } from '@cdr/contracts';
import { getAdminTemplate, updateAdminTemplateAttribute } from '@/lib/catalog-admin-api';
export function QualityRulesEditor({
  templateId,
  onSaved,
}: {
  templateId: string;
  onSaved?: () => void;
}) {
  const [template, setTemplate] = useState<AdminTemplateDto | null>(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    void getAdminTemplate(templateId)
      .then((value) => {
        if (active) setTemplate(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las reglas.');
      });
    return () => {
      active = false;
    };
  }, [templateId, revision]);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold">
        Reglas persistidas · {template?.name ?? 'Consultando…'}
      </p>
      <p className="text-xs text-muted-foreground">
        La obligatoriedad se configura en la plantilla y afecta la completitud de sus SKU. Cada
        cambio queda auditado.
      </p>
      {template?.attributes?.map((attribute) => (
        <label key={attribute.id} className="flex items-center justify-between gap-2 text-xs">
          {attribute.label}
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={busy || !attribute.active}
              checked={attribute.required}
              onChange={async (event) => {
                setBusy(true);
                setError('');
                try {
                  await updateAdminTemplateAttribute(templateId, attribute.id, {
                    expectedUpdatedAt: attribute.updatedAt,
                    required: event.target.checked,
                  });
                  setTemplate(await getAdminTemplate(templateId));
                  setNotice('Regla guardada; completitud actualizada.');
                  onSaved?.();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'No se pudo guardar la regla.');
                } finally {
                  setBusy(false);
                }
              }}
            />
            Obligatorio
          </span>
        </label>
      ))}
      {notice && (
        <p role="status" className="text-xs text-emerald-800">
          {notice}
        </p>
      )}
      {error ? (
        <div role="alert" className="text-xs text-red-700">
          {error}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 block"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar reglas
          </Button>
        </div>
      ) : null}
    </div>
  );
}
