'use client';

import type {
  HomologSearchResultDto,
  OemSearchResultDto,
  ParsedCodeSegmentDto,
  ParsedProductCodeDto,
  SemanticSearchResponse,
} from '@cdr/contracts';
import { ArrowRight, Bot, Link2, PackageSearch, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchProducts } from '@/lib/catalog-api';
import { parseCode } from '@/lib/code-affix-api';
import { searchEligibleHomologs, searchEligibleOemCodes } from '@/lib/operational-api';
import { semanticSearch } from '@/lib/search-api';
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

type SemanticHit = SemanticSearchResponse['hits'][number];

function usefulCodeSegments(parsed: ParsedProductCodeDto | null): ParsedCodeSegmentDto[] {
  if (!parsed) return [];
  return parsed.segments.filter(
    (segment) => segment.ruleId !== null || segment.boreMillimeters !== null,
  );
}

/**
 * Validated affix knowledge may improve recall, but it never creates a result by itself. The
 * inferred terms only enrich the vector query; every rendered SKU still comes from a backend
 * catalogue or approved relation response.
 */
function semanticQueryFromInterpretation(query: string, parsed: ParsedProductCodeDto | null) {
  const knowledge = usefulCodeSegments(parsed)
    .flatMap((segment) => [
      segment.meaning,
      segment.attribute,
      segment.impliedValue,
      segment.boreMillimeters === null ? null : `diámetro ${segment.boreMillimeters} mm`,
    ])
    .filter((value): value is string => Boolean(value));
  return [...new Set([query, ...knowledge])].join(' ').slice(0, 500);
}

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

function SemanticResult({ hit }: { hit: SemanticHit }) {
  return (
    <article className="flex min-h-[74px] flex-col gap-3 border-b bg-violet-50/40 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <Link
            href={`/products/${encodeURIComponent(hit.productId)}`}
            className="font-mono text-sm font-bold text-primary hover:underline"
          >
            {hit.sku}
          </Link>
          <strong className="mt-1 block truncate text-sm text-cdr-ink">{hit.name}</strong>
          <small className="mt-1 block text-muted-foreground">
            Coincidencia semántica · {Math.round(hit.score * 100)}% de similitud vectorial
          </small>
        </span>
      </div>
      <Button asChild size="sm">
        <Link href={`/products/${encodeURIComponent(hit.productId)}`}>
          Ver ficha <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}

export function SmartSearchWorkspace({ initialQuery = '6205' }: { initialQuery?: string } = {}) {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<Product[]>([]);
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [homologs, setHomologs] = useState<HomologSearchResultDto[]>([]);
  const [oemCodes, setOemCodes] = useState<OemSearchResultDto[]>([]);
  const [interpretation, setInterpretation] = useState<ParsedProductCodeDto | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const runSearch = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (q.length < 2) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      // Affix parsing is an optional enrichment. A parser outage must not hide valid catalogue,
      // semantic, homolog or OEM results.
      const parsedCode = await parseCode({ code: q }).catch(() => null);
      const semanticQuery = semanticQueryFromInterpretation(q, parsedCode);
      const [catalog, semantic, eligibleHomologs, eligibleOemCodes] = await Promise.allSettled([
        fetchProducts({ q, page: 1, pageSize: 50 }),
        semanticSearch(semanticQuery, 20),
        searchEligibleHomologs(q),
        searchEligibleOemCodes(q),
      ]);
      const results = [catalog, semantic, eligibleHomologs, eligibleOemCodes];
      if (results.every((result) => result.status === 'rejected')) {
        throw (results[0] as PromiseRejectedResult).reason;
      }
      setProducts(catalog.status === 'fulfilled' ? catalog.value.items : []);
      setSemanticHits(
        semantic.status === 'fulfilled' ? semantic.value.hits.filter((hit) => hit.score > 0) : [],
      );
      setHomologs(eligibleHomologs.status === 'fulfilled' ? eligibleHomologs.value : []);
      setOemCodes(eligibleOemCodes.status === 'fulfilled' ? eligibleOemCodes.value : []);
      setInterpretation(parsedCode);
      setSearchedQuery(q);
      const unavailable = [
        catalog.status === 'rejected' ? 'catálogo directo' : null,
        semantic.status === 'rejected' ? 'índice semántico' : null,
        eligibleHomologs.status === 'rejected' ? 'homólogos' : null,
        eligibleOemCodes.status === 'rejected' ? 'códigos OEM' : null,
      ].filter((source): source is string => source !== null);
      if (unavailable.length > 0) {
        setWarning(
          `Resultados parciales: no fue posible consultar ${unavailable.join(', ')}. Las demás fuentes siguen disponibles.`,
        );
      }
    } catch (requestError) {
      setProducts([]);
      setSemanticHits([]);
      setHomologs([]);
      setOemCodes([]);
      setInterpretation(null);
      setSearchedQuery(q);
      setWarning(null);
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
  const visibleSemanticHits = useMemo(() => {
    const seen = new Set(directProductIds);
    return semanticHits.filter((hit) => {
      if (seen.has(hit.productId)) return false;
      seen.add(hit.productId);
      return true;
    });
  }, [directProductIds, semanticHits]);
  const semanticProductIds = useMemo(
    () => new Set(visibleSemanticHits.map((hit) => hit.productId)),
    [visibleSemanticHits],
  );
  const visibleHomologs = useMemo(() => {
    const seen = new Set([...directProductIds, ...semanticProductIds]);
    return homologs.map((result) => ({
      ...result,
      products: result.products.filter((product) => {
        if (seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
      }),
    }));
  }, [directProductIds, homologs, semanticProductIds]);
  const visibleOemCodes = useMemo(() => {
    const seen = new Set([
      ...directProductIds,
      ...semanticProductIds,
      ...homologs.flatMap((result) => result.products.map((product) => product.id)),
    ]);
    return oemCodes.map((result) => ({
      ...result,
      products: result.products.filter((product) => {
        if (seen.has(product.id)) return false;
        seen.add(product.id);
        return true;
      }),
    }));
  }, [directProductIds, homologs, oemCodes, semanticProductIds]);
  const oemProductIds = useMemo(
    () => new Set(oemCodes.flatMap((result) => result.products.map((product) => product.id))),
    [oemCodes],
  );
  const totalUniqueProducts = new Set([
    ...directProductIds,
    ...semanticProductIds,
    ...homologProductIds,
    ...oemProductIds,
  ]).size;
  const found =
    products.length > 0 ||
    visibleSemanticHits.length > 0 ||
    homologs.length > 0 ||
    oemCodes.length > 0;
  const interpretedSegments = usefulCodeSegments(interpretation);

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
              placeholder="Código, marca, categoría, homólogo u OEM"
              autoComplete="off"
              minLength={2}
              maxLength={300}
            />
          </label>
          <Button type="submit" disabled={query.trim().length < 2 || loading}>
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

      {!loading && !error && warning ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {warning}
        </p>
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
            description="La búsqueda consultará el catálogo persistido, el índice semántico y solo homólogos/OEM activos y aprobados. No genera productos ni coincidencias ficticias."
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
        <div className="mt-4 space-y-4">
          {interpretedSegments.length > 0 ? (
            <aside className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-cdr-ink">Interpretación del código</strong>
                <span className="font-mono text-xs text-primary">
                  {interpretation?.normalizedCode}
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Segmentos interpretados">
                {interpretedSegments.map((segment, index) => (
                  <li
                    key={`${segment.kind}:${segment.text}:${segment.ruleId ?? index}`}
                    className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs text-muted-foreground"
                  >
                    <span className="font-mono font-semibold text-cdr-ink">{segment.text}</span>
                    {' · '}
                    {segment.meaning ??
                      (segment.boreMillimeters === null
                        ? segment.kind
                        : `diámetro ${segment.boreMillimeters} mm`)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                La interpretación validada enriqueció la consulta semántica; no creó SKU ni
                relaciones nuevas.
              </p>
            </aside>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
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
                {oemCodes.length > 0 ? (
                  <StatusBadge tone="success">
                    {oemCodes.length} OEM elegible{oemCodes.length === 1 ? '' : 's'}
                  </StatusBadge>
                ) : null}
              </div>

              {!found ? (
                <StatePanel
                  variant="empty"
                  title={`Sin resultados para «${searchedQuery}»`}
                  description="Prueba con otro SKU, marca, descripción, homólogo o código OEM. La consulta no produce sugerencias cuando el backend no encuentra coincidencias."
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
                  {visibleSemanticHits.map((hit) => (
                    <SemanticResult key={hit.productId} hit={hit} />
                  ))}
                  {visibleHomologs.map((result) => (
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
                        {result.products.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Los SKU vinculados ya aparecen una sola vez entre los resultados
                            anteriores.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  ))}
                  {visibleOemCodes.map((result) => (
                    <section
                      key={result.oem.id}
                      className="border-b bg-emerald-50/40 p-4 last:border-b-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Link2 className="size-4 text-emerald-700" aria-hidden="true" />
                        <strong className="font-mono text-sm">{result.oem.oemCode}</strong>
                        {result.oem.brands.map((brand) => (
                          <StatusBadge key={brand} tone="success">
                            {brand}
                          </StatusBadge>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          OEM aprobado · unificador {result.oem.unifiedCode}
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
                        {result.products.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Los SKU vinculados ya aparecen una sola vez entre los resultados
                            anteriores.
                          </p>
                        ) : null}
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
                  directa{products.length === 1 ? '' : 's'}, {visibleSemanticHits.length} semántica
                  {visibleSemanticHits.length === 1 ? '' : 's'}, {homologs.length} grupo
                  {homologs.length === 1 ? '' : 's'} por homólogo y {oemCodes.length} grupo
                  {oemCodes.length === 1 ? '' : 's'} por OEM, con {totalUniqueProducts} SKU único
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
        </div>
      ) : null}
    </Card>
  );
}
