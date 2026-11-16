'use client';
import { useState } from 'react';
import type {
  ProductAttributeSheetDto,
  ProductAssetDto,
  QualitySimulationInput,
} from '@cdr/contracts';
import { simulateQuality } from '@/lib/quality-governance-api';
import { Button } from './ui/button';
export function QualitySimulation({
  sheet,
  assets,
}: {
  sheet: ProductAttributeSheetDto;
  assets: ProductAssetDto[];
}) {
  const [values, setValues] = useState<QualitySimulationInput['values']>({});
  const [types, setTypes] = useState<Set<ProductAssetDto['type']>>(
    new Set(assets.map((asset) => asset.type)),
  );
  const [result, setResult] = useState<Awaited<ReturnType<typeof simulateQuality>> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          setResult(
            await simulateQuality({ productId: sheet.product.id, values, assets: [...types] }),
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'No se pudo simular.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        Prueba valores y archivos hipotéticos. La simulación no guarda datos ni modifica la ficha.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        {sheet.schema.columns
          .filter((attribute) => attribute.permissions.edit && attribute.sourceAuthority !== 'erp')
          .map((attribute) => {
            const value = Object.hasOwn(values, attribute.key)
              ? values[attribute.key]
              : sheet.product.attributes[attribute.key]?.value;
            return (
              <label key={attribute.key} className="block text-xs">
                {attribute.label}
                {attribute.required ? ' *' : ''}
                {attribute.dataType === 'boolean' ? (
                  <select
                    className="mt-1 block w-full rounded border p-2"
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [attribute.key]: event.target.value ? event.target.value === 'true' : null,
                      }))
                    }
                  >
                    <option value="">Sin valor</option>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    className="mt-1 block w-full rounded border p-2"
                    value={value === null || value === undefined ? '' : String(value)}
                    type={
                      ['number', 'measurement'].includes(attribute.dataType)
                        ? 'number'
                        : attribute.dataType === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step="any"
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [attribute.key]: !event.target.value
                          ? null
                          : ['number', 'measurement'].includes(attribute.dataType)
                            ? Number(event.target.value)
                            : event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            );
          })}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-semibold">
            Archivos disponibles en la simulación
          </legend>
          {(sheet.assetRequirements ?? []).map((requirement) => (
            <label key={requirement.type} className="flex gap-2 text-xs">
              <input
                type="checkbox"
                checked={types.has(requirement.type)}
                onChange={(event) =>
                  setTypes((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(requirement.type);
                    else next.delete(requirement.type);
                    return next;
                  })
                }
              />
              {requirement.type}
              {requirement.required ? ' (obligatorio)' : ''}
            </label>
          ))}
        </fieldset>
      </fieldset>
      <Button size="sm" disabled={busy}>
        {busy ? 'Calculando…' : 'Recalcular sin guardar'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="ml-2"
        disabled={busy}
        onClick={() => {
          setValues({});
          setTypes(new Set(assets.map((asset) => asset.type)));
          setResult(null);
          setError('');
        }}
      >
        Restablecer datos
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status" className="rounded bg-blue-50 p-3 text-sm">
          Completitud: {result.before.percentage}% → {result.after.percentage}% (
          {result.after.completed}/{result.after.required}).
          <p className="mt-1 text-xs">
            {result.after.missing.length
              ? `Faltantes: ${result.after.missing.join(', ')}`
              : 'Todos los requisitos de la plantilla están completos en esta simulación.'}
          </p>
        </div>
      ) : null}
    </form>
  );
}
