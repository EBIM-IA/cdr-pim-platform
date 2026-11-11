'use client';
import { useEffect, useState } from 'react';
import type { ProductAttributeSheetDto } from '@cdr/contracts';
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
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchProductAttributeSheet(productA, controller.signal),
      fetchProductAttributeSheet(productB, controller.signal),
    ])
      .then((result) => {
        if (!controller.signal.aborted) setSheets(result);
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
  }, [productA, productB]);
  if (error)
    return (
      <p role="alert" className="text-xs text-red-700">
        {error}
      </p>
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
  ];
  return (
    <section>
      <h4 className="mb-3 text-sm font-semibold">Comparación de datos y atributos</h4>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-3">Dato</th>
              <th className="p-3">{sheets[0].product.sku}</th>
              <th className="p-3">{sheets[1].product.sku}</th>
            </tr>
          </thead>
          <tbody>
            {base.map(([label, left, right]) => (
              <tr key={label} className="border-b">
                <th className="p-3 font-medium">{label}</th>
                <td className="p-3">{format(left)}</td>
                <td className="p-3">{format(right)}</td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
