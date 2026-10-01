'use client';

import { ArrowRight, CheckCircle2, Layers3, Package, SearchCheck, Tags } from 'lucide-react';
import Link from 'next/link';

import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsData } from '@/components/use-products-data';
import { formatNumber } from '@/lib/utils';

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando resumen del catálogo">
      <span className="sr-only" role="status">
        Cargando indicadores…
      </span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function DashboardOverview() {
  const { products, total, loading, error, reload } = useProductsData({
    page: 1,
    pageSize: 100,
  });

  const published = products.filter((product) => product.status === 'published').length;
  const inReview = products.filter((product) => product.status === 'in_review').length;
  const brands = new Set(products.map((product) => product.brand)).size;
  const statusGroups = Object.entries(
    products.reduce<Record<string, number>>((counts, product) => {
      counts[product.status] = (counts[product.status] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
  const brandGroups = Object.entries(
    products.reduce<Record<string, number>>((counts, product) => {
      counts[product.brand] = (counts[product.brand] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const maximumBrandCount = Math.max(...brandGroups.map(([, count]) => count), 1);

  return (
    <>
      <PageHeader
        eyebrow="Operación del catálogo"
        title="Catálogo maestro"
        description="Una vista rápida de los productos, estados y marcas que entrega el contrato actual."
        actions={
          <Button asChild>
            <Link href="/products">
              Explorar productos
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        }
      />

      <ScreenGuide
        objective="Resume el catálogo disponible para orientar la revisión diaria sin inferir métricas de calidad aún no aprobadas."
        actions={[
          'Abre cada indicador operativo para llegar al catálogo con el estado correspondiente.',
          'Consulta la distribución de estados entregada por la API.',
          'Abre cualquier producto de la consulta para revisar su ficha.',
        ]}
        dataSource="Productos, marcas, estados, totales y fechas proceden del contrato compartido de la API."
        limitation="Categorías, aplicaciones, código unificador y puntajes de calidad no se calculan porque el contrato actual no entrega esos datos. Las reglas confirmadas se presentan como alcance, no como métricas operativas."
      />

      {loading ? <DashboardSkeleton /> : null}
      {!loading && error ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar los indicadores"
          description={error}
          actionLabel="Reintentar"
          onAction={reload}
        />
      ) : null}
      {!loading && !error && products.length === 0 ? (
        <StatePanel
          variant="empty"
          title="El catálogo todavía está vacío"
          description="Cuando la API publique productos, sus indicadores y actividad aparecerán aquí."
        />
      ) : null}

      {!loading && !error && products.length > 0 ? (
        <div className="space-y-5">
          <section
            aria-label="Indicadores principales"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              label="Productos registrados"
              value={formatNumber(total || products.length)}
              note="Total informado por la API"
              icon={Package}
              href="/products"
            />
            <MetricCard
              label="Publicados"
              value={formatNumber(published)}
              note="En la consulta actual"
              icon={CheckCircle2}
              tone="green"
              href="/products?status=published"
            />
            <MetricCard
              label="En revisión"
              value={formatNumber(inReview)}
              note="En la consulta actual"
              icon={SearchCheck}
              tone="blue"
              href="/products?status=in_review"
            />
            <MetricCard
              label="Marcas visibles"
              value={formatNumber(brands)}
              note="Sin duplicados en la consulta"
              icon={Tags}
              tone="orange"
              href="/products"
            />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribución por estado</CardTitle>
                <CardDescription>Estados reales de los productos consultados.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {statusGroups.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
                    <strong className="tabular-nums">{formatNumber(count)}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Productos por marca</CardTitle>
                <CardDescription>Principales marcas de la consulta actual.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {brandGroups.map(([brand, count]) => (
                  <div
                    key={brand}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
                  >
                    <span className="truncate text-sm font-semibold" title={brand}>
                      {brand}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                    <span className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(8, (count / maximumBrandCount) * 100)}%` }}
                      />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Productos de la consulta</CardTitle>
                <CardDescription>
                  Primeros registros de la página, ordenados por SKU por el servicio de catálogo.
                </CardDescription>
              </div>
              <Layers3 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="divide-y" role="list">
                {products.slice(0, 6).map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${encodeURIComponent(product.id)}`}
                    className="group grid min-w-0 gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink focus-visible:ring-offset-2"
                    role="listitem"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-sm group-hover:text-primary">
                        {product.name}
                      </strong>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {product.sku} · {product.brand}
                      </span>
                    </span>
                    <StatusBadge tone={statusTone(product.status)}>
                      {statusLabel(product.status)}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground sm:text-right">
                      {formatDate(product.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
