'use client';

import { useEffect, useState } from 'react';
import type { TechnicalSheetVisibilityDto } from '@cdr/contracts';
import {
  getTechnicalSheetVisibility,
  updateTechnicalSheetVisibility,
} from '@/lib/technical-sheet-visibility-api';

export function ProductTechnicalSheetVisibility({ productId }: { productId: string }) {
  const [policy, setPolicy] = useState<TechnicalSheetVisibilityDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setPolicy(null);
    setError(null);
    void getTechnicalSheetVisibility(productId, controller.signal)
      .then(setPolicy)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'No se pudo consultar la visibilidad.',
          );
      });
    return () => controller.abort();
  }, [productId]);
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          role="switch"
          className="mt-1"
          checked={policy?.visible ?? false}
          disabled={!policy || busy}
          onChange={async (event) => {
            if (!policy) return;
            setBusy(true);
            setError(null);
            try {
              setPolicy(
                await updateTechnicalSheetVisibility(
                  productId,
                  event.target.checked,
                  policy.version,
                ),
              );
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : 'No se pudo guardar la visibilidad.',
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>
          Ficha técnica visible para Compras y Ventas
          {policy ? `: ${policy.visible ? 'Sí' : 'No'}` : ' · consultando…'}
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
