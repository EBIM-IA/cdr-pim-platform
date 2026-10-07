'use client';

import type {
  AdminCatalogCategoryDto,
  AiCommercialProposalResponse,
  AiExtractionCandidatesResponse,
  CatalogAttributeValue,
  CatalogGridColumnDto,
  CategorySourcePriorityDto,
  ProductAssetDto,
  ProductAttributeSheetDto,
  WorkspaceAction,
  WorkspaceDto,
} from '@cdr/contracts';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCopy,
  Database,
  ExternalLink,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  Layers3,
  ListChecks,
  LoaderCircle,
  PackageSearch,
  ScanSearch,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { extractAssetCandidates, generateCommercialProposal } from '@/lib/ai-api';
import { listAdminCategories } from '@/lib/catalog-admin-api';
import { fetchProducts } from '@/lib/catalog-api';
import { fetchProductAttributeSheet, patchProductAttributes } from '@/lib/dynamic-catalog-api';
import { listProductAssets, productAssetDownloadUrl } from '@/lib/product-assets-api';
import type { Product } from '@/lib/types';

export type QualitySecondaryView =
  'extraction' | 'commercial' | 'duplicates' | 'review' | 'sources' | 'conflict';

export interface QualitySecondaryWorkspaceProps {
  view: QualitySecondaryView;
  workspace: WorkspaceDto;
}

function blockedActions(
  workspace: WorkspaceDto,
): Extract<WorkspaceAction, { availability: 'blocked' }>[] {
  return workspace.actions.filter(
    (action): action is Extract<WorkspaceAction, { availability: 'blocked' }> =>
      action.availability === 'blocked',
  );
}

function BlockingNotice({
  workspace,
  title,
  fallback,
  actionId,
}: {
  workspace: WorkspaceDto;
  title: string;
  fallback: string;
  actionId?: string;
}) {
  const reasons = blockedActions(workspace);
  const actionReason = actionId
    ? reasons.find((action) => action.id === actionId)?.reason
    : undefined;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <strong className="text-sm">{title}</strong>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
            {actionReason ?? reasons[0]?.reason ?? fallback}
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  number,
  title,
  description,
  active = false,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
          active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {number}
      </span>
      <span>
        <strong className="block text-sm text-cdr-ink">{title}</strong>
        <small className="mt-0.5 block leading-relaxed text-muted-foreground">{description}</small>
      </span>
    </li>
  );
}

function EmptyMetric({ label, note }: { label: string; note: string }) {
  return (
    <Card className="min-h-28 p-4">
      <small className="text-muted-foreground">{label}</small>
      <strong className="mt-2 block text-2xl text-slate-400">—</strong>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function supportedAction(workspace: WorkspaceDto, actionId: string): boolean {
  return workspace.actions.some(
    (action) => action.id === actionId && action.availability === 'supported',
  );
}

function ProductSelector({
  idPrefix,
  selected,
  onSelect,
  disabled = false,
}: {
  idPrefix: string;
  selected: Product | null;
  onSelect: (product: Product | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadProducts = useCallback((searchQuery: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    void fetchProducts(
      { ...(searchQuery ? { q: searchQuery } : {}), page: 1, pageSize: 25 },
      controller.signal,
    )
      .then((result) => {
        if (requestRef.current === controller) setProducts(result.items);
      })
      .catch((requestError: unknown) => {
        if (requestRef.current !== controller || isAbortError(requestError)) return;
        setError(
          requestError instanceof Error ? requestError.message : 'No fue posible buscar productos.',
        );
      })
      .finally(() => {
        if (requestRef.current === controller) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!disabled) loadProducts('');
    return () => requestRef.current?.abort();
  }, [disabled, loadProducts]);

  const options = selected
    ? [selected, ...products.filter((product) => product.id !== selected.id)]
    : products;

  return (
    <Card className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(280px,1fr)] lg:items-end">
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          loadProducts(query.trim());
        }}
        role="search"
      >
        <label className="min-w-0 flex-1 text-[10px] font-semibold text-muted-foreground">
          Buscar SKU o descripción
          <Input
            id={`${idPrefix}-query`}
            className="mt-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. 6202, rodamiento…"
            disabled={disabled}
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          className="mt-5"
          disabled={disabled || loading}
          aria-label="Buscar productos"
        >
          {loading ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          Buscar
        </Button>
      </form>
      <label className="min-w-0 text-[10px] font-semibold text-muted-foreground">
        Producto real del catálogo
        <select
          id={`${idPrefix}-product`}
          aria-label="Producto real del catálogo"
          className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-cdr-ink disabled:opacity-50"
          value={selected?.id ?? ''}
          onChange={(event) =>
            onSelect(options.find((product) => product.id === event.target.value) ?? null)
          }
          disabled={disabled || loading || options.length === 0}
        >
          <option value="">Selecciona un producto</option>
          {options.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} · {product.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block min-h-4 text-xs" aria-live="polite">
          {error ??
            (loading
              ? 'Consultando catálogo…'
              : `${products.length} productos disponibles en esta búsqueda.`)}
        </span>
      </label>
    </Card>
  );
}

function ExtractionWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  const canExecute = supportedAction(workspace, 'extract-asset-candidates');
  const [product, setProduct] = useState<Product | null>(null);
  const [assets, setAssets] = useState<ProductAssetDto[]>([]);
  const [sheet, setSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [result, setResult] = useState<AiExtractionCandidatesResponse | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, boolean>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const extractionRef = useRef<AbortController | null>(null);
  const saveRef = useRef<AbortController | null>(null);

  useEffect(() => {
    extractionRef.current?.abort();
    saveRef.current?.abort();
    setAssets([]);
    setSheet(null);
    setSelectedAssetId('');
    setResult(null);
    setSelectedCandidates({});
    setContextError(null);
    setExtractError(null);
    setSaveError(null);
    setSaveNotice(null);
    setContextLoading(Boolean(product));
    if (!product) return;

    const controller = new AbortController();
    void Promise.all([
      listProductAssets({ productId: product.id }, controller.signal),
      fetchProductAttributeSheet(product.id, controller.signal),
    ])
      .then(([productAssets, productSheet]) => {
        if (controller.signal.aborted) return;
        const extractableAssets = productAssets.filter((asset) =>
          EXTRACTABLE_ASSET_MIME_TYPES.has(asset.mimeType),
        );
        setAssets(extractableAssets);
        setSheet(productSheet);
        setSelectedAssetId(extractableAssets[0]?.id ?? '');
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setContextError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible cargar los documentos y atributos del producto.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, [product]);

  useEffect(
    () => () => {
      extractionRef.current?.abort();
      saveRef.current?.abort();
    },
    [],
  );

  const editableDefinitions = useMemo(
    () =>
      (sheet?.schema.columns ?? []).filter(
        (column) => column.permissions.edit && column.sourceAuthority === 'pim',
      ),
    [sheet],
  );
  const expectedDefinitions = editableDefinitions.slice(0, 100);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  const runExtraction = async () => {
    if (!selectedAsset) return;
    extractionRef.current?.abort();
    const controller = new AbortController();
    extractionRef.current = controller;
    setExtracting(true);
    setExtractError(null);
    setSaveError(null);
    setSaveNotice(null);
    setResult(null);
    try {
      const response = await extractAssetCandidates(
        selectedAsset.id,
        { expectedAttributes: expectedDefinitions.map((definition) => definition.key) },
        controller.signal,
      );
      if (extractionRef.current !== controller) return;
      setResult(response);
      setSelectedCandidates(
        Object.fromEntries(response.candidates.map((candidate) => [candidate.key, true])),
      );
    } catch (requestError) {
      if (isAbortError(requestError) || extractionRef.current !== controller) return;
      setExtractError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible extraer candidatos del documento.',
      );
    } finally {
      if (extractionRef.current === controller) setExtracting(false);
    }
  };

  const applyCandidates = async () => {
    if (!product || !sheet || !result) return;
    const updates: Array<{
      attributeKey: string;
      value: CatalogAttributeValue;
      expectedVersion: number;
    }> = [];
    const errors: string[] = [];
    for (const candidate of result.candidates) {
      if (!selectedCandidates[candidate.key]) continue;
      const definition = editableDefinitions.find(
        (column) => column.key.toLocaleLowerCase('es') === candidate.key.toLocaleLowerCase('es'),
      );
      if (!definition) continue;
      const parsed = coerceExtractedValue(definition, candidate.value);
      if (!parsed.ok) {
        errors.push(parsed.message);
        continue;
      }
      updates.push({
        attributeKey: definition.key,
        value: parsed.value,
        expectedVersion: sheet.product.attributes[definition.key]?.version ?? 0,
      });
    }
    if (errors.length > 0) {
      setSaveError(errors.join(' '));
      return;
    }
    if (updates.length === 0) {
      setSaveError('Selecciona al menos un candidato editable y válido.');
      return;
    }

    saveRef.current?.abort();
    const controller = new AbortController();
    saveRef.current = controller;
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const updated = await patchProductAttributes(product.id, { updates }, controller.signal);
      if (saveRef.current !== controller) return;
      setSheet((current) => {
        if (!current || current.product.id !== updated.productId) return current;
        const attributes = { ...current.product.attributes };
        for (const attribute of updated.attributes) {
          attributes[attribute.attributeKey] = {
            value: attribute.value,
            version: attribute.version,
            source: attribute.source,
            updatedAt: attribute.updatedAt,
          };
        }
        return { ...current, product: { ...current.product, attributes } };
      });
      setSelectedCandidates({});
      setResult(null);
      setSaveNotice(
        `${updates.length} ${updates.length === 1 ? 'atributo fue aplicado' : 'atributos fueron aplicados'} mediante una confirmación humana y atómica.`,
      );
    } catch (requestError) {
      if (isAbortError(requestError) || saveRef.current !== controller) return;
      setSaveError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible aplicar los candidatos seleccionados.',
      );
    } finally {
      if (saveRef.current === controller) setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {!canExecute ? (
        <BlockingNotice
          workspace={workspace}
          actionId="extract-asset-candidates"
          title="Extracción documental no habilitada"
          fallback="La API no anunció la operación de extracción para este entorno."
        />
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          La IA propone candidatos; no se persiste nada hasta que una persona seleccione y confirme
          los campos editables.
        </div>
      )}
      <ProductSelector
        idPrefix="extraction"
        selected={product}
        onSelect={setProduct}
        disabled={!canExecute}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-cdr-ink">Evidencia documental</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                El documento debe estar asociado a un SKU persistido.
              </p>
            </div>
            <StatusBadge tone={selectedAsset ? 'success' : 'warning'}>
              {selectedAsset ? selectedAsset.type : 'Sin documento seleccionado'}
            </StatusBadge>
          </div>
          {contextLoading ? (
            <div className="mt-5 grid min-h-72 place-items-center rounded-xl border bg-slate-50">
              <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Cargando activos
                y plantilla…
              </span>
            </div>
          ) : contextError ? (
            <div
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {contextError}
            </div>
          ) : product ? (
            <>
              <label className="mt-5 block text-xs font-semibold text-muted-foreground">
                PDF o imagen persistida
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-cdr-ink"
                  value={selectedAssetId}
                  onChange={(event) => {
                    extractionRef.current?.abort();
                    setSelectedAssetId(event.target.value);
                    setResult(null);
                    setExtractError(null);
                    setSaveNotice(null);
                  }}
                  disabled={assets.length === 0}
                >
                  <option value="">Selecciona un documento</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.type} · {asset.filename}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 grid min-h-52 place-items-center rounded-xl border border-dashed bg-slate-50 p-5 text-center">
                {selectedAsset ? (
                  <div>
                    <FileSearch className="mx-auto size-9 text-primary" aria-hidden="true" />
                    <strong className="mt-3 block text-sm">{selectedAsset.filename}</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedAsset.mimeType} · {Math.ceil(selectedAsset.size / 1024)} KB
                    </p>
                    <a
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline"
                      href={productAssetDownloadUrl(selectedAsset.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir activo real <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Este producto no tiene PDF o imagen compatible con extracción.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="mt-5 grid min-h-72 place-items-center rounded-xl border border-dashed bg-slate-50 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Selecciona un producto para consultar sus activos reales.
              </p>
            </div>
          )}
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/documents">Ir a imágenes y documentos</Link>
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">Atributos sugeridos</h3>
              <p className="text-xs text-muted-foreground">
                {result
                  ? `${result.candidates.length} candidatos · modelo ${result.model}`
                  : `${expectedDefinitions.length} claves visibles y editables`}
              </p>
            </div>
          </div>
          {result ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="warning">No persistida</StatusBadge>
                <StatusBadge tone="info">Revisión humana obligatoria</StatusBadge>
              </div>
              {result.candidates.length === 0 ? (
                <p className="rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
                  El modelo no encontró valores para las claves editables de esta plantilla.
                </p>
              ) : (
                result.candidates.map((candidate) => {
                  const definition = editableDefinitions.find(
                    (column) =>
                      column.key.toLocaleLowerCase('es') === candidate.key.toLocaleLowerCase('es'),
                  );
                  return (
                    <label key={candidate.key} className="flex gap-3 rounded-xl border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={selectedCandidates[candidate.key] ?? false}
                        onChange={(event) =>
                          setSelectedCandidates((current) => ({
                            ...current,
                            [candidate.key]: event.target.checked,
                          }))
                        }
                        aria-label={`Aplicar ${definition?.label ?? candidate.key}`}
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block text-cdr-ink">
                          {definition?.label ?? candidate.key}
                        </strong>
                        <span className="mt-1 block break-words text-muted-foreground">
                          {candidate.value}
                        </span>
                        <small className="mt-1 block text-violet-700">
                          Confianza {Math.round(candidate.confidence * 100)}%
                        </small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          ) : (
            <ol className="mt-6 space-y-5">
              <FlowStep
                number={1}
                title="Seleccionar documento"
                description="El activo debe ser un PDF o una imagen persistida y asociada al SKU."
                active
              />
              <FlowStep
                number={2}
                title="Extraer candidatos"
                description="Solo se envían las claves visibles y editables de la plantilla."
              />
              <FlowStep
                number={3}
                title="Confirmar manualmente"
                description="La aplicación atómica ocurre únicamente tras seleccionar y confirmar."
              />
            </ol>
          )}
          <div className="mt-5 min-h-5 text-xs" aria-live="polite">
            {extractError || saveError ? (
              <p className="text-red-700" role="alert">
                {extractError ?? saveError}
              </p>
            ) : saveNotice ? (
              <p className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="size-4" aria-hidden="true" /> {saveNotice}
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
            {extracting ? (
              <Button variant="outline" onClick={() => extractionRef.current?.abort()}>
                Cancelar extracción
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => void runExtraction()}
                disabled={!canExecute || !selectedAsset || expectedDefinitions.length === 0}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {result ? 'Extraer nuevamente' : 'Extraer candidatos'}
              </Button>
            )}
            <Button
              onClick={() => void applyCandidates()}
              disabled={saving || !result || result.candidates.length === 0}
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              Aplicar seleccionados
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CommercialWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  const canExecute = supportedAction(workspace, 'generate-commercial-proposal');
  const [product, setProduct] = useState<Product | null>(null);
  const [channel, setChannel] = useState<'b2c' | 'b2b'>('b2c');
  const [result, setResult] = useState<AiCommercialProposalResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const selectProduct = (nextProduct: Product | null) => {
    requestRef.current?.abort();
    setProduct(nextProduct);
    setResult(null);
    setError(null);
    setCopyNotice(null);
  };

  const generate = async () => {
    if (!product) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setGenerating(true);
    setError(null);
    setCopyNotice(null);
    try {
      const response = await generateCommercialProposal(
        product.id,
        { channel, maxOutputTokens: 320 },
        controller.signal,
      );
      if (requestRef.current === controller) setResult(response);
    } catch (requestError) {
      if (isAbortError(requestError) || requestRef.current !== controller) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible generar la propuesta comercial.',
      );
    } finally {
      if (requestRef.current === controller) setGenerating(false);
    }
  };

  const copyProposal = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.proposal);
      setCopyNotice('Propuesta copiada al portapapeles.');
    } catch {
      setCopyNotice('No fue posible copiar automáticamente. Selecciona el texto manualmente.');
    }
  };

  return (
    <div className="space-y-5">
      {!canExecute ? (
        <BlockingNotice
          workspace={workspace}
          actionId="generate-commercial-proposal"
          title="Generación comercial no habilitada"
          fallback="La API no anunció la generación comercial para este entorno."
        />
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          La propuesta se genera con datos visibles del producto y siempre queda no persistida,
          pendiente de revisión humana.
        </div>
      )}
      <ProductSelector
        idPrefix="commercial"
        selected={product}
        onSelect={selectProduct}
        disabled={!canExecute}
      />
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-violet-100 text-violet-700">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">Comparación técnica y comercial</h3>
              <p className="text-xs text-muted-foreground">
                La propuesta usa la ficha visible del SKU y un canal de redacción acotado.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Descripción técnica aprobada</h4>
              <StatusBadge tone={product ? 'success' : 'neutral'}>
                {product?.sku ?? 'Sin SKU en contexto'}
              </StatusBadge>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {product?.description?.trim() ||
                (product
                  ? `${product.name}${product.brand ? ` · ${product.brand}` : ''}. Sin descripción técnica registrada.`
                  : 'Selecciona un producto real del catálogo para consultar su contexto técnico.')}
            </p>
            {product ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href={`/products/${encodeURIComponent(product.id)}`}>
                  Abrir ficha técnica
                </Link>
              </Button>
            ) : null}
          </section>
          <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-violet-950">Propuesta IA</h4>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge tone={result ? 'warning' : 'neutral'}>
                  {result ? 'No persistida' : 'Sin generar'}
                </StatusBadge>
                {result ? <StatusBadge tone="info">Revisión humana</StatusBadge> : null}
              </div>
            </div>
            {result ? (
              <>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-cdr-ink">
                  {result.proposal}
                </p>
                <dl className="mt-5 grid gap-2 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt>Modelo</dt>
                    <dd className="font-semibold text-cdr-ink">{result.model}</dd>
                  </div>
                  <div>
                    <dt>Entrada</dt>
                    <dd className="font-semibold text-cdr-ink">
                      {result.usage.inputTokens ?? 'No informado'} tokens
                    </dd>
                  </div>
                  <div>
                    <dt>Salida</dt>
                    <dd className="font-semibold text-cdr-ink">
                      {result.usage.outputTokens ?? 'No informado'} tokens
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Selecciona el producto y el canal. El resultado mostrará modelo y uso reportado, sin
                fingir persistencia ni aprobación.
              </p>
            )}
            <div className="mt-4 min-h-5 text-xs" aria-live="polite">
              {error ? (
                <p className="text-red-700" role="alert">
                  {error}
                </p>
              ) : copyNotice ? (
                <p className="text-emerald-700">{copyNotice}</p>
              ) : generating ? (
                <p className="text-violet-700" role="status">
                  Generando propuesta…
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t bg-slate-50/60 p-4">
          <label className="text-xs font-semibold text-muted-foreground">
            Canal
            <select
              aria-label="Canal"
              className="ml-2 h-9 rounded-lg border border-input bg-white px-3 text-sm text-cdr-ink"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as 'b2c' | 'b2b');
                setResult(null);
                setCopyNotice(null);
              }}
              disabled={!canExecute || generating}
            >
              <option value="b2c">B2C · cliente final</option>
              <option value="b2b">B2B · comprador técnico</option>
            </select>
          </label>
          <div className="flex gap-2">
            {result ? (
              <Button variant="outline" onClick={() => void copyProposal()}>
                <ClipboardCopy className="size-4" aria-hidden="true" /> Copiar
              </Button>
            ) : null}
            {generating ? (
              <Button variant="outline" onClick={() => requestRef.current?.abort()}>
                Cancelar
              </Button>
            ) : (
              <Button onClick={() => void generate()} disabled={!canExecute || !product}>
                <Sparkles className="size-4" aria-hidden="true" />
                {result ? 'Regenerar' : 'Generar propuesta'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

const EXTRACTABLE_ASSET_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function coerceExtractedValue(
  column: CatalogGridColumnDto,
  rawValue: string,
): { ok: true; value: CatalogAttributeValue } | { ok: false; message: string } {
  const value = rawValue.trim();
  if (!value) return { ok: false, message: `${column.label} no puede quedar vacío.` };
  if (column.dataType === 'number' || column.dataType === 'measurement') {
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(value)) {
      return {
        ok: false,
        message: `${column.label} requiere un número sin texto ni unidad adicional.`,
      };
    }
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, message: `${column.label} requiere un número válido.` };
  }
  if (column.dataType === 'boolean') {
    const normalized = value.toLocaleLowerCase('es');
    if (['sí', 'si', 'true', '1'].includes(normalized)) return { ok: true, value: true };
    if (['no', 'false', '0'].includes(normalized)) return { ok: true, value: false };
    return { ok: false, message: `${column.label} acepta Sí o No.` };
  }
  if (column.dataType === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    if (!match) {
      return { ok: false, message: `${column.label} requiere una fecha AAAA-MM-DD.` };
    }
    const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return { ok: false, message: `${column.label} requiere una fecha válida.` };
    }
  }
  if (column.dataType === 'enum') {
    const allowed = column.allowedValues.find(
      (option) => option.toLocaleLowerCase('es') === value.toLocaleLowerCase('es'),
    );
    return allowed
      ? { ok: true, value: allowed }
      : { ok: false, message: `${column.label} requiere un valor permitido.` };
  }
  return { ok: true, value };
}

function DuplicatesWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EmptyMetric label="Alertas abiertas" note="Motor de candidatos pendiente" />
        <EmptyMetric label="Resueltas" note="Sin decisiones persistidas" />
        <EmptyMetric label="Ya agrupados por ERP" note="Sin comparación disponible" />
        <Card className="min-h-28 p-4">
          <small className="text-muted-foreground">Fusiones automáticas</small>
          <strong className="mt-2 block text-2xl text-emerald-600">0</strong>
          <p className="mt-1 text-xs text-muted-foreground">El PIM nunca fusiona SKU</p>
        </Card>
      </div>
      <BlockingNotice
        workspace={workspace}
        title="No existe un motor de posibles duplicados"
        fallback="Faltan criterios de similitud, candidatos persistidos, comparación y decisión humana auditada."
      />
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <GitCompareArrows className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-cdr-ink">Alertas para revisión humana</h3>
              <p className="text-xs text-muted-foreground">
                Duplicado probable no equivale a código unificador y nunca modifica la identidad.
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  'SKU A',
                  'SKU B',
                  'Motivo de similitud',
                  'Similitud',
                  'Código unificador',
                  'Estado',
                  'Acción',
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  <GitCompareArrows
                    className="mx-auto mb-3 size-8 text-slate-300"
                    aria-hidden="true"
                  />
                  <strong className="block text-sm text-cdr-ink">Sin candidatos disponibles</strong>
                  <span className="mt-1 block">
                    El backend no publica pares, similitud ni motivos de coincidencia.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-950">
          Cada SKU conserva su código de artículo. Una corrección de agrupación debe originarse en
          ERP y llegar mediante el código unificador.
        </div>
      </Card>
    </div>
  );
}

function ReviewWorkspace({ workspace }: { workspace: WorkspaceDto }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EmptyMetric label="Pendientes" note="Cola de revisión no implementada" />
        <EmptyMetric label="Aprobadas" note="Sin decisiones persistidas" />
        <EmptyMetric label="Con ajuste" note="Sin solicitudes persistidas" />
        <EmptyMetric label="Creadas en la sesión" note="No se simulan solicitudes" />
      </div>
      <BlockingNotice
        workspace={workspace}
        title="Bandeja pendiente de modelo y permisos"
        fallback="Faltan solicitudes, asignación, decisión, motivo, estado y auditoría de aprobación."
      />
      <div className="flex flex-wrap gap-2" aria-label="Filtros de estado">
        {['Pendientes', 'Aprobadas', 'Con ajuste', 'Todas'].map((label, index) => (
          <Button key={label} variant={index === 0 ? 'default' : 'outline'} size="sm" disabled>
            {label} · —
          </Button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <div className="flex items-center gap-3">
              <ListChecks className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold text-cdr-ink">Solicitudes</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
                <tr>
                  {['Solicitud', 'SKU', 'Solicitante', 'Prioridad', 'Estado', 'Acción'].map(
                    (heading) => (
                      <th key={heading} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    Sin solicitudes reales. La vista se activará cuando el backend publique una cola
                    autenticada.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-cdr-ink">Revisión individual</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Al seleccionar una solicitud se compararán valor anterior, propuesta, evidencia,
            solicitante y trazabilidad.
          </p>
          <div className="mt-6 grid gap-3 rounded-xl border bg-slate-50 p-4 text-xs text-muted-foreground">
            <span>Registro: —</span>
            <span>Solicitante: —</span>
            <span>Prioridad: —</span>
            <span>Estado: —</span>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled>
              Solicitar ajuste
            </Button>
            <Button disabled>Aprobar</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SourcesWorkspace({
  workspace,
  conflict = false,
}: {
  workspace: WorkspaceDto;
  conflict?: boolean;
}) {
  const [categories, setCategories] = useState<AdminCatalogCategoryDto[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (conflict) return;
    let current = true;
    setLoadState('loading');
    void listAdminCategories(true)
      .then((result) => {
        if (!current) return;
        setCategories(result);
        setLoadState('ready');
      })
      .catch(() => {
        if (!current) return;
        setLoadState('error');
      });
    return () => {
      current = false;
    };
  }, [conflict]);

  const configuredCategories = useMemo(
    () =>
      categories.filter((category) => sourcePriorityEntries(category.sourcePriority).length > 0),
    [categories],
  );
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    configuredCategories[0] ??
    categories[0];
  const selectedSources = sourcePriorityEntries(selectedCategory?.sourcePriority ?? {});
  const pendingCount = categories.length - configuredCategories.length;

  return (
    <div className="space-y-5">
      {conflict ? (
        <BlockingNotice
          workspace={workspace}
          title="Resolución de conflictos no disponible"
          fallback="Faltan candidatos por fuente, prioridad aplicable, decisión con motivo y trazabilidad."
        />
      ) : loadState !== 'ready' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {loadState === 'error'
            ? 'No fue posible consultar la matriz persistida de prioridades.'
            : 'Consultando prioridades persistidas por categoría…'}
        </div>
      ) : null}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-[10px] font-semibold text-muted-foreground">
          {conflict ? 'Conflicto' : 'Categoría / plantilla'}
          {conflict ? (
            <Input className="mt-1" value="Sin conflictos persistidos" disabled readOnly />
          ) : (
            <select
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-cdr-ink disabled:opacity-50"
              value={selectedCategory?.id ?? ''}
              onChange={(event) => setSelectedCategoryId(event.target.value)}
              disabled={loadState !== 'ready' || categories.length === 0}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ·{' '}
                  {sourcePriorityEntries(category.sourcePriority).length > 0
                    ? 'Configurada'
                    : 'Pendiente'}
                </option>
              ))}
            </select>
          )}
        </label>
        <StatusBadge tone="info">
          {conflict
            ? 'Sin candidato seleccionado'
            : `${configuredCategories.length} configuradas · ${pendingCount} pendientes`}
        </StatusBadge>
      </Card>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-blue-100 text-blue-700">
              {conflict ? (
                <ShieldAlert className="size-5" aria-hidden="true" />
              ) : (
                <Layers3 className="size-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <h3 className="font-semibold text-cdr-ink">
                {conflict ? 'Candidatos por fuente' : 'Prioridad de fuentes por categoría'}
              </h3>
              <p className="text-xs text-muted-foreground">
                ERP aporta identidad y datos base; no compite con las fuentes de enriquecimiento.
              </p>
            </div>
          </div>
          <StatusBadge tone={selectedSources.length > 0 ? 'success' : 'warning'}>
            {selectedSources.length > 0 ? 'Configuración persistida' : 'Configuración pendiente'}
          </StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => {
            const configured = selectedSources[index];
            return (
              <div key={index} className="rounded-xl border bg-slate-50 p-4">
                <small className="text-muted-foreground">
                  Prioridad {index + 1} · {index === 0 ? 'Preferida' : `Alternativa ${index}`}
                </small>
                <strong
                  className={`mt-3 block text-sm ${configured ? 'text-cdr-ink' : 'text-slate-400'}`}
                >
                  {configured ? SOURCE_LABELS[configured.source] : 'Sin fuente configurada'}
                </strong>
                <p className="mt-2 text-xs text-muted-foreground">
                  {configured
                    ? `${selectedCategory?.application ?? 'Aplicación pendiente'} · alcance de enriquecimiento`
                    : 'Prioridad pendiente de confirmación del cliente'}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {conflict ? (
        <Card className="p-5">
          <div className="mb-5 border-b pb-4">
            <h3 className="font-semibold text-cdr-ink">SKU y atributo en conflicto</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sin registro seleccionado · los datos base ERP se conservarán fuera de la competencia
              entre fuentes.
            </p>
          </div>
          <h3 className="font-semibold text-cdr-ink">Decisión y trazabilidad</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Selección propuesta', '—'],
              ['Valor vigente elegido', '—'],
              ['Override humano', '—'],
              ['Motivo', '—'],
              ['Estado', 'Sin conflicto seleccionado'],
              ['Fuentes conservadas', '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <small className="text-muted-foreground">{label}</small>
                <strong className="mt-1 block text-sm">{value}</strong>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled>Editar y resolver conflicto</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-semibold text-cdr-ink">Datos base ERP</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Llegan por PUSH y son de solo lectura. La matriz de enriquecimiento no debe
                sobrescribir la identidad recibida de Sismetic / AX.
              </p>
              <StatusBadge tone="info" className="mt-4">
                Solo lectura
              </StatusBadge>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <FileCheck2 className="size-5 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-cdr-ink">Fuentes de enriquecimiento</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                El orden mostrado proviene de BUSQUEDA. Las categorías sin valores permanecen
                explícitamente pendientes; no se completa su precedencia por inferencia.
              </p>
              <Button variant="outline" className="mt-4" disabled>
                Guardar reglas
              </Button>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h3 className="font-semibold text-cdr-ink">Matriz de prioridades por plantilla</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {configuredCategories.length} categorías con orden confirmado y {pendingCount} sin
                prioridad informada en el workbook.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b bg-slate-50 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {['Categoría', 'Aplicación', 'Fabricante', 'Archivo', 'TecDoc', 'Manual'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3 font-semibold">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium text-cdr-ink">{category.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {category.application ?? 'Pendiente'}
                      </td>
                      {(['fabricante', 'archivo', 'tecdoc', 'manual'] as const).map((source) => (
                        <td key={source} className="px-4 py-3 text-muted-foreground">
                          {category.sourcePriority[source] ?? 'Pendiente'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {loadState === 'ready' && categories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                        No existen categorías persistidas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<keyof CategorySourcePriorityDto, string> = {
  tecdoc: 'TecDoc',
  fabricante: 'Fabricante',
  archivo: 'Archivo',
  manual: 'Manual',
};

function sourcePriorityEntries(priority: CategorySourcePriorityDto) {
  return (Object.entries(priority) as [keyof CategorySourcePriorityDto, number][])
    .sort(
      (left, right) =>
        left[1] - right[1] || SOURCE_LABELS[left[0]].localeCompare(SOURCE_LABELS[right[0]], 'es'),
    )
    .map(([source, rank]) => ({ source, rank }));
}

const renderers: Record<QualitySecondaryView, (workspace: WorkspaceDto) => ReactNode> = {
  extraction: (workspace) => <ExtractionWorkspace workspace={workspace} />,
  commercial: (workspace) => <CommercialWorkspace workspace={workspace} />,
  duplicates: (workspace) => <DuplicatesWorkspace workspace={workspace} />,
  review: (workspace) => <ReviewWorkspace workspace={workspace} />,
  sources: (workspace) => <SourcesWorkspace workspace={workspace} />,
  conflict: (workspace) => <SourcesWorkspace workspace={workspace} conflict />,
};

/**
 * Secondary IA/quality screens from the approved reference. The component intentionally receives
 * the live quality workspace: visual affordances remain disabled until that contract advertises a
 * supported operation, so a design-complete screen cannot be mistaken for a working backend.
 */
export function QualitySecondaryWorkspace({ view, workspace }: QualitySecondaryWorkspaceProps) {
  return renderers[view](workspace);
}

export const qualitySecondaryNavigation = [
  {
    id: 'extraction',
    label: 'Extracción IA',
    title: 'Revisión de extracción IA',
    description: 'Evidencia documental y decisiones humanas por atributo.',
    icon: ScanSearch,
  },
  {
    id: 'commercial',
    label: 'Descripción comercial',
    title: 'Descripción comercial con IA',
    description: 'Comparación entre la ficha técnica aprobada y la propuesta comercial.',
    icon: Sparkles,
  },
  {
    id: 'duplicates',
    label: 'Duplicados',
    title: 'Posibles duplicados',
    description: 'Candidatos para comparación sin fusionar ni modificar identidades.',
    icon: PackageSearch,
  },
  {
    id: 'review',
    label: 'Bandeja',
    title: 'Bandeja de revisión y aprobación',
    description: 'Solicitudes y decisiones humanas con motivo y trazabilidad.',
    icon: ListChecks,
  },
  {
    id: 'sources',
    label: 'Prioridad de fuentes',
    title: 'Prioridad de fuentes',
    description: 'Precedencia de enriquecimiento por categoría o plantilla.',
    icon: Layers3,
  },
  {
    id: 'conflict',
    label: 'Resolver conflicto',
    title: 'Resolver conflicto de fuentes',
    description: 'Candidatos, propuesta y override humano documentado.',
    icon: ShieldAlert,
  },
] as const;

export const qualitySecondaryViewIds = qualitySecondaryNavigation.map((item) => item.id);

export function isQualitySecondaryView(value: string): value is QualitySecondaryView {
  return qualitySecondaryViewIds.some((id) => id === value);
}
