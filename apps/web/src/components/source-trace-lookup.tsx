'use client';
import { useState } from 'react';
import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { AttributeValueTrace } from '@/components/attribute-value-trace';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchProducts } from '@/lib/catalog-api';
import { fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
import type { Product } from '@/lib/types';

export function SourceTraceLookup() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [attribute, setAttribute] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async () => {
    setBusy(true);
    setError('');
    try {
      setProducts((await fetchProducts({ q: query.trim(), page: 1, pageSize: 25 })).items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible buscar el SKU.');
    } finally {
      setBusy(false);
    }
  };
  const select = async (id: string) => {
    setSheet(null);
    setAttribute('');
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const result = await fetchProductAttributeSheet(id);
      setSheet(result);
      setAttribute(result.schema.columns[0]?.key ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar los atributos.');
    } finally {
      setBusy(false);
    }
  };
  const definition = sheet?.schema.columns.find((column) => column.key === attribute);
  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">Trazabilidad del valor vigente</h3>
      <p className="text-xs text-muted-foreground">
        Consulta un SKU y su atributo para revisar cambios, fuentes, candidatos y decisiones
        guardadas.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Input
          aria-label="Buscar SKU para trazabilidad"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Código o nombre"
        />
        <Button type="submit" variant="outline" disabled={busy || !query.trim()}>
          Buscar SKU
        </Button>
      </form>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-48 flex-1 text-xs font-semibold">
          SKU para trazabilidad
          <select
            className="mt-1 w-full rounded-md border p-2 text-sm"
            value={sheet?.product.id ?? ''}
            disabled={busy}
            onChange={(event) => void select(event.target.value)}
          >
            <option value="">Selecciona un SKU</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name}
              </option>
            ))}
          </select>
        </label>
        {sheet && (
          <label className="min-w-48 flex-1 text-xs font-semibold">
            Atributo para trazabilidad
            <select
              className="mt-1 w-full rounded-md border p-2 text-sm"
              value={attribute}
              onChange={(event) => setAttribute(event.target.value)}
            >
              {sheet.schema.columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {sheet && definition && (
          <div className="self-end">
            <AttributeValueTrace
              key={`${sheet.product.id}:${attribute}`}
              productId={sheet.product.id}
              attributeKey={attribute}
              label={definition.label}
            />
          </div>
        )}
      </div>
      {busy && (
        <p role="status" className="text-xs text-muted-foreground">
          Consultando datos del catálogo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error} Vuelve a consultar para reintentar.
        </p>
      )}
      {!busy && !error && query && products.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Busca un SKU existente para consultar su trazabilidad.
        </p>
      )}
    </Card>
  );
}
