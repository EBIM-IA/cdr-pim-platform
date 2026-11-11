'use client';

import type {
  CatalogParameterDto,
  CatalogWorkbookResultDto,
  SaveCatalogParameterInput,
} from '@cdr/contracts';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchCatalogWorkbook } from '@/lib/dynamic-catalog-api';
import { listCatalogParameters, saveCatalogParameter } from '@/lib/catalog-parameters-api';

const kinds: Record<string, CatalogParameterDto['kind']> = {
  'Unidades de medida': 'unit',
  Materiales: 'material',
  Sellos: 'seal',
  'Tipos de identificador': 'identifier',
  Marcas: 'brand',
  'Tipos de aplicación': 'application',
  Sinónimos: 'synonym',
};
const identifiers = [
  ['sku', 'Código del artículo'],
  ['erp_item_id', 'Identificador ERP'],
  ['manufacturer_part_number', 'Código del fabricante'],
  ['ean', 'EAN'],
  ['upc', 'UPC'],
  ['internal_legacy', 'Identificador interno anterior'],
];
type ParameterRow = Omit<CatalogParameterDto, 'id' | 'updatedAt'> & { id?: string };
const normalize = (value: string) => value.trim().toLocaleLowerCase('es');

export function SettingsParameterCatalog({
  catalog,
  canManage = false,
}: {
  catalog: string;
  canManage?: boolean;
}) {
  const kind = kinds[catalog] ?? 'unit';
  const [data, setData] = useState<CatalogWorkbookResultDto | null>(null);
  const [parameters, setParameters] = useState<CatalogParameterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<SaveCatalogParameterInput | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setParameters([]);
    setDraft(null);
    void Promise.all([
      fetchCatalogWorkbook({ page: 1, pageSize: 1, filter: [] }, controller.signal),
      listCatalogParameters(kind, controller.signal),
    ])
      .then(([workbook, rows]) => {
        if (!controller.signal.aborted) {
          setData(workbook);
          setParameters(rows);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : 'No pudimos cargar los parámetros.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, refresh]);
  useEffect(() => {
    setQuery('');
    setBrand('');
    setNotice('');
  }, [catalog]);
  const rows = useMemo(() => {
    let observed: string[][] = [];
    if (kind === 'identifier') observed = identifiers;
    if (kind === 'brand')
      observed = (data?.facets.brands ?? []).map((value) => [value, 'Marca del catálogo']);
    if (kind === 'application')
      observed = (data?.facets.applicationTypes ?? []).map((value) => [
        value,
        'Aplicación registrada',
      ]);
    if (kind === 'unit')
      observed = [
        ...new Set(
          (data?.columns ?? [])
            .map((column) => column.unit)
            .filter((value): value is string => Boolean(value)),
        ),
      ]
        .sort()
        .map((value) => [value, 'Unidad de atributo de plantilla']);
    if (kind === 'material' || kind === 'seal') {
      const expression = kind === 'material' ? /material/i : /sello|sellado|seal/i;
      observed = (data?.columns ?? [])
        .filter((column) => expression.test(column.key) || expression.test(column.label))
        .flatMap((column) => column.allowedValues.map((value) => [value, column.label]));
    }
    const merged = new Map<string, ParameterRow>();
    observed.forEach(([value, description]) => {
      if (value)
        merged.set(normalize(value), {
          kind,
          value,
          description: description ?? '',
          target: null,
          logoDataUrl: null,
          active: true,
          version: 0,
        });
    });
    parameters.forEach((parameter) => merged.set(normalize(parameter.value), parameter));
    return [...merged.values()].sort((left, right) => left.value.localeCompare(right.value, 'es'));
  }, [data, kind, parameters]);
  const shown = rows.filter((row) =>
    [row.value, row.description, row.target ?? '']
      .join(' ')
      .toLocaleLowerCase('es')
      .includes(query.toLocaleLowerCase('es')),
  );
  const selectedBrand = rows.find((row) => row.value === brand) ?? rows[0];
  const edit = (row?: ParameterRow) => {
    setError('');
    setDraft({
      ...(row?.id ? { id: row.id } : {}),
      kind,
      value: row?.value ?? '',
      description: row?.description ?? '',
      target: row?.target ?? null,
      logoDataUrl: row?.logoDataUrl ?? null,
      active: row?.active ?? true,
      expectedVersion: row?.version ?? 0,
    });
  };
  return (
    <div className="min-w-0 space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="text-sm font-semibold">{catalog}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {kind === 'synonym'
                ? 'Términos alternativos aplicados en la búsqueda del catálogo.'
                : 'Parámetros configurados y valores observados en productos y plantillas.'}
            </p>
          </div>
          {canManage ? (
            <Button size="sm" disabled={loading} onClick={() => edit()}>
              Agregar parámetro
            </Button>
          ) : null}
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
          {notice ? (
            <p role="status" className="mt-3 text-xs text-emerald-800">
              {notice}
            </p>
          ) : null}
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[450px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    'Valor',
                    kind === 'synonym' ? 'Buscar también' : 'Descripción',
                    'Vigencia',
                    'Acción',
                  ].map((label) => (
                    <th key={label} className="p-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id ?? row.value} className="border-t">
                    <th scope="row" className="p-2.5 text-left font-medium">
                      {kind === 'brand' ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => setBrand(row.value)}
                        >
                          {row.value}
                        </button>
                      ) : (
                        row.value
                      )}
                      <small className="mt-1 block font-normal text-muted-foreground">
                        {row.id ? 'Configurado en PIM' : 'Observado en catálogo'}
                      </small>
                    </th>
                    <td className="p-2.5 text-muted-foreground">
                      {kind === 'synonym' ? row.target : row.description}
                    </td>
                    <td className="p-2.5">
                      <StatusBadge tone={row.active ? 'success' : 'neutral'}>
                        {row.active ? 'Vigente' : 'Inactivo'}
                      </StatusBadge>
                    </td>
                    <td className="p-2.5">
                      {canManage ? (
                        <Button size="sm" variant="outline" onClick={() => edit(row)}>
                          Editar
                        </Button>
                      ) : (
                        'Consulta'
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      {loading
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
            {shown.length} valores · Los cambios se guardan con auditoría y control de versión. Los
            valores observados conservan sus asignaciones en productos.
          </p>
        </div>
      </Card>
      {kind === 'brand' && selectedBrand ? (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Datos de marca para PDF · {selectedBrand.value}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
            <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">
              {selectedBrand.logoDataUrl ? (
                <Image
                  src={selectedBrand.logoDataUrl}
                  alt={`Logo ${selectedBrand.value}`}
                  width={120}
                  height={100}
                  unoptimized
                  className="max-h-28 object-contain"
                />
              ) : (
                'Sin logo registrado'
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm">
              {selectedBrand.description || 'Sin información adicional para la ficha PDF'}
            </p>
          </div>
          {canManage ? (
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={() => edit(selectedBrand)}
            >
              Editar datos de marca
            </Button>
          ) : null}
        </Card>
      ) : null}
      {draft ? (
        <WorkspaceDrawer
          title={draft.id ? 'Editar parámetro' : 'Agregar parámetro'}
          busy={saving}
          unsavedChanges
          onClose={() => setDraft(null)}
        >
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setError('');
              try {
                await saveCatalogParameter(draft);
                setNotice('Parámetro guardado y auditado.');
                setDraft(null);
                setRefresh((value) => value + 1);
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : 'No se pudo guardar el parámetro',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error ? (
              <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            <fieldset className="space-y-4" disabled={saving}>
              <label className="grid gap-1.5 text-sm">
                {kind === 'synonym' ? 'Término de búsqueda' : 'Valor'}
                <Input
                  required
                  maxLength={200}
                  value={draft.value}
                  onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                />
              </label>
              {kind === 'synonym' ? (
                <label className="grid gap-1.5 text-sm">
                  Buscar también
                  <Input
                    required
                    maxLength={200}
                    value={draft.target ?? ''}
                    onChange={(event) => setDraft({ ...draft, target: event.target.value || null })}
                  />
                </label>
              ) : null}
              <label className="grid gap-1.5 text-sm">
                {kind === 'brand' ? 'Información para la ficha PDF' : 'Descripción'}
                <textarea
                  className="min-h-24 rounded-md border p-3"
                  maxLength={4000}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
                Vigente
              </label>
              {kind === 'brand' ? (
                <div className="space-y-3">
                  <label className="grid gap-2 text-sm">
                    Logo PNG o JPEG · máximo 500 KB
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (
                          !['image/png', 'image/jpeg'].includes(file.type) ||
                          file.size > 500_000
                        ) {
                          setError('Selecciona PNG o JPEG de hasta 500 KB');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string')
                            setDraft((current) =>
                              current
                                ? { ...current, logoDataUrl: String(reader.result) }
                                : current,
                            );
                        };
                        reader.onerror = () => setError('No se pudo leer el logo');
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {draft.logoDataUrl ? (
                    <>
                      <Image
                        src={draft.logoDataUrl}
                        alt="Logo seleccionado"
                        width={120}
                        height={90}
                        unoptimized
                        className="object-contain"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDraft({ ...draft, logoDataUrl: null })}
                      >
                        Quitar logo
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar parámetro'}
              </Button>
            </div>
          </form>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
