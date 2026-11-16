'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QualityReviewDto } from '@cdr/contracts';
import { listQualityReviews } from '@/lib/quality-governance-api';
import { Card } from './ui/card';
import { Button } from './ui/button';
const sources: Record<string, string> = {
  fabricante: 'Fabricante',
  archivo: 'Archivo',
  tecdoc: 'TecDoc',
  manual: 'Manual',
  ai: 'IA',
};
export function IntegrationSourceCandidates({
  productId,
  sourcePriority,
}: { productId?: string; sourcePriority?: Readonly<Record<string, number>> } = {}) {
  const [items, setItems] = useState<QualityReviewDto[]>([]),
    [error, setError] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listQualityReviews(
      { kind: 'attribute', page, pageSize: 25, ...(productId ? { productId } : {}) },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'No se pudieron consultar las fuentes.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, productId, revision]);
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h3 className="font-semibold">Candidatos conservados por fuente</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Valores y evidencia registrados por extracción o captura humana. La procedencia declarada
          no acredita una conexión remota con fabricante o TecDoc.
        </p>
      </div>
      {error ? (
        <p role="alert" className="p-4 text-sm text-red-700">
          {error}{' '}
          <button className="underline" onClick={() => setRevision((value) => value + 1)}>
            Reintentar
          </button>
        </p>
      ) : null}
      <div className="overflow-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              {[
                'SKU / atributo',
                'Fuente',
                'Prioridad',
                'Valor candidato',
                'Evidencia',
                'Decisión',
                'Acción',
              ].map((value) => (
                <th key={value} className="p-3">
                  {value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.flatMap((item) =>
              item.candidates.map((candidate, index) => (
                <tr key={`${item.id}:${index}`} className="border-t">
                  <td className="p-3">
                    <Link href={`/products/${item.productId}`} className="text-primary underline">
                      {item.sku}
                    </Link>
                    <span className="block">{item.attributeKey}</span>
                  </td>
                  <td className="p-3">{sources[candidate.source] ?? candidate.source}</td>
                  <td className="p-3">{sourcePriority?.[candidate.source] ?? '—'}</td>
                  <td className="p-3">{String(candidate.value ?? 'Sin valor')}</td>
                  <td className="max-w-sm whitespace-pre-wrap p-3">{candidate.evidence}</td>
                  <td className="p-3">
                    {item.status === 'pending'
                      ? item.proposedIndex === index
                        ? 'Propuesto'
                        : 'Pendiente'
                      : item.chosenIndex === index
                        ? 'Elegido'
                        : item.status === 'rejected'
                          ? 'Rechazado'
                          : 'Conservado'}
                    {item.reason ? (
                      <p className="mt-1 text-muted-foreground">{item.reason}</p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/quality?view=conflict&productId=${encodeURIComponent(item.productId)}&reviewId=${encodeURIComponent(item.id)}`}
                      >
                        Comparar
                      </Link>
                    </Button>
                  </td>
                </tr>
              )),
            )}
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center">
                  Consultando fuentes…
                </td>
              </tr>
            ) : !items.length ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No hay candidatos registrados. Los conectores externos continúan pendientes de
                  contrato o licencia.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 border-t p-3">
        <p className="mr-auto self-center text-xs text-muted-foreground">
          {total} revisiones · página {page}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={page === 1 || loading}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page * 25 >= total || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
        </Button>
      </div>
    </Card>
  );
}
