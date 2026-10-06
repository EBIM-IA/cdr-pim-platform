'use client';

import type { HomologSearchResultDto } from '@cdr/contracts';
import { ArrowRight, Bot, Link2, PackageSearch, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchProducts } from '@/lib/catalog-api';
import { searchEligibleHomologs } from '@/lib/operational-api';
import type { Product } from '@/lib/types';

const searchExamples = [
  '6205',
  '25 52 15',
  'D227',
  '6205-2NSE',
  'QC1672',
  'retén viton',
  'grasa calcio',
  'balata okami',
  'filtro de aceite',
] as const;

function DirectResult({ product }: { product: Product }) {
  return (
    <article className="flex min-h-[74px] flex-col gap-3 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <PackageSearch className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <Link
            href={`/products/${encodeURIComponent(product.id)}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {product.sku}
          </Link>
          <strong className="mt-1 block truncate text-sm text-cdr-ink">{product.name}</strong>
          <small className="mt-1 block text-muted-foreground">
            {[
              product.brand,
              product.category,
              product.unifiedCode && `Unificador ${product.unifiedCode}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge tone={statusTone(product.status)}>{statusLabel(product.status)}</StatusBadge>
        <Button asChild size="sm">
          <Link href={`/products/${encodeURIComponent(product.id)}`}>
            Ver ficha <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function SmartSearchWorkspace({ initialQuery = '6205' }: { initialQuery?: string } = {}) {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<Product[]>([]);
  const [homologs, setHomologs] = useState<HomologSearchResultDto[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    try {
      const [catalog, eligibleHomologs] = await Promise.all([
        fetchProducts({ q, page: 1, pageSize: 50 }),
        searchEligibleHomologs(q),
      ]);
      setProducts(catalog.items);
      setHomologs(eligibleHomologs);
      setSearchedQuery(q);
    } catch (requestError) {
      setProducts([]);
      setHomologs([]);
      setSearchedQuery(q);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible ejecutar la búsqueda.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) void runSearch(initialQuery);
  }, [initialQuery, runSearch]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    void runSearch(query);
  };

  const homologProductIds = useMemo(
    () => new Set(homologs.flatMap((result) => result.products.map((product) => product.id))),
    [homologs],
  );
  const directProductIds = useMemo(
    () => new Set(products.map((product) => product.id)),
    [products],
  );
  const totalUniqueProducts = new Set([...directProductIds, ...homologProductIds]).size;
  const found = products.length > 0 || homologs.length > 0;

  return (
    <Card className="overflow-hidden p-5 sm:p-6">
      <section aria-labelledby="smart-search-title">
        <h2 id="smart-search-title" className="text-[17px] font-semibold text-cdr-ink">
          Consulta inteligente
        </h2>
        <form onSubmit={search} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Consulta</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código, marca, categoría o código homólogo"
              autoComplete="off"
            />
          </label>
          <Button type="submit" disabled={!query.trim() || loading}>
            {loading ? 'Buscando…' : 'Buscar'}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Ejemplos de búsqueda">
          {searchExamples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void runSearch(example)}
              disabled={loading}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition disabled:opacity-50 ${
                example === searchedQuery
                  ? 'bg-orange-50 text-primary'
                  : 'bg-blue-50 text-blue-700 hover:bg-orange-50 hover:text-primary'
              }`}
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div
          className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]"
          aria-busy="true"
        >
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mt-4">
          <StatePanel
            variant="error"
            title="La búsqueda no se pudo completar"
            description={error}
            actionLabel="Reintentar"
            onAction={() => void runSearch(searchedQuery)}
          />
        </div>
      ) : null}

      {!loading && !error && !searchedQuery ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <StatePanel
            variant="empty"
            title="Escribe una consulta"
            description="La búsqueda consultará el catálogo persistido y los homólogos elegibles. No se generan productos ni coincidencias de demostración."
          />
          <Card className="border-violet-100 bg-violet-50/50 p-5 shadow-none">
            <span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-cdr-ink">Asistente de resultados</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cuando existan resultados, este panel los resumirá de forma determinista. No hay un
              proveedor generativo conectado en este entorno.
            </p>
          </Card>
        </div>
      ) : null}

      {!loading && !error && searchedQuery ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-cdr-ink">Resultados</h3>
                <p className="text-xs text-muted-foreground">
                  {totalUniqueProducts} SKU únicos para «{searchedQuery}»
                </p>
              </div>
              {homologs.length > 0 ? (
                <StatusBadge tone="info">
                  {homologs.length} homólogo{homologs.length === 1 ? '' : 's'} elegible
                  {homologs.length === 1 ? '' : 's'}
                </StatusBadge>
              ) : null}
            </div>

            {!found ? (
              <StatePanel
                variant="empty"
                title={`Sin resultados para «${searchedQuery}»`}
                description="Prueba con otro SKU, marca, descripción o código homólogo. La consulta no produce sugerencias cuando el backend no encuentra coincidencias."
                actionLabel="Limpiar búsqueda"
                onAction={() => {
                  setQuery('');
                  setSearchedQuery('');
                }}
              />
            ) : (
              <div>
                {products.map((product) => (
                  <DirectResult key={product.id} product={product} />
                ))}
                {homologs.map((result) => (
                  <section
                    key={result.homolog.id}
                    className="border-b bg-blue-50/40 p-4 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link2 className="size-4 text-blue-700" aria-hidden="true" />
                      <strong className="font-mono text-sm">{result.homolog.externalCode}</strong>
                      <StatusBadge tone="info">{result.homolog.externalBrand}</StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        Homólogo aprobado · unificador {result.homolog.unifiedCode}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {result.products.map((product) => (
                        <Link
                          key={product.id}
                          href={`/products/${encodeURIComponent(product.id)}`}
                          className="rounded-lg border bg-white p-3 text-sm transition hover:border-orange-200 hover:bg-orange-50"
                        >
                          <strong className="block font-mono text-primary">{product.sku}</strong>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {product.brand ?? 'Sin marca'} · {product.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <Card className="h-fit bg-slate-50 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-violet-100 text-violet-700">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-cdr-ink">Asistente IA</h3>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Resumen de «{searchedQuery}» basado solo en los resultados visibles.
            </p>
            {found ? (
              <p className="mt-5 rounded-xl bg-cdr-ink p-4 text-sm leading-relaxed text-white">
                La API encontró {products.length} coincidencia{products.length === 1 ? '' : 's'}{' '}
                directa{products.length === 1 ? '' : 's'} y {homologs.length} grupo
                {homologs.length === 1 ? '' : 's'} por homólogo, con {totalUniqueProducts} SKU único
                {totalUniqueProducts === 1 ? '' : 's'} relacionado
                {totalUniqueProducts === 1 ? '' : 's'}.
              </p>
            ) : (
              <p className="mt-5 rounded-xl bg-cdr-ink p-4 text-sm leading-relaxed text-white">
                No hay productos que resumir. El sistema no recomendará alternativas sin una
                relación activa y aprobada en el backend.
              </p>
            )}
            <p className="mt-4 border-t border-violet-100 pt-4 text-xs leading-relaxed text-muted-foreground">
              Este resumen se calcula exclusivamente con la respuesta visible. La generación
              conversacional permanece deshabilitada hasta contar con proveedor, evidencia y
              política de auditoría.
            </p>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
