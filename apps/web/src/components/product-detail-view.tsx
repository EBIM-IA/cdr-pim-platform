'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FileText,
  History,
  Link2,
  PackageCheck,
  Ruler,
} from 'lucide-react';

import { ProductArtwork } from '@/components/product-artwork';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogApiError, fetchProduct } from '@/lib/catalog-api';
import type { Product } from '@/lib/types';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';
import { cn } from '@/lib/utils';

type DetailTab =
  'technical' | 'applications' | 'equivalences' | 'documents' | 'sources' | 'history';

const tabs: Array<{ id: DetailTab; label: string; icon: typeof Database }> = [
  { id: 'technical', label: 'Información técnica', icon: Database },
  { id: 'applications', label: 'Aplicaciones', icon: PackageCheck },
  { id: 'equivalences', label: 'Equivalencias', icon: Link2 },
  { id: 'documents', label: 'Imágenes y documentos', icon: FileText },
  { id: 'sources', label: 'Fuentes', icon: Database },
  { id: 'history', label: 'Historial', icon: History },
];

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando ficha del producto">
      <span className="sr-only" role="status">
        Cargando ficha técnica…
      </span>
      <Skeleton className="mb-5 h-5 w-48" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_320px]">
        <Skeleton className="aspect-[4/3] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
      <Skeleton className="mt-5 h-80 rounded-xl" />
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function TechnicalPanel({
  product,
  unitSystem,
  onUnitSystemChange,
}: {
  product: Product;
  unitSystem: MeasurementSystem;
  onUnitSystemChange: (system: MeasurementSystem) => void;
}) {
  if (product.attributes.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin atributos técnicos"
        description="El producto existe, pero la API todavía no entrega atributos enriquecidos para esta ficha."
      />
    );
  }

  const convertibleAttributes = product.attributes.filter((attribute) =>
    Boolean(
      displayMeasurement(
        attribute.rawValue,
        { unit: attribute.unit, attributeKey: attribute.key },
        unitSystem,
      )?.secondary,
    ),
  ).length;

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Datos técnicos e identificadores</CardTitle>
          <CardDescription>
            {product.attributes.length} valores entregados por el contrato actual.
          </CardDescription>
        </div>
        {convertibleAttributes > 0 ? (
          <div className="min-w-0 rounded-lg border bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cdr-ink">
              <Ruler aria-hidden="true" className="size-4 text-primary" />
              Sistema de unidades
            </div>
            <div
              className="grid grid-cols-2 rounded-md bg-slate-200 p-1"
              role="group"
              aria-label="Ver medidas en"
            >
              {(
                [
                  ['metric', 'Métrico'],
                  ['imperial', 'Imperial'],
                ] as const
              ).map(([system, label]) => (
                <button
                  key={system}
                  type="button"
                  aria-pressed={unitSystem === system}
                  onClick={() => onUnitSystemChange(system)}
                  className={cn(
                    'rounded px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink',
                    unitSystem === system
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 max-w-64 text-[11px] leading-relaxed text-muted-foreground">
              {convertibleAttributes > 0
                ? `${convertibleAttributes} valores convertibles. El valor registrado no se modifica.`
                : 'Este SKU no contiene unidades convertibles.'}
            </p>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
          {product.attributes.map((attribute) => {
            const measurement = displayMeasurement(
              attribute.rawValue,
              { unit: attribute.unit, attributeKey: attribute.key },
              unitSystem,
            );
            const fallbackUnit =
              attribute.unit && typeof attribute.rawValue !== 'string' ? ` ${attribute.unit}` : '';

            return (
              <div key={attribute.key} className="min-w-0 border-b py-4 first:pt-0">
                <dt className="text-xs leading-relaxed text-muted-foreground">{attribute.label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold">
                  {measurement ? measurement.primary.text : `${attribute.value}${fallbackUnit}`}
                </dd>
                {measurement?.secondary ? (
                  <dd className="mt-1 break-words text-xs text-muted-foreground">
                    {measurement.secondary.registered ? 'Registrado' : 'Equivalente'}:{' '}
                    {measurement.secondary.text}
                  </dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

function ApplicationsPanel({ product }: { product: Product }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Aplicación principal</CardTitle>
          <CardDescription>
            El contrato actual del catálogo todavía no expone aplicaciones por producto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex rounded-full bg-orange-100 px-3 py-1.5 text-sm font-semibold text-orange-700">
            {product.application}
          </span>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Las aplicaciones específicas por vehículo o equipo se compartirán y heredarán entre los
            SKU que tengan el mismo código unificador. El contrato actual todavía no entrega ese
            listado.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Alcance de la herencia</CardTitle>
          <CardDescription>
            Identificador que determina el grupo de aplicaciones compartidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Código unificador</dt>
              <dd className="mt-1 break-all font-semibold">
                {product.unifiedCode ?? 'No expuesto por el contrato'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            {product.unifiedCode
              ? 'Los SKU de este grupo compartirán el mismo conjunto de aplicaciones cuando el backend publique la relación.'
              : 'El contrato actual no permite verificar todavía el código unificador de este SKU.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EquivalencesPanel({ product }: { product: Product }) {
  const codes = [
    { label: 'Código unificador', value: product.unifiedCode },
    { label: 'Código de fabricante', value: product.providerCode },
    { label: 'Código de artículo', value: product.sku },
  ].filter((item) => item.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identificadores relacionados</CardTitle>
        <CardDescription>
          El código unificador agrupa referencias sin fusionar cada ficha ni su aprobación
          individual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {codes.map((item) => (
            <div key={item.label} className="rounded-lg border bg-slate-50 p-4">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <strong className="mt-1 block break-all text-sm">{item.value}</strong>
            </div>
          ))}
        </div>
        {!product.unifiedCode ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            El código unificador no está expuesto por el contrato actual del catálogo.
          </p>
        ) : null}
        <p className="mt-4 rounded-lg bg-slate-100 p-4 text-sm leading-relaxed text-slate-700">
          Un homólogo será una referencia externa —código y marca— asociada al grupo, no un SKU
          vendible creado en el maestro. Buscar una relación activa y aprobada devolverá los SKU
          vendibles del grupo; el contrato actual aún no entrega esas relaciones ni su aprobación.
        </p>
      </CardContent>
    </Card>
  );
}

function DocumentsPanel({ product }: { product: Product }) {
  const documents = product.attributes.filter((attribute) =>
    /ficha|plano|document|archivo|fotograf/i.test(attribute.key),
  );

  if (documents.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin documentos asociados"
        description="No se recibieron fichas, planos ni archivos técnicos en la respuesta actual de la API."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activos documentales</CardTitle>
        <CardDescription>Referencias entregadas como atributos del producto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.map((document) => (
          <div key={document.key} className="flex min-w-0 items-start gap-3 rounded-lg border p-4">
            <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <strong className="block text-sm">{document.label}</strong>
              <span className="mt-1 block break-all text-xs text-muted-foreground">
                {document.value}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SourcesPanel({ product }: { product: Product }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Procedencia de la ficha</CardTitle>
        <CardDescription>Evidencia disponible en el contrato actual para este SKU.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">Fuente</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {product.source ?? 'No informada'}
            </dd>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">Referencia</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {product.sourceReference ?? 'Sin referencia registrada'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          La trazabilidad por atributo se habilitará cuando la API entregue procedencia y versión
          para cada valor.
        </p>
      </CardContent>
    </Card>
  );
}

function HistoryPanel({ product }: { product: Product }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial disponible</CardTitle>
        <CardDescription>
          El contrato actual informa el último cambio, no una bitácora completa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 rounded-lg border p-4">
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-orange-100 text-primary"
          >
            <History className="size-4" />
          </span>
          <div className="min-w-0">
            <strong className="block text-sm">Última actualización registrada</strong>
            <span className="mt-1 block text-sm text-muted-foreground">
              {formatDate(product.updatedAt)}
            </span>
            <span className="mt-2 block break-words text-xs text-muted-foreground">
              Fuente: {product.source ?? 'No informada'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductDetailView({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>('technical');
  const [unitSystem, setUnitSystem] = useState<MeasurementSystem>('metric');

  useEffect(() => {
    const controller = new AbortController();
    void fetchProduct(productId, controller.signal)
      .then(setProduct)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setError(
          requestError instanceof CatalogApiError && requestError.status === 404
            ? 'No encontramos el producto solicitado.'
            : requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el producto.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, revision]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setProduct(null);
    setRevision((value) => value + 1);
  };

  const panel = useMemo(() => {
    if (!product) return null;
    if (activeTab === 'applications') return <ApplicationsPanel product={product} />;
    if (activeTab === 'equivalences') return <EquivalencesPanel product={product} />;
    if (activeTab === 'documents') return <DocumentsPanel product={product} />;
    if (activeTab === 'sources') return <SourcesPanel product={product} />;
    if (activeTab === 'history') return <HistoryPanel product={product} />;
    return (
      <TechnicalPanel
        product={product}
        unitSystem={unitSystem}
        onUnitSystemChange={setUnitSystem}
      />
    );
  }, [activeTab, product, unitSystem]);

  if (loading) return <DetailSkeleton />;
  if (error || !product) {
    return (
      <>
        <Button asChild variant="ghost" className="mb-5 -ml-3">
          <Link href="/products">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Volver a productos
          </Link>
        </Button>
        <StatePanel
          variant="error"
          title="No pudimos mostrar esta ficha"
          description={error ?? 'El producto solicitado no está disponible.'}
          actionLabel="Reintentar"
          onAction={reload}
        />
      </>
    );
  }

  return (
    <>
      <nav
        aria-label="Migas de pan"
        className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        <Link
          href="/products"
          className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        >
          Productos
        </Link>
        <span aria-hidden="true">/</span>
        <span className="max-w-full truncate text-foreground" aria-current="page">
          {product.sku}
        </span>
      </nav>

      <ScreenGuide
        objective="Reúne identidad, códigos y procedencia del producto para revisar la información disponible hoy."
        actions={[
          'Consulta las seis secciones para separar información técnica, relaciones, activos, fuentes e historial.',
          'Alterna entre métrico e imperial sin cambiar el valor registrado por la fuente.',
          'Vuelve al catálogo para continuar la consulta de otros productos.',
        ]}
        dataSource="La identidad, los identificadores, el estado y las fechas se obtienen del detalle publicado por la API del catálogo."
        limitation="El contrato actual solo entrega la última actualización y procedencia general. Las aplicaciones heredadas por código unificador, los homólogos activos y aprobados, los activos documentales y la trazabilidad por atributo requieren los próximos contratos del backend."
      />

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_320px]">
        <Card className="overflow-hidden p-3 sm:p-4">
          <ProductArtwork
            category={product.category}
            name={product.name}
            className="h-full min-h-64"
          />
        </Card>

        <div className="min-w-0 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(product.status)}>
              {statusLabel(product.status)}
            </StatusBadge>
            {product.templateKey ? (
              <StatusBadge tone="neutral">{product.templateKey}</StatusBadge>
            ) : null}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {product.sku}
          </p>
          <h1 className="mt-1 break-words text-3xl font-semibold leading-tight tracking-[-0.035em] text-cdr-ink sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            {product.description ??
              'Ficha maestra preparada para consolidar información técnica, comercial y documental del producto.'}
          </p>

          <dl className="mt-7 grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
            {[
              ['Marca', product.brand],
              ['Aplicación', product.application],
              ['Línea / categoría', product.category],
              ['Dimensiones', product.dimensions ?? 'Según atributos técnicos'],
              ['Código fabricante', product.providerCode ?? 'No disponible'],
              ['Código unificador', product.unifiedCode ?? 'No expuesto por el contrato'],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Card className="h-fit border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Control PIM</CardTitle>
              <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
            </div>
            <CardDescription>Estado y procedencia de la ficha.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">Calidad</span>
                <strong>
                  {product.completeness === null ? 'Regla pendiente' : `${product.completeness}%`}
                </strong>
              </div>
              {product.completeness === null ? (
                <p className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-muted-foreground">
                  El backend todavía no publica un puntaje de calidad aprobado.
                </p>
              ) : (
                <Progress value={product.completeness} label={`Completitud de ${product.sku}`} />
              )}
            </div>
            <dl className="space-y-4 border-y py-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd className="mt-1 font-semibold">{statusLabel(product.status)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fuente</dt>
                <dd className="mt-1 break-words font-semibold">
                  {product.source ?? 'No informada'}
                </dd>
              </div>
              {product.sourceReference ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Referencia</dt>
                  <dd className="mt-1 break-words font-semibold">{product.sourceReference}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Actualización</dt>
                <dd className="mt-1 font-semibold">{formatDate(product.updatedAt)}</dd>
              </div>
            </dl>
            <Button asChild variant="dark" className="w-full">
              <Link href="/products">
                <ArrowLeft aria-hidden="true" className="size-4" />
                Volver al catálogo
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 min-w-0" aria-label="Detalle complementario">
        <div
          className="scrollbar-thin overflow-x-auto border-b"
          role="tablist"
          aria-label="Secciones de la ficha"
        >
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  aria-selected={active}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => {
                    const currentIndex = tabs.findIndex((item) => item.id === tab.id);
                    let targetIndex: number | null = null;

                    if (event.key === 'ArrowRight') {
                      targetIndex = (currentIndex + 1) % tabs.length;
                    } else if (event.key === 'ArrowLeft') {
                      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                    } else if (event.key === 'Home') {
                      targetIndex = 0;
                    } else if (event.key === 'End') {
                      targetIndex = tabs.length - 1;
                    }

                    if (targetIndex === null) return;
                    event.preventDefault();
                    const target = tabs[targetIndex];
                    if (!target) return;
                    setActiveTab(target.id);
                    requestAnimationFrame(() =>
                      document.getElementById(`tab-${target.id}`)?.focus(),
                    );
                  }}
                  className={cn(
                    'flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cdr-ink',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="mt-5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        >
          {panel}
        </div>
      </section>
    </>
  );
}
