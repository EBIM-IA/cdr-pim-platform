'use client';

import type { CatalogWorkbookResultDto } from '@cdr/contracts';
import { useEffect, useMemo, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';

const identifiers = [
  ['sku', 'Código del artículo'],
  ['erp_item_id', 'Identificador ERP'],
  ['manufacturer_part_number', 'Código del fabricante'],
  ['ean', 'EAN'],
  ['upc', 'UPC'],
  ['internal_legacy', 'Identificador interno anterior'],
];

export function SettingsParameterCatalog({ catalog }: { catalog: string }) {
  const [data, setData] = useState<CatalogWorkbookResultDto | null>(null);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogWorkbook({ page: 1, pageSize: 1, filter: [] }, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError('No pudimos cargar los parámetros del catálogo.');
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setQuery('');
  }, [catalog]);
  const rows = useMemo(() => {
    if (catalog === 'Tipos de identificador') return identifiers;
    if (catalog === 'Marcas')
      return (data?.facets.brands ?? []).map((value) => [value, 'Marca del catálogo']);
    if (catalog === 'Tipos de aplicación')
      return (data?.facets.applicationTypes ?? []).map((value) => [value, 'Aplicación registrada']);
    if (catalog === 'Unidades de medida')
      return [
        ...new Set(
          (data?.columns ?? [])
            .map((column) => column.unit)
            .filter((value): value is string => !!value),
        ),
      ]
        .sort()
        .map((value) => [value, 'Unidad de atributo de plantilla']);
    const expression =
      catalog === 'Materiales' ? /material/i : catalog === 'Sellos' ? /sello|sellado|seal/i : null;
    if (!expression) return [];
    const values = (data?.columns ?? [])
      .filter((column) => expression.test(column.key) || expression.test(column.label))
      .flatMap((column) => column.allowedValues.map((value) => [value, column.label]));
    return [...new Map(values.map((value) => [value.join('|'), value])).values()];
  }, [catalog, data]);
  const shown = rows.filter((row) =>
    row.join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')),
  );
  const currentBrand = brand || data?.facets.brands[0] || '';
  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="text-sm font-semibold">{catalog}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {catalog === 'Sinónimos'
                ? 'Términos alternativos para encontrar productos.'
                : 'Valores vigentes del catálogo y sus plantillas.'}
            </p>
          </div>
          <Button
            size="sm"
            disabled
            title="El mantenimiento de estos parámetros está pendiente de habilitar"
          >
            Agregar parámetro
          </Button>
        </div>
        <div className="p-4">
          <label>
            <span className="sr-only">Buscar parámetro</span>
            <Input
              type="search"
              placeholder="Buscar parámetro…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="mt-3 text-xs text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[450px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Valor', 'Descripción', 'Vigencia', 'Acción'].map((label) => (
                    <th key={label} className="p-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.join('|')} className="border-t">
                    <th scope="row" className="p-2.5 text-left font-medium">
                      {catalog === 'Marcas' ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setBrand(row[0] ?? '')}
                        >
                          {row[0]}
                        </button>
                      ) : (
                        row[0]
                      )}
                    </th>
                    <td className="p-2.5 text-muted-foreground">{row[1]}</td>
                    <td className="p-2.5">
                      <StatusBadge tone="success">Vigente</StatusBadge>
                    </td>
                    <td className="p-2.5">
                      <Button size="sm" variant="outline" disabled>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
                {!shown.length ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      {!data && !error
                        ? 'Cargando parámetros…'
                        : query
                          ? 'Sin coincidencias.'
                          : 'Sin valores definidos para este catálogo.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {shown.length} valores · Consulta de parámetros vigentes. El mantenimiento está
            pendiente de habilitar.
          </p>
        </div>
      </Card>
      {catalog === 'Marcas' ? (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">
            Datos de marca para PDF · {currentBrand || 'Selecciona una marca'}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
            <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">
              Sin logo registrado
            </div>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Marca</dt>
                <dd className="mt-1 font-semibold">{currentBrand || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Datos para la ficha PDF</dt>
                <dd className="mt-1">Configuración pendiente de habilitar</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" disabled>
              Editar datos de marca
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
