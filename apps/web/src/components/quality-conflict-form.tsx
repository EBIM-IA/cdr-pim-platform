'use client';
import { useState } from 'react';
import type { ProductAttributeSheetDto, QualityConflictInput } from '@cdr/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { fetchProducts } from '@/lib/catalog-api';
import { fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
import { createQualityConflict } from '@/lib/quality-governance-api';
import type { Product } from '@/lib/types';
export function QualityConflictForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [key, setKey] = useState('');
  const [candidates, setCandidates] = useState<QualityConflictInput['candidates']>([
    { source: 'fabricante', value: '', evidence: '', confidence: null },
    { source: 'archivo', value: '', evidence: '', confidence: null },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchProducts({ q, page: 1, pageSize: 20 });
      setProducts(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible buscar.');
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchProductAttributeSheet(id);
      setSheet(result);
      setKey(
        result.schema.columns.find(
          (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
        )?.key ?? '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar la plantilla.');
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const definition = sheet.schema.columns.find((column) => column.key === key);
      const typed = candidates.map((candidate) => ({
        ...candidate,
        value:
          definition?.dataType === 'number' || definition?.dataType === 'measurement'
            ? Number(String(candidate.value).replace(',', '.'))
            : definition?.dataType === 'boolean'
              ? String(candidate.value) === 'true'
              : candidate.value,
      }));
      await createQualityConflict({
        productId: sheet.product.id,
        attributeKey: key,
        candidates: typed,
      });
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible registrar los candidatos.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkspaceDrawer
      title="Registrar candidatos de fuentes"
      onClose={onClose}
      busy={busy}
      unsavedChanges={!!sheet}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registra valores y evidencia confirmados para un atributo. La prioridad configurada
          propone un candidato; una persona aprueba el valor con motivo.
        </p>
        <label className="block text-xs font-semibold">
          Buscar SKU
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Código o nombre"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !q.trim()}
          onClick={() => void search()}
        >
          Buscar
        </Button>
        <label className="block text-xs font-semibold">
          Producto
          <select
            className="mt-2 w-full rounded-md border p-2 text-sm"
            value={sheet?.product.id ?? ''}
            onChange={(event) => void choose(event.target.value)}
          >
            <option value="">Selecciona un producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name}
              </option>
            ))}
          </select>
        </label>
        {sheet && (
          <>
            <label className="block text-xs font-semibold">
              Atributo
              <select
                className="mt-2 w-full rounded-md border p-2 text-sm"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              >
                {sheet.schema.columns
                  .filter((column) => column.sourceAuthority === 'pim' && column.permissions.edit)
                  .map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                      {column.unit ? ` (${column.unit})` : ''}
                    </option>
                  ))}
              </select>
            </label>
            {candidates.map((candidate, index) => (
              <fieldset key={index} className="space-y-2 rounded-lg border p-3">
                <legend className="text-xs font-semibold">Candidato {index + 1}</legend>
                <select
                  aria-label={`Fuente ${index + 1}`}
                  className="w-full rounded-md border p-2 text-sm"
                  value={candidate.source}
                  onChange={(event) =>
                    setCandidates((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, source: event.target.value as typeof item.source }
                          : item,
                      ),
                    )
                  }
                >
                  {['fabricante', 'archivo', 'tecdoc', 'manual'].map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Valor ${index + 1}`}
                  value={String(candidate.value ?? '')}
                  onChange={(event) =>
                    setCandidates((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="Valor confirmado"
                />
                <Input
                  aria-label={`Evidencia ${index + 1}`}
                  value={candidate.evidence}
                  onChange={(event) =>
                    setCandidates((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, evidence: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="Documento o referencia de evidencia"
                />
              </fieldset>
            ))}
            <Button
              disabled={
                busy ||
                !key ||
                candidates.some(
                  (candidate) =>
                    !String(candidate.value ?? '').trim() || !candidate.evidence.trim(),
                )
              }
              onClick={() => void submit()}
            >
              Registrar para revisión
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </WorkspaceDrawer>
  );
}
