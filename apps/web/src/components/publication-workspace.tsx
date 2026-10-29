'use client';

import type {
  AdminTemplateAttributeDto,
  CatalogCategorySummaryDto,
  CatalogGridColumnDto,
  CatalogGridProductDto,
  CatalogWorkbookProductDto,
  CatalogWorkbookResultDto,
  ProductAttributeSheetDto,
  WorkspaceDto,
} from '@cdr/contracts';
import { CheckCircle2, Download, ImageIcon, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { getAdminTemplate, updateAdminTemplateAttribute } from '@/lib/catalog-admin-api';
import {
  fetchCatalogCategories,
  fetchCatalogGrid,
  fetchCatalogSchema,
  fetchCatalogWorkbook,
  fetchProductAttributeSheet,
} from '@/lib/dynamic-catalog-api';
import { listProductAssets } from '@/lib/product-assets-api';
import { downloadXlsx } from '@/lib/tabular-export';

type PublicationAttribute = Omit<CatalogGridColumnDto, 'permissions'> & {
  active?: boolean;
  publishable?: boolean;
  updatedAt?: string;
};
type PublicationView = 'channels' | 'prestashop' | 'images';
const typeLabels: Record<string, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí / No',
  date: 'Fecha',
  enum: 'Lista',
  measurement: 'Medida',
};

export function publicationReadiness(
  product: Pick<CatalogWorkbookProductDto, 'completeness' | 'status' | 'template'>,
) {
  if (product.status === 'archived')
    return { label: 'No publicable', reason: 'SKU archivado.', tone: 'neutral' as const };
  if (!product.template)
    return {
      label: 'No publicable',
      reason: 'Sin plantilla activa asignada.',
      tone: 'danger' as const,
    };
  if (product.completeness === null)
    return {
      label: 'Sin evaluar',
      reason: 'Completitud todavía no disponible.',
      tone: 'neutral' as const,
    };
  if (product.completeness < 100)
    return {
      label: 'No publicable',
      reason: 'Faltan atributos o documentos obligatorios.',
      tone: 'danger' as const,
    };
  return {
    label: 'Pendiente de evaluación',
    reason: 'Obligatorios completos. Falta validar aprobación y condiciones del canal.',
    tone: 'warning' as const,
  };
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <Card id={id} className="overflow-hidden">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 text-xs last:border-0">
      <span>{label}</span>
      <span className="text-right text-muted-foreground">{children}</span>
    </div>
  );
}

function TemplatePublication({ canManage }: { canManage: boolean }) {
  const [categories, setCategories] = useState<CatalogCategorySummaryDto[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [attributes, setAttributes] = useState<PublicationAttribute[]>([]);
  const [products, setProducts] = useState<CatalogGridProductDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const category = categories.find((item) => item.templateId === templateId);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then((items) => {
        setCategories(items);
        setTemplateId(items[0]?.templateId ?? '');
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No pudimos cargar las categorías.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!category) return;
    let current = true;
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    setAttributes([]);
    setSheet(null);
    setProducts([]);
    const loadAttributes = canManage
      ? getAdminTemplate(category.templateId).then((template) => template.attributes ?? [])
      : fetchCatalogSchema(
          category.id,
          { templateId: category.templateId },
          controller.signal,
        ).then((schema) => schema.columns);
    void Promise.all([
      loadAttributes,
      fetchCatalogGrid(
        {
          categoryId: category.id,
          templateId: category.templateId,
          page: 1,
          pageSize: 25,
          filter: [],
        },
        controller.signal,
      ),
    ])
      .then(([attrs, result]) => {
        if (!current) return;
        setAttributes(attrs);
        setProducts(result.items);
        setSelectedId(result.items[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (current && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No pudimos cargar la configuración.');
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [category, canManage]);

  useEffect(() => {
    if (!selectedId) {
      setSheet(null);
      return;
    }
    const controller = new AbortController();
    setSheet(null);
    void fetchProductAttributeSheet(selectedId, controller.signal)
      .then(setSheet)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No pudimos cargar el SKU.');
      });
    return () => controller.abort();
  }, [selectedId]);

  const active = attributes.filter((attribute) => attribute.active !== false);
  const isIdentity = (attribute: PublicationAttribute) =>
    ['codigoArticulo', 'codigo_articulo', 'sku'].includes(attribute.key);
  const published = active.filter(
    (attribute) => isIdentity(attribute) || attribute.publishable !== false,
  );
  const toggle = async (attribute: PublicationAttribute) => {
    if (
      !canManage ||
      busy ||
      !attribute.updatedAt ||
      !category ||
      attribute.active === false ||
      isIdentity(attribute)
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated: AdminTemplateAttributeDto = await updateAdminTemplateAttribute(
        category.templateId,
        attribute.id,
        { publishable: attribute.publishable === false, expectedUpdatedAt: attribute.updatedAt },
      );
      setAttributes((items) =>
        items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setNotice(`${attribute.label}: configuración guardada para todos los SKU de la plantilla.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No pudimos guardar. Actualiza la categoría e inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };
  const preview = sheet
    ? published.map((attribute) => ({
        attribute,
        value: sheet.product.attributes[attribute.key]?.value ?? null,
      }))
    : [];

  return (
    <Panel id="publication-attributes" title="Atributos publicados en PrestaShop por categoría">
      <p className="mb-4 text-xs text-muted-foreground">
        Elige la categoría y marca qué atributos se incluirán al conectar el ecommerce. Aplica a
        todos sus SKU. El código del artículo identifica siempre al producto.
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-3 text-xs text-emerald-800">
          {notice}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="max-h-[440px] overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="p-2">Categoría / plantilla</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((item) => (
                <tr
                  key={item.templateId}
                  className={templateId === item.templateId ? 'bg-orange-50' : 'border-t'}
                >
                  <td>
                    <button
                      type="button"
                      className="w-full p-2.5 text-left hover:text-primary"
                      disabled={busy}
                      onClick={() => setTemplateId(item.templateId)}
                      aria-pressed={item.templateId === templateId}
                    >
                      <strong>{item.name}</strong>
                      <small className="mt-1 block text-muted-foreground">
                        {item.templateName}
                      </small>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-w-0 space-y-3" aria-busy={busy}>
          <Select
            label="Categoría y plantilla"
            disabled={busy}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item.templateId} value={item.templateId}>
                {item.name} · {item.templateName}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{published.length}</strong> de {active.length}{' '}
            atributos activos seleccionados{canManage ? '' : ' · Solo consulta'}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Sección', 'Atributo', 'Tipo', 'Publicar en PrestaShop'].map((label) => (
                    <th key={label} className="p-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="p-2.5">Identidad</td>
                  <th scope="row" className="p-2.5 font-medium">
                    Código del artículo (SKU)
                  </th>
                  <td className="p-2.5">Texto</td>
                  <td className="p-2.5">
                    <StatusBadge tone="success">Siempre</StatusBadge>
                  </td>
                </tr>
                {attributes.map((attribute) => (
                  <tr key={attribute.id} className="border-t">
                    <td className="p-2.5 text-muted-foreground">
                      {attribute.sourceAuthority === 'erp' ? 'Base ERP' : 'Atributos técnicos'}
                    </td>
                    <th scope="row" className="p-2.5 font-medium">
                      {attribute.label}
                      {attribute.unit ? ` (${attribute.unit})` : ''}
                    </th>
                    <td className="p-2.5">
                      {typeLabels[attribute.dataType] ?? attribute.dataType}
                    </td>
                    <td className="p-2.5">
                      {attribute.active === false ? (
                        <StatusBadge>Inactivo</StatusBadge>
                      ) : isIdentity(attribute) ? (
                        <StatusBadge tone="success">Siempre · identidad del SKU</StatusBadge>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={attribute.publishable !== false}
                          aria-label={`Publicar en PrestaShop: ${attribute.label}`}
                          disabled={!canManage || busy}
                          onClick={() => void toggle(attribute)}
                          className="inline-flex items-center gap-2 disabled:opacity-60"
                        >
                          <span
                            className={`flex h-4 w-7 rounded-full p-0.5 ${attribute.publishable !== false ? 'bg-emerald-600' : 'bg-slate-300'}`}
                          >
                            <span
                              className={`size-3 rounded-full bg-white ${attribute.publishable !== false ? 'translate-x-3' : ''}`}
                            />
                          </span>
                          {attribute.publishable !== false ? 'Sí' : 'No'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {busy && !attributes.length ? (
            <p role="status" className="text-xs text-muted-foreground">
              Cargando atributos…
            </p>
          ) : null}
          <div className="rounded-lg border bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Select
                  label="Vista previa por SKU · primeros 25 de la categoría"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">Selecciona un SKU</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku} · {product.brand}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!sheet}
                onClick={() => {
                  if (sheet)
                    downloadXlsx(
                      {
                        headers: ['SKU', 'Atributo', 'Valor', 'Unidad'],
                        rows: preview.map(({ attribute, value }) => [
                          sheet.product.sku,
                          attribute.label,
                          value,
                          attribute.unit,
                        ]),
                      },
                      `vista-previa-${sheet.product.sku}.xlsx`,
                    );
                }}
              >
                <Download className="size-3.5" />
                Exportar vista previa (Excel)
              </Button>
            </div>
            {sheet ? (
              <div className="mt-3 max-h-56 overflow-auto">
                <Row label="Código del artículo">{sheet.product.sku}</Row>
                {preview.map(({ attribute, value }) => (
                  <Row key={attribute.id} label={attribute.label}>
                    {value === null
                      ? 'Sin valor'
                      : `${String(value)}${attribute.unit ? ` ${attribute.unit}` : ''}`}
                  </Row>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Selecciona un SKU con esta plantilla para consultar sus valores.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Vista previa de datos. La conexión con PrestaShop está pendiente de configuración.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

const operations = [
  {
    name: 'Listado paginado de SKU publicables',
    key: 'Página / tamaño',
    use: 'Sincronización de catálogo',
    state: 'Pendiente de conexión',
    fields: 'Identidad, marca, categoría y estado de publicación.',
  },
  {
    name: 'Detalle de producto por SKU',
    key: 'Código del artículo',
    use: 'Ficha técnica y comercial',
    state: 'Pendiente de conexión',
    fields: 'Datos base, atributos seleccionados con unidad, descripción y aplicaciones.',
  },
  {
    name: 'Medios por SKU',
    key: 'Código del artículo',
    use: 'Imágenes y documentos',
    state: 'Pendiente de conexión',
    fields: 'Imagen principal, fotografías, ficha técnica, plano y certificados registrados.',
  },
  {
    name: 'Cambios incrementales',
    key: 'Fecha de actualización',
    use: 'Sincronización eficiente',
    state: 'Por confirmar',
    fields: 'Frecuencia, mecanismo de sincronización y reintentos por definir.',
  },
];

function ConsumptionPreview({ product }: { product: CatalogWorkbookProductDto | undefined }) {
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setSheet(null);
    setMediaCount(null);
    setError(false);
    if (!product) return;
    const controller = new AbortController();
    void Promise.all([
      fetchProductAttributeSheet(product.id, controller.signal),
      listProductAssets({ productId: product.id }, controller.signal),
    ])
      .then(([detail, assets]) => {
        setSheet(detail);
        setMediaCount(assets.length);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [product]);
  if (!product)
    return (
      <p className="text-xs text-muted-foreground">
        Selecciona un SKU para consultar la vista previa.
      </p>
    );
  const readiness = publicationReadiness(product);
  const published =
    sheet?.schema.columns.filter(
      (column) => (column as PublicationAttribute).publishable !== false,
    ) ?? [];
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        Qué recibiría PrestaShop del SKU en contexto.
      </p>
      <Row label="SKU">{product.sku}</Row>
      <Row label="Estado de publicación">
        <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
      </Row>
      <Row label="Datos base">
        {product.name} · {product.brand ?? 'Sin marca'}
      </Row>
      <Row label="Atributos seleccionados">
        {sheet
          ? `${published.filter((column) => sheet.product.attributes[column.key]?.value !== null && sheet.product.attributes[column.key]?.value !== undefined && sheet.product.attributes[column.key]?.value !== '').length} de ${published.length} con valor`
          : 'Cargando…'}
      </Row>
      <Row label="Medios">{mediaCount === null ? 'Cargando…' : `${mediaCount} registrados`}</Row>
      <Row label="Descripción comercial">Sin aprobación registrada</Row>
      <Row label="Precio y stock">Gestionados en ERP</Row>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          No pudimos completar la vista previa. Vuelve a seleccionar el SKU.
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/products/${product.id}`}>Ver ficha</a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/quality?view=commercial&productId=${encodeURIComponent(product.id)}`}>
            Descripción comercial
          </a>
        </Button>
      </div>
    </>
  );
}

export function PublicationWorkspace({
  workspace,
  view,
  canManage = false,
}: {
  workspace: WorkspaceDto;
  view: PublicationView;
  canManage?: boolean;
}) {
  const [data, setData] = useState<CatalogWorkbookResultDto | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<(typeof operations)[number] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError(null);
      void fetchCatalogWorkbook(
        {
          q: query || undefined,
          page,
          pageSize: 25,
          filter: [],
          ...(filter === 'missing' ? { completeness: 'incomplete' as const } : {}),
        },
        controller.signal,
      )
        .then((result) => {
          setData(result);
          setSelectedId((id) =>
            result.items.some((item) => item.id === id) ? id : (result.items[0]?.id ?? ''),
          );
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : 'No pudimos consultar el catálogo.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, filter]);
  const selected = data?.items.find((item) => item.id === selectedId);
  const total = workspace.totalRows;
  const metric = (key: string) => workspace.metrics.find((item) => item.key === key)?.value ?? '—';
  const productPicker = (
    <Select
      label="SKU en contexto"
      value={selectedId}
      onChange={(event) => setSelectedId(event.target.value)}
    >
      <option value="">Selecciona un SKU</option>
      {data?.items.map((product) => (
        <option key={product.id} value={product.id}>
          {product.sku} · {product.brand}
        </option>
      ))}
    </Select>
  );
  const search = (
    <label className="relative block max-w-lg">
      <span className="sr-only">Buscar SKU o producto</span>
      <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Buscar SKU, marca o producto…"
        className="pl-9"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
    </label>
  );

  if (view === 'images')
    return (
      <div className="space-y-4">
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Indicadores de migración de imágenes"
        >
          {['SKU analizados', 'Con imagen', 'Pendientes', 'Errores'].map((label) => (
            <Card key={label} className="p-4">
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-xl text-slate-400">—</strong>
              <p className="mt-1 text-xs text-muted-foreground">
                Sin historial de migración disponible
              </p>
            </Card>
          ))}
        </section>
        <Panel title="Consulta de imágenes por SKU">
          <div className="space-y-3">
            {search}
            {productPicker}
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
              <ImageIcon className="size-5 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">
                  Consulta a PrestaShop pendiente de conexión
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cuando el servicio esté configurado podrás recuperar las imágenes del SKU
                  seleccionado.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <a
                    href={
                      selected
                        ? `/documents?productId=${encodeURIComponent(selected.id)}`
                        : '/documents'
                    }
                  >
                    Ver activos del SKU en PIM
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Migración de imágenes por SKU">
          <div className="overflow-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="border-b bg-slate-50">
                <tr>
                  {['Lote', 'SKU', 'Imágenes', 'Portada', 'Fecha', 'Estado', 'Acción'].map(
                    (label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Sin migraciones registradas.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );

  if (view === 'prestashop')
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Canal', 'Pendiente de conexión'],
            ['Operaciones previstas', '4'],
            ['Sincronización', 'Por confirmar'],
            ['Precio / stock', 'ERP'],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-lg">{value}</strong>
            </Card>
          ))}
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel title="Contrato funcional de consumo PIM">
            <div className="overflow-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {['Operación', 'Clave', 'Uso', 'Estado', 'Acción'].map((label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operations.map((item) => (
                    <tr key={item.name} className="border-t">
                      <th scope="row" className="p-2 text-left font-medium">
                        {item.name}
                      </th>
                      <td className="p-2">{item.key}</td>
                      <td className="p-2">{item.use}</td>
                      <td className="p-2">
                        <StatusBadge tone="warning">{item.state}</StatusBadge>
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => setOperation(item)}>
                          Detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Vista previa de consumo">
            <div className="space-y-3">
              {search}
              {productPicker}
              <ConsumptionPreview product={selected} />
            </div>
          </Panel>
        </div>
        {operation ? (
          <WorkspaceDrawer title={operation.name} onClose={() => setOperation(null)}>
            <p className="text-sm">{operation.fields}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Estado: {operation.state}. La conexión necesita configuración y validación del formato
              de intercambio.
            </p>
          </WorkspaceDrawer>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['SKU en catálogo', total],
          ['Obligatorios completos', metric('publishable')],
          ['En revisión', metric('in-review')],
          ['Publicación en canal', 'Sin evaluar'],
        ].map(([label, value]) => (
          <Card key={label} className="flex gap-3 p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-50 text-primary">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <small className="text-muted-foreground">{label}</small>
              <strong className="mt-1 block text-xl">{value}</strong>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Canales">
          {[
            ['PrestaShop', 'Pendiente de conexión'],
            ['Uso interno CDR', 'Activo'],
            ['Toma de pedidos', 'Fuera de fase'],
            ['ERP retorno', 'ERP es origen'],
          ].map(([label, state]) => (
            <Row key={label!} label={label!}>
              <StatusBadge tone={state === 'Activo' ? 'success' : 'neutral'}>{state}</StatusBadge>
            </Row>
          ))}
          <h3 className="mb-1 mt-5 text-sm font-semibold">Campos expuestos a PrestaShop</h3>
          {[
            ['Código del artículo', 'Siempre'],
            ['Marca y datos base', 'Según plantilla'],
            ['Atributos técnicos', 'Según selección'],
            ['Imágenes y documentos', 'Activos registrados'],
            ['Precio / stock', 'Gestionados en ERP'],
          ].map(([label, state]) => (
            <Row key={label!} label={label!}>
              {state}
            </Row>
          ))}
        </Panel>
        <Panel title="Publicabilidad por SKU">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filter ? 'outline' : 'dark'}
              onClick={() => {
                setFilter('');
                setPage(1);
              }}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant={filter === 'missing' ? 'dark' : 'outline'}
              onClick={() => {
                setFilter('missing');
                setPage(1);
              }}
            >
              Con faltantes obligatorios
            </Button>
          </div>
          {search}
          {error ? (
            <StatePanel variant="error" title="No pudimos cargar los SKU" description={error} />
          ) : null}
          <div className="mt-3 overflow-auto" aria-busy={busy}>
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b bg-slate-50">
                <tr>
                  {[
                    'SKU',
                    'Plantilla',
                    'Estado PIM',
                    'Publicación · PrestaShop',
                    'Razón',
                    'Acción',
                  ].map((label) => (
                    <th key={label} className="p-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.items.map((product) => {
                  const readiness = publicationReadiness(product);
                  return (
                    <tr key={product.id} className="border-b">
                      <th scope="row" className="p-2.5 text-left font-medium">
                        <a
                          className="text-primary hover:underline"
                          href={`/products/${product.id}`}
                        >
                          {product.sku}
                        </a>
                        <small className="mt-1 block text-muted-foreground">{product.brand}</small>
                      </th>
                      <td className="p-2.5">{product.template?.name ?? 'Sin plantilla'}</td>
                      <td className="p-2.5">
                        <StatusBadge tone={statusTone(product.status)}>
                          {statusLabel(product.status)}
                        </StatusBadge>
                      </td>
                      <td className="p-2.5">
                        <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
                      </td>
                      <td className="max-w-56 p-2.5 text-muted-foreground">{readiness.reason}</td>
                      <td className="p-2.5">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/quality?view=quality&productId=${product.id}`}>Ver calidad</a>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!busy && data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin SKU para estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {data?.total ?? 0} SKU · página {page}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1 || busy}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!data || page * data.pageSize >= data.total || busy}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            La completitud comprueba atributos y activos obligatorios. La aprobación y las
            condiciones específicas del canal siguen pendientes de evaluación.
          </p>
        </Panel>
      </div>
      <TemplatePublication canManage={canManage} />
    </div>
  );
}
