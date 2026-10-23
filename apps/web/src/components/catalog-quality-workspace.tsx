'use client';

import type {
  CatalogAttributeValue,
  CatalogWorkbookProductDto,
  ProductAssetDto,
  ProductAssetType,
  ProductAttributeSheetDto,
  WorkspaceDto,
} from '@cdr/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  GitCompareArrows,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { fetchCatalogWorkbook, fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
import { listProductAssets, productAssetDownloadUrl } from '@/lib/product-assets-api';

const assetLabels: Record<ProductAssetType, string> = {
  FT: 'Ficha técnica',
  MSDS: 'Ficha de seguridad MSDS',
  CERT: 'Certificado de conformidad',
  PLANO: 'Plano técnico',
  FOTO: 'Fotografía del producto',
};

type QualitySheet = ProductAttributeSheetDto;
type QualityProduct = Pick<
  CatalogWorkbookProductDto,
  'id' | 'sku' | 'name' | 'brand' | 'template' | 'completeness'
>;

function hasValue(value: CatalogAttributeValue | null | undefined): boolean {
  return (
    value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')
  );
}

function shown(value: CatalogAttributeValue | null | undefined, unit: string | null): string {
  if (!hasValue(value)) return 'Faltante';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return `${String(value)}${unit ? ` ${unit}` : ''}`;
}

function Indicator({
  label,
  value,
  note,
  icon,
  tone = 'text-primary',
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="flex min-h-28 items-start gap-3 p-4">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 ${tone}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <small className="text-muted-foreground">{label}</small>
        <strong className="mt-1 block text-xl text-cdr-ink">{value}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{note}</span>
      </div>
    </Card>
  );
}

export interface CatalogQualityWorkspaceProps {
  workspace: WorkspaceDto;
}

export function CatalogQualityWorkspace({ workspace }: CatalogQualityWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [products, setProducts] = useState<CatalogWorkbookProductDto[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<QualityProduct | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [sheet, setSheet] = useState<QualitySheet | null>(null);
  const [assets, setAssets] = useState<ProductAssetDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [assetError, setAssetError] = useState('');
  const [revision, setRevision] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const initialSheet = useRef<QualitySheet | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    setSearchError('');
    void fetchCatalogWorkbook(
      { page: 1, pageSize: 25, filter: [], ...(appliedQuery ? { q: appliedQuery } : {}) },
      controller.signal,
    )
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setProducts(result.items);
        setTotal(result.total);
        const requestedId = !appliedQuery
          ? new URLSearchParams(window.location.search).get('productId')
          : null;
        if (requestedId) {
          const requestedSheet = await fetchProductAttributeSheet(requestedId, controller.signal);
          if (controller.signal.aborted) return;
          initialSheet.current = requestedSheet;
          setSelected({
            ...requestedSheet.product,
            template: requestedSheet.schema.template,
            completeness: requestedSheet.completeness ?? null,
          });
          setRevision((value) => value + 1);
          return;
        }
        setSelected((current) =>
          current && result.items.some((item) => item.id === current.id)
            ? (result.items.find((item) => item.id === current.id) ?? null)
            : (result.items[0] ?? null),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSearchError(error instanceof Error ? error.message : 'No pudimos buscar productos.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [appliedQuery, workspace.generatedAt]);

  const selectedId = selected?.id;
  const selectedTemplateId = selected?.template?.id;
  useEffect(() => {
    const controller = new AbortController();
    setSheet(null);
    setAssets([]);
    setDetailError('');
    setAssetError('');
    setLoading(Boolean(selectedId));
    if (!selectedId) return () => controller.abort();
    const cachedSheet =
      initialSheet.current?.product.id === selectedId ? initialSheet.current : null;
    initialSheet.current = null;
    const sheetRequest = selectedTemplateId
      ? cachedSheet
        ? Promise.resolve(cachedSheet)
        : fetchProductAttributeSheet(selectedId, controller.signal)
      : Promise.resolve(null);
    void Promise.allSettled([
      sheetRequest,
      listProductAssets({ productId: selectedId }, controller.signal),
    ]).then(([sheetResult, assetResult]) => {
      if (controller.signal.aborted) return;
      if (sheetResult.status === 'fulfilled') setSheet(sheetResult.value);
      else
        setDetailError(
          sheetResult.reason instanceof Error
            ? sheetResult.reason.message
            : 'No pudimos consultar los atributos de este producto.',
        );
      if (assetResult.status === 'fulfilled') setAssets(assetResult.value);
      else
        setAssetError('No pudimos consultar los archivos de este producto. Vuelve a intentarlo.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [selectedId, selectedTemplateId, revision, workspace.generatedAt]);

  const required = sheet?.schema.columns.filter((column) => column.required) ?? [];
  const missing = required.filter(
    (column) => !hasValue(sheet?.product.attributes[column.key]?.value),
  );
  const requirements = sheet?.assetRequirements;
  const missingAssets = requirements?.filter(
    (requirement) =>
      requirement.required && !assets.some((asset) => asset.type === requirement.type),
  );
  const completeness =
    sheet?.completeness !== undefined ? sheet.completeness : (selected?.completeness ?? null);
  const notReady = completeness !== null && completeness < 100;
  const productHref = selected ? `/products/${encodeURIComponent(selected.id)}` : '/products';
  const findings = selected ? workspace.rows.find((row) => row.id === selected.id) : undefined;
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; templateId: string; name: string; values: number[] }
    >();
    for (const product of products) {
      if (!product.template || product.completeness === null) continue;
      const group = grouped.get(product.template.id) ?? {
        id: product.category?.id ?? '',
        templateId: product.template.id,
        name: product.template.name,
        values: [],
      };
      group.values.push(product.completeness);
      grouped.set(product.template.id, group);
    }
    return [...grouped.values()].map((group) => ({
      ...group,
      average: Math.round(
        group.values.reduce((sum, value) => sum + value, 0) / group.values.length,
      ),
    }));
  }, [products]);
  const options =
    selected && !products.some((product) => product.id === selected.id)
      ? [selected, ...products]
      : products;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setRulesOpen(true)}>
          Reglas de calidad
        </Button>
        <Button asChild variant="outline">
          <Link href="/quality?view=duplicates">Revisar duplicados</Link>
        </Button>
      </div>
      <Card className="grid gap-3 p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(250px,1.5fr)_auto] lg:items-end">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-muted-foreground">
            Buscar SKU o descripción
            <Input
              className="mt-1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej. 6205, rodamiento…"
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            className="mt-5"
            disabled={searching}
            aria-label="Buscar productos"
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </form>
        <label className="min-w-0 text-xs text-muted-foreground">
          SKU en contexto
          <select
            aria-label="SKU en contexto"
            className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-cdr-ink"
            disabled={searching || !products.length}
            value={selected?.id ?? ''}
            onChange={(event) =>
              setSelected(options.find((product) => product.id === event.target.value) ?? null)
            }
          >
            {!products.length ? <option value="">Sin productos</option> : null}
            {options.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.brand ?? 'Sin marca'} · {product.name}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <Button asChild variant="outline">
            <Link href={`${productHref}?edit=enrichment`}>Editar enriquecimiento</Link>
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground lg:col-span-3" aria-live="polite">
          {searching
            ? 'Buscando productos…'
            : `${products.length} de ${total} productos en esta búsqueda.`}
        </p>
      </Card>
      {searchError ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los productos"
          description={searchError}
        />
      ) : null}
      {!searching && !searchError && !products.length ? (
        <StatePanel
          variant="empty"
          title="Sin productos para esta búsqueda"
          description="Ajusta el SKU o la descripción para consultar otro producto."
        />
      ) : null}
      {selected ? (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
            aria-label="Indicadores de calidad del SKU"
            aria-busy={loading}
          >
            <Indicator
              label="Obligatorios completos"
              value={
                loading || !sheet ? '—' : `${required.length - missing.length}/${required.length}`
              }
              note="Atributos visibles de la plantilla"
              icon={<CheckCircle2 className="size-4" />}
              tone="text-emerald-700"
            />
            <Indicator
              label="Obligatorios faltantes"
              value={loading || !sheet ? '—' : missing.length}
              note={
                missing.length ? 'Requieren completar información' : 'Atributos visibles evaluados'
              }
              icon={<AlertTriangle className="size-4" />}
              tone={missing.length ? 'text-red-700' : 'text-emerald-700'}
            />
            <Indicator
              label="Documentos / imágenes"
              value={
                loading || !requirements || assetError
                  ? '—'
                  : `${missingAssets?.length ?? 0} faltantes`
              }
              note={
                requirements
                  ? `${requirements.filter((requirement) => requirement.required).length} tipos obligatorios`
                  : 'Requisitos de plantilla sin evaluar'
              }
              icon={<FileImage className="size-4" />}
              tone="text-amber-700"
            />
            <Indicator
              label="Conflictos"
              value="Sin evaluar"
              note="No hay una evaluación de fuentes disponible"
              icon={<GitCompareArrows className="size-4" />}
              tone="text-violet-700"
            />
            <Indicator
              label="Estado publicable"
              value={
                <StatusBadge tone={notReady ? 'danger' : 'warning'}>
                  {notReady ? 'No publicable' : 'Pendiente de evaluación'}
                </StatusBadge>
              }
              note={
                notReady
                  ? 'Faltan requisitos de la plantilla'
                  : 'Aprobación y conflictos por evaluar'
              }
              icon={<ShieldCheck className="size-4" />}
              tone="text-blue-700"
            />
          </section>
          <Card className="p-4" aria-label="Completitud oficial del producto">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="text-lg">
                {selected.sku} ·{' '}
                {loading || completeness === null ? 'Sin evaluar' : `${completeness}% completo`}
              </strong>
              <span className="text-xs text-muted-foreground">
                {sheet?.schema.template.name ??
                  selected.template?.name ??
                  'Pendiente de clasificación'}
              </span>
            </div>
            {!loading && completeness !== null ? (
              <Progress
                className="mt-3"
                value={completeness}
                label={`Completitud de ${selected.sku}`}
              />
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              La completitud incluye atributos y archivos obligatorios de la plantilla activa. La
              evaluación de conflictos y la aprobación se consultan por separado.
            </p>
            {!loading && findings ? (
              <p className="mt-2 text-xs text-amber-800">
                Hallazgos:{' '}
                {String(findings.values.findings ?? 'Revisa los requisitos del producto.')}
              </p>
            ) : null}
          </Card>
          {loading ? (
            <div
              role="status"
              className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
            >
              Consultando atributos y documentos del SKU…
            </div>
          ) : detailError ? (
            <StatePanel
              variant="error"
              title="No pudimos evaluar este producto"
              description={detailError}
              actionLabel="Reintentar"
              onAction={() => setRevision((value) => value + 1)}
            />
          ) : !sheet ? (
            <StatePanel
              variant="empty"
              title="Pendiente de clasificación"
              description="El producto necesita una categoría y una plantilla activas para evaluar sus requisitos."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
              <Card className="overflow-hidden">
                <h2 className="border-b px-4 py-3 text-base font-semibold">
                  Obligatorios · {sheet.schema.template.name}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr>
                        {['Atributo', 'Grupo', 'Valor', 'Estado', 'Acción'].map((heading) => (
                          <th key={heading} className="px-3 py-2">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {required.map((column) => {
                        const value = sheet.product.attributes[column.key]?.value;
                        const complete = hasValue(value);
                        return (
                          <tr key={column.key} className="border-t">
                            <td className="px-3 py-2">{column.label}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {column.sourceAuthority === 'erp' ? 'Base ERP' : 'Enriquecimiento'}
                            </td>
                            <td className="px-3 py-2">{shown(value, column.unit)}</td>
                            <td className="px-3 py-2">
                              <StatusBadge tone={complete ? 'success' : 'danger'}>
                                {complete ? 'Completo' : 'Incompleto'}
                              </StatusBadge>
                            </td>
                            <td className="px-3 py-2">
                              {!complete ? (
                                column.sourceAuthority === 'erp' ? (
                                  <span className="text-xs text-muted-foreground">
                                    Llega desde ERP
                                  </span>
                                ) : column.permissions.edit ? (
                                  <Link
                                    className="text-xs underline"
                                    href={`${productHref}?edit=enrichment`}
                                  >
                                    Completar
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Solo consulta
                                  </span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!required.length ? (
                        <tr>
                          <td colSpan={5} className="p-5 text-center text-muted-foreground">
                            La plantilla no define atributos obligatorios visibles.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="space-y-4">
                <Card className="p-4">
                  <h2 className="text-base font-semibold">Documentos e imágenes</h2>
                  {assetError ? (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      {assetError}{' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setRevision((value) => value + 1)}
                      >
                        Reintentar
                      </button>
                    </p>
                  ) : requirements ? (
                    <ul className="mt-3 divide-y">
                      {requirements.map((requirement) => {
                        const files = assets.filter((asset) => asset.type === requirement.type);
                        return (
                          <li
                            key={requirement.type}
                            className="flex items-center justify-between gap-3 py-3"
                          >
                            <div>
                              <strong className="block text-sm">
                                {assetLabels[requirement.type]}
                              </strong>
                              <small className="text-muted-foreground">
                                {requirement.required ? 'Obligatorio' : 'Opcional'}
                              </small>
                              {files.map((asset) => (
                                <a
                                  key={asset.id}
                                  href={productAssetDownloadUrl(asset.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 block text-xs underline"
                                >
                                  {asset.filename}
                                </a>
                              ))}
                            </div>
                            <StatusBadge
                              tone={
                                files.length
                                  ? 'success'
                                  : requirement.required
                                    ? 'danger'
                                    : 'neutral'
                              }
                            >
                              {files.length ? 'Completo' : 'Pendiente'}
                            </StatusBadge>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Los requisitos documentales de esta plantilla no están disponibles para
                      consulta.
                    </p>
                  )}
                  {requirements?.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      La plantilla no define requisitos documentales.
                    </p>
                  ) : null}
                  {!assetError && !requirements && assets.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {assets.map((asset) => (
                        <li key={asset.id}>
                          <a
                            className="text-xs underline"
                            href={productAssetDownloadUrl(asset.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {assetLabels[asset.type]} · {asset.filename}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href={`/documents?productId=${encodeURIComponent(selected.id)}`}>
                      Gestionar activos
                    </Link>
                  </Button>
                </Card>
                <Card className="p-4">
                  <h2 className="text-base font-semibold">Conflictos de fuentes</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    La evaluación de candidatos y conflictos no está disponible para este producto.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/quality?view=sources">Ver prioridad de fuentes</Link>
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </>
      ) : null}
      {groups.length ? (
        <Card className="p-4">
          <h2 className="text-base font-semibold">
            Completitud por plantilla · resultados de esta búsqueda
          </h2>
          <div className="mt-3 divide-y">
            {groups.map((group) => (
              <div
                key={group.templateId}
                className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(100px,1fr)_50px_70px]"
              >
                <Link
                  className="text-sm underline"
                  href={`/products?category=${encodeURIComponent(group.id)}`}
                >
                  {group.name}
                </Link>
                <Progress value={group.average} label={`Completitud media de ${group.name}`} />
                <span className="text-sm">{group.average}%</span>
                <small className="text-muted-foreground">{group.values.length} SKU</small>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Promedios de los {products.length} productos mostrados de {total}; no representan los
            productos de otras páginas.
          </p>
        </Card>
      ) : null}
      {rulesOpen ? (
        <WorkspaceDrawer title="Reglas de calidad" onClose={() => setRulesOpen(false)}>
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              La completitud oficial cuenta los atributos activos obligatorios y los tipos de
              archivo obligatorios de la plantilla activa.
            </p>
            <p>
              Un valor vacío o un archivo eliminado permanece como faltante. Los valores cero y No
              son datos completos.
            </p>
            <p>
              Los datos base del ERP son de solo lectura. Completa los atributos de enriquecimiento
              desde la ficha y adjunta los documentos desde Imágenes y documentos.
            </p>
            <p>
              Las tablas muestran únicamente los atributos permitidos para tu rol; el porcentaje
              oficial también considera los requisitos que no puedas consultar.
            </p>
            <p>
              La completitud no sustituye la revisión de fuentes ni la aprobación del producto. No
              se afirma que un SKU esté publicable sin esa evaluación.
            </p>
          </div>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
