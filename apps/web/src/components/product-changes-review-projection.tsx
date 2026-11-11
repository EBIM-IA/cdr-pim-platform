'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QualityProductChangesDto } from '@cdr/contracts';
import { listQualityProductChanges } from '@/lib/quality-governance-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
export function ProductChangesReviewProjection() {
  const [data, setData] = useState<QualityProductChangesDto>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listQualityProductChanges(page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'No fue posible consultar los cambios del catálogo.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page]);
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-5">
        <h3 className="font-semibold text-cdr-ink">Cambios de ficha/importación</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.total} productos con estado real En revisión. Consulta su ficha y la trazabilidad
          antes de continuar.
        </p>
      </div>
      {error && (
        <p role="alert" className="p-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="border-b bg-slate-50">
            <tr>
              {['SKU', 'Producto', 'Actualizado', 'Estado', 'Acción'].map((label) => (
                <th key={label} className="p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.productId} className="border-b last:border-0">
                <td className="p-4 font-semibold">{item.sku}</td>
                <td className="p-4">{item.name}</td>
                <td className="p-4">{new Date(item.updatedAt).toLocaleString('es-PE')}</td>
                <td className="p-4">
                  <StatusBadge tone="warning">En revisión</StatusBadge>
                </td>
                <td className="p-4">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/products/${item.productId}`}>Revisar ficha</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Cargando productos en revisión…
                </td>
              </tr>
            ) : (
              !data.items.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No hay productos con estado En revisión.
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-amber-50 p-4">
        <p className="max-w-3xl text-xs leading-relaxed text-amber-950">
          La aprobación integral del producto requiere los criterios de publicación confirmados por
          CDR. Esta bandeja permite revisar su información; la publicación permanece pendiente de
          esa definición.
        </p>
        <Button
          size="sm"
          disabled
          title="Pendiente de criterios de publicación confirmados por CDR"
        >
          Aprobar producto
        </Button>
      </div>
      <div className="flex justify-end gap-2 border-t p-3">
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
          disabled={page * 20 >= data.total || loading}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </Card>
  );
}
