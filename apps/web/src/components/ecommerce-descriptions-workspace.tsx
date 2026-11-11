'use client';
import { useEffect, useState } from 'react';
import type {
  CatalogWorkbookResultDto,
  EcommerceDescriptionDto,
  ProductExperienceDto,
} from '@cdr/contracts';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { fetchProductExperience } from '@/lib/product-experience-api';
import { fetchEcommerceDescription, saveEcommerceDescription } from '@/lib/ecommerce-api';
import { EcommerceDescriptionCard } from './ecommerce-description-card';
import { Button } from './ui/button';
import { Card } from './ui/card';
export function EcommerceDescriptionsWorkspace() {
  const [query, setQuery] = useState(''),
    [products, setProducts] = useState<CatalogWorkbookResultDto | null>(null),
    [productId, setProductId] = useState('');
  const [experience, setExperience] = useState<ProductExperienceDto | null>(null),
    [descriptions, setDescriptions] = useState<(EcommerceDescriptionDto | null)[]>([]);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchCatalogWorkbook(
        { page: 1, pageSize: 20, q: query || undefined, filter: [] },
        controller.signal,
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          setProducts(data);
          setProductId((current) =>
            data.items.some((item) => item.id === current) ? current : (data.items[0]?.id ?? ''),
          );
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : 'No se pudo consultar el catálogo.');
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setExperience(null);
    setDescriptions([]);
    if (!productId) return () => controller.abort();
    setLoading(true);
    void fetchProductExperience(productId, controller.signal)
      .then(async (data) => {
        const rows = await Promise.all(
          data.variants.map((variant) =>
            fetchEcommerceDescription(
              productId,
              { type: variant.tipo, applicationId: variant.aplicacion?.id ?? null },
              controller.signal,
            ),
          ),
        );
        if (!controller.signal.aborted) {
          setExperience(data);
          setDescriptions(rows);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No se pudieron consultar las variantes.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, revision]);
  useEffect(() => {
    setError('');
    setNotice('');
  }, [productId]);
  const generatePending = async () => {
    if (!experience || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    let generated = 0;
    try {
      for (const [index, variant] of experience.variants.entries()) {
        const current = descriptions[index];
        if (current && !current.stale) continue;
        await saveEcommerceDescription(productId, {
          type: variant.tipo,
          applicationId: variant.aplicacion?.id ?? null,
          version: current?.version ?? 0,
          action: 'generate',
        });
        generated++;
      }
      setNotice(`${generated} propuestas guardadas para revisión.`);
    } catch (cause) {
      setError(
        `${generated} propuestas guardadas. ${cause instanceof Error ? cause.message : 'No se pudo completar la generación.'}`,
      );
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  };
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold">Descripción para e-commerce</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Revisa el título y la descripción de cada variante de venta. Los textos aprobados y
          vigentes se entregan desde el PIM sin generar de nuevo durante la consulta.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-40 flex-1 text-xs">
          Buscar producto
          <input
            type="search"
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 block w-full rounded border p-2"
          />
        </label>
        <label className="min-w-48 flex-1 text-xs">
          Producto
          <select
            value={productId}
            disabled={busy}
            onChange={(event) => setProductId(event.target.value)}
            className="mt-1 block w-full rounded border bg-white p-2"
          >
            {products?.items.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.brand}
              </option>
            ))}
          </select>
        </label>
      </div>
      {products && products.total > products.items.length ? (
        <p className="text-[11px] text-muted-foreground">
          Se muestran {products.items.length} de {products.total} SKU. Usa la búsqueda para elegir
          otro producto.
        </p>
      ) : null}
      {experience ? (
        <>
          <dl className="grid gap-2 sm:grid-cols-3">
            {[
              ['Variantes del SKU', experience.variants.length],
              [
                'Aprobadas y vigentes',
                descriptions.filter((value) => value?.status === 'approved' && !value.stale).length,
              ],
              [
                'Sin generar o desactualizadas',
                descriptions.filter((value) => !value || value.stale).length,
              ],
            ].map(([label, count]) => (
              <div key={label} className="rounded border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
          <Button
            size="sm"
            disabled={busy || !descriptions.some((value) => !value || value.stale)}
            onClick={() => void generatePending()}
          >
            {busy ? 'Generando propuestas…' : 'Generar pendientes de este SKU'}
          </Button>
          <fieldset disabled={busy} className="space-y-3">
            {experience.variants.map((variant) => (
              <EcommerceDescriptionCard
                key={`${variant.productId}:${variant.tipo}:${variant.aplicacion?.id ?? 'industrial'}:${revision}`}
                variant={variant}
                canManage
                onSaved={() => setRevision((value) => value + 1)}
              />
            ))}
          </fieldset>
        </>
      ) : null}
      {loading ? (
        <p role="status" className="text-xs">
          Consultando variantes…
        </p>
      ) : !experience && !error ? (
        <p className="text-xs text-muted-foreground">
          Selecciona un producto con variantes disponibles.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-emerald-800">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
