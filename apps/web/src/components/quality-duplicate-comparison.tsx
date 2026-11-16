'use client';
import { useEffect, useState } from 'react';
import type { ProductAttributeSheetDto } from '@cdr/contracts';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { fetchProduct } from '@/lib/catalog-api';
import { productWithSheetEvidence } from '@/lib/product-evidence-view';
import type { Product } from '@/lib/types';
import { fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
export function QualityDuplicateComparison({
  productA,
  productB,
}: {
  productA: string;
  productB: string;
}) {
  const [sheets, setSheets] = useState<[ProductAttributeSheetDto, ProductAttributeSheetDto] | null>(
    null,
  );
  const [products, setProducts] = useState<[Product, Product] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setSheets(null);
    setProducts(null);
    void Promise.all([
      Promise.all([
        fetchProductAttributeSheet(productA, controller.signal),
        fetchProductAttributeSheet(productB, controller.signal),
      ]),
      Promise.all([
        fetchProduct(productA, controller.signal),
        fetchProduct(productB, controller.signal),
      ]),
    ])
      .then(([result, details]) => {
        if (!controller.signal.aborted) {
          setSheets(result);
          setProducts([
            productWithSheetEvidence(details[0], result[0]),
            productWithSheetEvidence(details[1], result[1]),
          ]);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'No fue posible cargar los atributos para comparar.',
          );
      });
    return () => controller.abort();
  }, [productA, productB, revision]);
  if (error)
    return (
      <div role="alert" className="text-xs text-red-700">
        {error}
        <Button
          size="sm"
          variant="outline"
          className="mt-2 block"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reintentar comparación
        </Button>
      </div>
    );
  if (!sheets)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Cargando atributos de ambos SKU…
      </p>
    );
  const columns = [
    ...new Map(
      sheets.flatMap((sheet) => sheet.schema.columns).map((column) => [column.key, column]),
    ).values(),
  ];
  const comparison = (left: unknown, right: unknown) =>
    left === null ||
    left === undefined ||
    left === '' ||
    right === null ||
    right === undefined ||
    right === ''
      ? 'Faltante'
      : left === right
        ? 'Coincide'
        : 'Diferente';
  const format = (value: unknown) =>
    value === null || value === undefined
      ? 'Sin valor'
      : typeof value === 'boolean'
        ? value
          ? 'Sí'
          : 'No'
        : String(value);
  const base = [
    ['Nombre', sheets[0].product.name, sheets[1].product.name],
    ['Marca', sheets[0].product.brand, sheets[1].product.brand],
    ['Estado', sheets[0].product.status, sheets[1].product.status],
    ['Plantilla', sheets[0].schema.template.name, sheets[1].schema.template.name],
    ['Código de proveedor', products?.[0]?.providerCode, products?.[1]?.providerCode],
    ['Código unificador', products?.[0]?.unifiedCode, products?.[1]?.unifiedCode],
    ['Tipo de aplicación', products?.[0]?.application, products?.[1]?.application],
    [
      'Fuentes de atributos',
      [
        ...new Set(
          Object.values(sheets[0].product.attributes).map((attribute) => attribute.source),
        ),
      ].join(' · '),
      [
        ...new Set(
          Object.values(sheets[1].product.attributes).map((attribute) => attribute.source),
        ),
      ].join(' · '),
    ],
  ];
  return (
    <section>
      <h4 className="mb-3 text-sm font-semibold">Comparación de datos y atributos</h4>
      {products?.[0]?.unifiedCode && products[0].unifiedCode === products[1]?.unifiedCode ? (
        <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
          Ambos SKU ya comparten el código unificador{' '}
          <Link
            className="font-semibold text-primary underline"
            href={`/equivalences?view=groups&group=${encodeURIComponent(products[0].unifiedCode)}`}
          >
            {products[0].unifiedCode}
          </Link>
          . La decisión conserva sus identidades separadas.
        </p>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          No comparten un código unificador registrado. Confirmar equivalencia conserva cada SKU; la
          agrupación la determina ERP.
        </p>
      )}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-3">Dato</th>
              <th className="p-3">{sheets[0].product.sku}</th>
              <th className="p-3">{sheets[1].product.sku}</th>
              <th className="p-3">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {base.map(([label, left, right]) => (
              <tr key={label} className="border-b">
                <th className="p-3 font-medium">{label}</th>
                <td className="p-3">{format(left)}</td>
                <td className="p-3">{format(right)}</td>
                <td className="p-3">{comparison(left, right)}</td>
              </tr>
            ))}
            {columns.map((column) => {
              const left = sheets[0].product.attributes[column.key]?.value;
              const right = sheets[1].product.attributes[column.key]?.value;
              return (
                <tr
                  key={column.key}
                  className={`border-b last:border-0 ${left !== right ? 'bg-amber-50/50' : ''}`}
                >
                  <th className="p-3 font-medium">
                    {column.label}
                    {column.unit ? ` (${column.unit})` : ''}
                  </th>
                  <td className="p-3">{format(left)}</td>
                  <td className="p-3">{format(right)}</td>
                  <td className="p-3">{comparison(left, right)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
