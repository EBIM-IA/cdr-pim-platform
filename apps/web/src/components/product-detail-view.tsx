'use client';

import type {
  AuditChangeDto,
  CatalogAttributeValue,
  CatalogCategorySummaryDto,
  CatalogGridColumnDto,
  ExternalHomologDto,
  GroupOemCodeDto,
  GroupApplicationDto,
  ProductAttributeSheetDto,
  ProductAssetDto,
  ProductAssetType,
  ProductExperienceDto,
  ProductSalesVariantDto,
} from '@cdr/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  Database,
  FileText,
  History,
  Link2,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Ruler,
  Save,
  UploadCloud,
  X,
} from 'lucide-react';

import { ProductArtwork } from '@/components/product-artwork';
import { ProductGallery } from '@/components/product-gallery';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge, statusLabel, statusTone } from '@/components/status-badge';
import { TechnicalSheetPreview } from '@/components/technical-sheet-preview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogApiError, fetchProduct } from '@/lib/catalog-api';
import {
  DynamicCatalogApiError,
  fetchCatalogCategories,
  fetchProductAttributeSheet,
  fetchProductTechnicalSheet,
  patchProductAttributes,
  reassignProductTemplate,
} from '@/lib/dynamic-catalog-api';
import {
  listApplications,
  listAuditChanges,
  listHomologs,
  listOemCodes,
} from '@/lib/operational-api';
import { technicalAttributesFromSheet, unifiedCodeFromSheet } from '@/lib/product-detail-data';
import {
  listProductAssets,
  productAssetDownloadUrl,
  uploadProductAsset,
} from '@/lib/product-assets-api';
import type { Product } from '@/lib/types';
import { fetchProductExperience } from '@/lib/product-experience-api';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';
import { cn } from '@/lib/utils';

import styles from './product-detail-view.module.css';

type DetailTab =
  'technical' | 'applications' | 'equivalences' | 'documents' | 'sources' | 'history';

const UNIT_PREFERENCE_KEY = 'cdr:product-detail:measurement-system';
const DETAIL_ASSET_TYPES: ReadonlyArray<{
  value: ProductAssetType;
  label: string;
  accept: string;
}> = [
  { value: 'FT', label: 'Ficha técnica', accept: '.pdf,application/pdf' },
  { value: 'MSDS', label: 'Ficha de seguridad', accept: '.pdf,application/pdf' },
  {
    value: 'CERT',
    label: 'Certificado',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  },
  {
    value: 'PLANO',
    label: 'Plano',
    accept: '.pdf,.png,.jpg,.jpeg,.dwg,application/pdf,image/png,image/jpeg',
  },
  {
    value: 'FOTO',
    label: 'Fotografía',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  },
];

const tabs: Array<{ id: DetailTab; label: string; icon: typeof Database }> = [
  { id: 'technical', label: 'Información técnica', icon: Database },
  { id: 'applications', label: 'Aplicaciones', icon: PackageCheck },
  { id: 'equivalences', label: 'Código Unificador y Homólogos', icon: Link2 },
  { id: 'documents', label: 'Imágenes y Documentos', icon: FileText },
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

function attributeInputValue(value: CatalogAttributeValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function parsedAttributeValue(
  column: CatalogGridColumnDto,
  value: string,
): CatalogAttributeValue | null {
  if (!value.trim() || value.trim() === '-') {
    if (column.required) throw new Error(`${column.label} es obligatorio.`);
    return null;
  }
  if (column.dataType === 'boolean') return value === 'true';
  if (column.dataType === 'number' || column.dataType === 'measurement') {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed))
      throw new Error(`${column.label} debe contener un número válido.`);
    return parsed;
  }
  return value;
}

function EnrichmentDrawer({
  sheet,
  open,
  onClose,
  onSaved,
}: {
  sheet: ProductAttributeSheetDto;
  open: boolean;
  onClose: () => void;
  onSaved: (replicatedProducts: number) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMode, setShowMode] = useState<'all' | 'required' | 'empty'>('all');
  const drawerElement = useRef<HTMLElement>(null);
  const drawerActions = useRef({ onClose, saving });

  useEffect(() => {
    drawerActions.current = { onClose, saving };
  }, [onClose, saving]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () =>
      [
        ...(drawerElement.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => !element.hidden);
    const firstInput = drawerElement.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled])',
    );
    (firstInput ?? focusableElements()[0])?.focus({ preventScroll: true });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!drawerActions.current.saving) drawerActions.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (!drawerElement.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setValues(
      Object.fromEntries(
        sheet.schema.columns.map((column) => [
          column.key,
          attributeInputValue(sheet.product.attributes[column.key]?.value),
        ]),
      ),
    );
    setError(null);
    setShowMode('all');
  }, [open, sheet]);

  if (!open) return null;

  const baseColumns = sheet.schema.columns.filter(
    (column) => column.sourceAuthority !== 'pim' || !column.permissions.edit,
  );
  const editableColumns = sheet.schema.columns.filter(
    (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
  );
  const visibleEditableColumns = editableColumns.filter((column) => {
    if (showMode === 'required') return column.required;
    if (showMode === 'empty') return !values[column.key]?.trim();
    return true;
  });
  const requiredComplete = sheet.schema.columns.filter(
    (column) => column.required && attributeInputValue(sheet.product.attributes[column.key]?.value),
  ).length;
  const requiredTotal = sheet.schema.columns.filter((column) => column.required).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const changes = editableColumns.filter((column) => {
        const previous = attributeInputValue(sheet.product.attributes[column.key]?.value);
        return (values[column.key] ?? '') !== previous;
      });
      if (changes.length === 0) {
        setError('No hay cambios por guardar.');
        return;
      }
      for (const column of changes) {
        if (column.required && !values[column.key]?.trim()) {
          throw new Error(`${column.label} es obligatorio.`);
        }
      }
      const result = await patchProductAttributes(sheet.product.id, {
        updates: changes.map((column) => {
          const current = sheet.product.attributes[column.key];
          return {
            attributeKey: column.key,
            value: parsedAttributeValue(column, values[column.key] ?? ''),
            expectedVersion: current?.version ?? 0,
          };
        }),
      });
      onSaved(
        new Set(result.attributes.flatMap((attribute) => attribute.replicatedProductIds)).size,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible guardar el enriquecimiento.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="presentation">
      <button
        type="button"
        aria-label="Cerrar edición"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        disabled={saving}
      />
      <section
        ref={drawerElement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrichment-title"
        className="relative z-10 flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-5 border-b px-6 py-5 sm:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.08em] text-primary">
              Editar enriquecimiento
            </p>
            <h2 id="enrichment-title" className="mt-1 text-2xl font-bold tracking-tight">
              {sheet.product.sku}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Los cambios quedan auditados y los campos replicables se heredan dentro del código
              unificador.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={saving}
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-px border-b bg-orange-100 sm:grid-cols-4">
          {[
            ['SKU · código artículo', sheet.product.sku],
            [
              'Plantilla activa',
              `${sheet.schema.template.name} · v${sheet.schema.template.version}`,
            ],
            ['Estado', sheet.product.status],
            ['Obligatorios', `${requiredComplete}/${requiredTotal}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-orange-50 px-5 py-3">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {label}
              </span>
              <strong className="mt-1 block break-words text-sm">{value}</strong>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <section>
            <div className="flex items-center gap-2">
              <LockKeyhole aria-hidden="true" className="size-4 text-slate-500" />
              <h3 className="text-sm font-bold">Datos Base y Campos de Solo Lectura</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Los valores gobernados por ERP o sin permiso de edición se corrigen en su sistema de
              origen.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {baseColumns.map((column) => (
                <div key={column.key} className="rounded-lg border bg-slate-50 px-4 py-3">
                  <dt className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{column.label}</span>
                    <LockKeyhole aria-hidden="true" className="size-3.5" />
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold">
                    {attributeInputValue(sheet.product.attributes[column.key]?.value) ||
                      'Pendiente'}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-3">
              <div>
                <h3 className="text-sm font-bold">
                  Atributos de la Plantilla · {editableColumns.length}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tipo, unidad, obligatoriedad y regla de herencia provienen de la plantilla activa.
                </p>
              </div>
              <label className="text-xs font-semibold">
                Mostrar
                <select
                  className="ml-2 rounded-md border bg-white px-3 py-2 font-normal"
                  value={showMode}
                  onChange={(event) => setShowMode(event.target.value as typeof showMode)}
                >
                  <option value="all">Todos</option>
                  <option value="required">Solo obligatorios</option>
                  <option value="empty">Solo sin valor</option>
                </select>
              </label>
            </div>

            {visibleEditableColumns.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-5 text-sm text-muted-foreground">
                No hay atributos que coincidan con este filtro.
              </p>
            ) : (
              <div>
                {visibleEditableColumns.map((column) => {
                  const inputId = `edit-${column.key}`;
                  const value = values[column.key] ?? '';
                  return (
                    <div
                      key={column.key}
                      className="grid gap-3 border-b py-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,.85fr)]"
                    >
                      <div>
                        <label htmlFor={inputId} className="text-sm font-semibold">
                          {column.label}
                          {column.required ? <span className="ml-1 text-primary">*</span> : null}
                        </label>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                          <span className="rounded bg-slate-100 px-2 py-1">{column.dataType}</span>
                          {column.unit ? (
                            <span className="rounded bg-slate-100 px-2 py-1">
                              Unidad {column.unit}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              'rounded px-2 py-1 font-semibold',
                              column.replicable
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {column.replicable
                              ? 'Replicable por código unificador'
                              : 'Solo este SKU'}
                          </span>
                        </div>
                      </div>
                      <div>
                        {column.dataType === 'boolean' ? (
                          <select
                            id={inputId}
                            value={value}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [column.key]: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                          >
                            <option value="">Seleccionar…</option>
                            <option value="false">No</option>
                            <option value="true">Sí</option>
                          </select>
                        ) : column.allowedValues.length > 0 ? (
                          <select
                            id={inputId}
                            value={value}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [column.key]: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                          >
                            <option value="">Seleccionar…</option>
                            {column.allowedValues.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={inputId}
                            value={value}
                            required={column.required}
                            inputMode={
                              column.dataType === 'number' || column.dataType === 'measurement'
                                ? 'decimal'
                                : undefined
                            }
                            type={column.dataType === 'date' ? 'date' : 'text'}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [column.key]: event.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-md border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer className="border-t bg-white px-6 py-4 sm:px-8">
          {error ? (
            <p role="alert" className="mb-3 flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              <Save aria-hidden="true" className="size-4" />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ProductTechnicalAssets({
  assets,
  loading,
  error,
  canManage,
  onManage,
}: {
  assets: ProductAssetDto[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  onManage: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <h3 className="border-b px-3 py-2 text-sm font-semibold">Documentos y activos</h3>
      <div className="p-3">
        {loading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Cargando activos…
          </p>
        ) : error ? (
          <p className="text-xs text-muted-foreground">No fue posible consultar los activos.</p>
        ) : assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin archivos registrados para este SKU.</p>
        ) : (
          <ul className="divide-y">
            {assets.map((asset) => (
              <li key={asset.id} className="flex min-w-0 items-start gap-2 py-2 first:pt-0">
                <FileText
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={productAssetDownloadUrl(asset.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-words text-xs underline decoration-slate-300 underline-offset-2"
                  >
                    {asset.filename}
                  </a>
                  <span className="text-[10px] text-muted-foreground">
                    {DETAIL_ASSET_TYPES.find((type) => type.value === asset.type)?.label ??
                      asset.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onManage}>
            Gestionar activos
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function TechnicalPanel({
  product,
  active,
  assets,
  assetsLoading,
  assetsError,
  sheet,
  sheetError,
  unitSystem,
  onUnitSystemChange,
  canEditDirect,
  editRequest,
  showCompleteness,
  showInternalDetails,
  canManageAssets,
  onDirtyChange,
  onSaved,
  onManageAssets,
}: {
  product: Product;
  active: boolean;
  assets: ProductAssetDto[];
  assetsLoading: boolean;
  assetsError: string | null;
  sheet: ProductAttributeSheetDto | null;
  sheetError: string | null;
  unitSystem: MeasurementSystem;
  onUnitSystemChange: (system: MeasurementSystem) => void;
  canEditDirect: boolean;
  editRequest: number;
  showCompleteness: boolean;
  showInternalDetails: boolean;
  canManageAssets: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (replicatedProducts: number) => void;
  onManageAssets: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editingSnapshot = useRef<ProductAttributeSheetDto | null>(null);
  const pendingSheet = useRef<ProductAttributeSheetDto | null>(null);
  const initializedSheet = useRef<ProductAttributeSheetDto | null | undefined>(undefined);
  const initializedEditPermission = useRef<boolean | undefined>(undefined);
  const initializedProductId = useRef<string | undefined>(undefined);
  const handledEditRequest = useRef(0);
  const editorElement = useRef<HTMLDivElement>(null);
  const dirtyCount = editing
    ? Object.entries(drafts).filter(
        ([key, value]) =>
          value !== attributeInputValue(editingSnapshot.current?.product.attributes[key]?.value),
      ).length
    : 0;
  const dirty = dirtyCount > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (
      sheet === initializedSheet.current &&
      canEditDirect === initializedEditPermission.current &&
      product.id === initializedProductId.current
    )
      return;
    const sameProduct = product.id === initializedProductId.current;
    initializedSheet.current = sheet;
    initializedEditPermission.current = canEditDirect;
    initializedProductId.current = product.id;
    if (dirty && canEditDirect && sameProduct) {
      pendingSheet.current = sheet;
      setSaveError(
        'La ficha recibió una actualización. Conservamos tu borrador; revisa los cambios antes de guardar.',
      );
      return;
    }
    const allowed =
      canEditDirect && sheet
        ? sheet.schema.columns.filter(
            (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
          )
        : [];
    editingSnapshot.current = allowed.length ? sheet : null;
    pendingSheet.current = null;
    setDrafts(
      Object.fromEntries(
        allowed.map((column) => [
          column.key,
          attributeInputValue(sheet?.product.attributes[column.key]?.value),
        ]),
      ),
    );
    setSaveError(null);
    setEditing(allowed.length > 0);
  }, [canEditDirect, dirty, product.id, sheet]);

  const attributes = sheet
    ? technicalAttributesFromSheet(sheet).map((attribute) => ({
        ...attribute,
        rawValue: attribute.value,
        displayValue:
          attribute.value === null
            ? 'Pendiente'
            : typeof attribute.value === 'boolean'
              ? attribute.value
                ? 'Sí'
                : 'No'
              : String(attribute.value),
      }))
    : product.attributes.map((attribute) => ({
        key: attribute.key,
        label: attribute.label,
        rawValue: attribute.rawValue,
        displayValue: attribute.value,
        unit: attribute.unit ?? null,
        source: null,
        authority: null,
        includeInTechnicalSheet: null,
        updatedAt: null,
      }));
  const columns = new Map(sheet?.schema.columns.map((column) => [column.key, column]) ?? []);
  const editableColumns =
    sheet?.schema.columns.filter(
      (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
    ) ?? [];
  const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';
  const erp = attributes.filter((attribute) => attribute.authority === 'erp');
  const enrichment = attributes.filter((attribute) => attribute.authority !== 'erp');
  const logisticsPattern = /^(c[oó]digo\s*ean|peso|unds?\s*por\s*caja|unidades\s*por\s*caja)/iu;
  const logistics = enrichment.filter((attribute) => logisticsPattern.test(attribute.label));
  const technical = enrichment.filter((attribute) => !logistics.includes(attribute));
  const measurements = technical.filter(
    (attribute) =>
      /^\([^)]+\)/u.test(attribute.label) || columns.get(attribute.key)?.dataType === 'measurement',
  );
  const characteristics = technical.filter((attribute) => !measurements.includes(attribute));
  const groups = [
    {
      title: 'Características',
      note: 'Atributos técnicos de enriquecimiento',
      attributes: characteristics,
    },
    {
      title: 'Medidas y datos de rendimiento',
      note: 'Valores según la plantilla del producto',
      attributes: measurements,
    },
    {
      title: 'Información comercial y logística',
      note: 'Atributos de la plantilla',
      attributes: logistics,
    },
    {
      title: 'Datos base ERP',
      note: 'Nacen en ERP (Sismetic / AX) · solo lectura en PIM',
      attributes: erp,
    },
  ].filter((group) => group.attributes.length > 0);
  const convertibleAttributes = attributes.filter(
    (attribute) =>
      hasValue(attribute.rawValue) &&
      displayMeasurement(
        attribute.rawValue!,
        { unit: attribute.unit ?? undefined, attributeKey: attribute.key },
        unitSystem,
      )?.secondary,
  ).length;
  const requiredColumns = sheet?.schema.columns.filter((column) => column.required) ?? [];
  const missingRequired = requiredColumns.filter(
    (column) => !hasValue(sheet?.product.attributes[column.key]?.value),
  );
  const filled = attributes.filter((attribute) => hasValue(attribute.rawValue)).length;
  const completeness =
    sheet?.completeness !== undefined ? sheet.completeness : product.completeness;
  const sourceLabels = {
    manual: 'Manual',
    erp: 'ERP',
    import: 'Importación',
    document_extraction: 'Extracción documental',
    ai_generated: 'Generado con IA',
  } as const;
  const authorityLabels = {
    pim: 'PIM',
    erp: 'ERP',
    supplier: 'Proveedor',
    calculated: 'Calculado',
  } as const;

  const startEditing = useCallback(() => {
    if (!sheet || !canEditDirect || editing) return;
    const allowed = sheet.schema.columns.filter(
      (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
    );
    if (!allowed.length) return;
    editingSnapshot.current = sheet;
    setDrafts(
      Object.fromEntries(
        allowed.map((column) => [
          column.key,
          attributeInputValue(sheet.product.attributes[column.key]?.value),
        ]),
      ),
    );
    setSaveError(null);
    setEditing(true);
  }, [canEditDirect, editing, sheet]);

  useEffect(() => {
    if (!active || !sheet || !canEditDirect || editRequest <= handledEditRequest.current) return;
    handledEditRequest.current = editRequest;
    startEditing();
    requestAnimationFrame(() => {
      const element = editorElement.current;
      element?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      element
        ?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
        ?.focus({ preventScroll: true });
    });
  }, [active, canEditDirect, editRequest, sheet, startEditing]);

  const save = async () => {
    if (!sheet || !canEditDirect || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const original = editingSnapshot.current ?? sheet;
      const changed = editableColumns.filter(
        (column) =>
          (drafts[column.key] ?? '') !==
          attributeInputValue(original.product.attributes[column.key]?.value),
      );
      if (!changed.length) return;
      const result = await patchProductAttributes(product.id, {
        updates: changed.map((column) => ({
          attributeKey: column.key,
          value: parsedAttributeValue(column, drafts[column.key] ?? ''),
          expectedVersion: original.product.attributes[column.key]?.version ?? 0,
        })),
      });
      // Keep the editor available after saving, and establish the new concurrency baseline
      // before the refreshed sheet arrives.
      const savedSheet: ProductAttributeSheetDto = {
        ...original,
        product: {
          ...original.product,
          attributes: {
            ...original.product.attributes,
            ...Object.fromEntries(
              result.attributes.map((saved) => [
                saved.attributeKey,
                {
                  value: saved.value,
                  version: saved.version,
                  source: saved.source,
                  updatedAt: saved.updatedAt,
                },
              ]),
            ),
          },
        },
      };
      editingSnapshot.current = savedSheet;
      pendingSheet.current = null;
      setDrafts(
        Object.fromEntries(
          editableColumns.map((column) => [
            column.key,
            attributeInputValue(savedSheet.product.attributes[column.key]?.value),
          ]),
        ),
      );
      onSaved(
        new Set(result.attributes.flatMap((attribute) => attribute.replicatedProductIds)).size,
      );
    } catch (requestError) {
      setSaveError(
        requestError instanceof DynamicCatalogApiError && requestError.status === 409
          ? 'Otro usuario actualizó estos atributos. Recarga la ficha para revisar los valores vigentes antes de guardar.'
          : requestError instanceof Error
            ? requestError.message
            : 'No fue posible guardar los atributos.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.visual}>
        <ProductArtwork
          category={sheet?.schema.category.name ?? product.category}
          name={product.name}
          technical
          className="!aspect-square w-full"
        />
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          Esquema técnico referencial. Consulta el plano del fabricante para verificar las
          dimensiones.
        </p>
      </div>
      <div ref={editorElement} className={cn(styles.main, 'scroll-mt-28')}>
        <header className="mb-3 flex flex-col items-start gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Especificaciones · {sheet?.schema.template.name ?? product.category}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {attributes.length} campos visibles · <span className="text-red-600">*</span>{' '}
              obligatorio
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
                {editing ? 'Edición directa · base ERP de solo lectura' : 'Solo consulta'}
              </span>
            </div>
          </div>
          {convertibleAttributes > 0 ? (
            <div className="w-full max-w-md rounded-lg border bg-slate-50 p-2.5">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Ruler aria-hidden="true" className="size-4" />
                Sistema de unidades
              </div>
              <div
                className="flex rounded-md border bg-slate-50 p-0.5"
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
                      'rounded px-3 py-1 text-xs',
                      unitSystem === system
                        ? 'bg-white text-foreground shadow-sm'
                        : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 max-w-60 text-[10px] leading-4 text-muted-foreground">
                {convertibleAttributes} valores convertibles. El valor registrado no se modifica.
              </p>
            </div>
          ) : null}
        </header>
        {sheetError ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {sheetError} Se muestran los identificadores de la ficha base.
          </p>
        ) : null}
        {groups.length === 0 ? (
          <StatePanel
            variant="empty"
            title="Sin atributos técnicos"
            description="Este producto todavía no tiene atributos visibles para tu rol."
          />
        ) : null}
        <div className="space-y-4">
          {groups.map((group) => {
            const heading = (
              <>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <span className="text-[10px] text-muted-foreground">{group.note}</span>
              </>
            );
            const table = (
              <table className={cn(styles.attributes, 'w-full table-fixed text-left text-sm')}>
                <caption className="sr-only">{group.title}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Atributo y origen</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Abreviatura</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.attributes.map((attribute) => {
                    const column = columns.get(attribute.key);
                    const symbol = /^\(\s*([^)]+)\)\s*(.*)/u.exec(attribute.label);
                    const measurement = hasValue(attribute.rawValue)
                      ? displayMeasurement(
                          attribute.rawValue!,
                          { unit: attribute.unit ?? undefined, attributeKey: attribute.key },
                          unitSystem,
                        )
                      : null;
                    const fallbackUnit =
                      attribute.unit &&
                      hasValue(attribute.rawValue) &&
                      typeof attribute.rawValue !== 'string'
                        ? ` ${attribute.unit}`
                        : '';
                    const editable =
                      editing && column?.sourceAuthority === 'pim' && column.permissions.edit;
                    const value = drafts[attribute.key] ?? '';
                    const inputClass =
                      'h-7 w-full min-w-0 rounded border bg-white px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';
                    return (
                      <tr
                        key={attribute.key}
                        className={cn(
                          editable &&
                            value !==
                              attributeInputValue(
                                editingSnapshot.current?.product.attributes[attribute.key]?.value,
                              ) &&
                            'bg-amber-50',
                        )}
                      >
                        <th scope="row" className="px-2 py-2 align-top font-normal">
                          <span>
                            {symbol?.[2] ?? attribute.label}
                            {column?.required ? (
                              <abbr
                                title="Obligatorio según plantilla"
                                className="ml-1 text-red-600 no-underline"
                              >
                                *
                              </abbr>
                            ) : null}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                            {showInternalDetails && attribute.source ? (
                              <span>Fuente: {sourceLabels[attribute.source]}</span>
                            ) : null}
                            {showInternalDetails && attribute.authority ? (
                              <span>Autoridad: {authorityLabels[attribute.authority]}</span>
                            ) : null}
                            {showInternalDetails && attribute.includeInTechnicalSheet !== null ? (
                              <span>
                                {attribute.includeInTechnicalSheet
                                  ? 'Ficha técnica'
                                  : 'Solo detalle'}
                              </span>
                            ) : null}
                            {attribute.unit ? <span>Unidad {attribute.unit}</span> : null}
                          </div>
                        </th>
                        <td className="break-words px-2 py-2 align-top">
                          {editable ? (
                            column.dataType === 'boolean' || column.allowedValues.length > 0 ? (
                              <select
                                aria-label={attribute.label}
                                className={inputClass}
                                value={value}
                                disabled={saving}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [attribute.key]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Seleccionar…</option>
                                {column.dataType === 'boolean' ? (
                                  <>
                                    <option value="true">Sí</option>
                                    <option value="false">No</option>
                                  </>
                                ) : (
                                  column.allowedValues.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))
                                )}
                              </select>
                            ) : (
                              <input
                                aria-label={attribute.label}
                                className={inputClass}
                                value={value}
                                disabled={saving}
                                required={column.required}
                                type={column.dataType === 'date' ? 'date' : 'text'}
                                inputMode={
                                  column.dataType === 'measurement' || column.dataType === 'number'
                                    ? 'decimal'
                                    : undefined
                                }
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [attribute.key]: event.target.value,
                                  }))
                                }
                              />
                            )
                          ) : (
                            <>
                              <span
                                className={cn(
                                  !hasValue(attribute.rawValue) && 'text-muted-foreground',
                                )}
                              >
                                {measurement?.primary.text ??
                                  `${attribute.displayValue}${fallbackUnit}`}
                              </span>
                              {measurement?.secondary ? (
                                <small className="mt-1 block text-[10px] text-muted-foreground">
                                  {measurement.secondary.registered ? 'Registrado' : 'Equivalente'}:{' '}
                                  {measurement.secondary.text}
                                </small>
                              ) : null}
                            </>
                          )}
                        </td>

                        <td className="px-2 py-2 align-top text-sm text-muted-foreground">
                          {symbol?.[1]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
            return group.title === 'Datos base ERP' ? (
              <details
                key={group.title}
                className={cn(styles.erpFold, 'overflow-hidden rounded-lg border bg-white')}
              >
                <summary>{heading}</summary>
                {table}
              </details>
            ) : (
              <section key={group.title} className="overflow-hidden rounded-lg border bg-white">
                <header className="flex flex-wrap items-baseline justify-between gap-1 border-b px-3 py-2">
                  {heading}
                </header>
                {table}
              </section>
            );
          })}
        </div>
        {editing ? (
          <div
            role="region"
            aria-label="Guardar cambios de la ficha"
            className="sticky bottom-3 mt-4 rounded-lg border bg-white p-3 shadow-lg"
          >
            {saveError ? (
              <p role="alert" className="mb-2 text-xs text-red-700">
                {saveError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                <strong>{dirtyCount}</strong> {dirtyCount === 1 ? 'cambio' : 'cambios'} sin guardar
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving || !dirty}
                  onClick={() => {
                    const baseline = pendingSheet.current ?? editingSnapshot.current ?? sheet;
                    editingSnapshot.current = baseline;
                    pendingSheet.current = null;
                    setDrafts(
                      Object.fromEntries(
                        editableColumns.map((column) => [
                          column.key,
                          attributeInputValue(baseline?.product.attributes[column.key]?.value),
                        ]),
                      ),
                    );
                    setSaveError(null);
                  }}
                >
                  Descartar cambios
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  <Save aria-hidden="true" className="size-3" />
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <aside className={cn(styles.aside, 'space-y-4')} aria-label="Documentos y calidad del SKU">
        <ProductTechnicalAssets
          assets={assets}
          loading={assetsLoading}
          error={assetsError}
          canManage={canManageAssets}
          onManage={onManageAssets}
        />
        {showCompleteness ? (
          <Card className="p-3">
            <h3 className="text-sm font-semibold">Completitud de plantilla</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Atributos y documentos obligatorios
            </p>
            <div className="my-3">
              <strong className="text-3xl font-semibold">
                {completeness ?? '—'}
                {completeness !== null ? '%' : ''}
              </strong>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cobertura visible: {filled}/{attributes.length} atributos con valor
              </p>
            </div>
            {completeness !== null ? (
              <Progress value={completeness} label="Completitud de plantilla" />
            ) : null}
            <dl className="mt-3 divide-y text-xs">
              {[
                [
                  'Atributos obligatorios visibles',
                  `${requiredColumns.length - missingRequired.length}/${requiredColumns.length}`,
                ],
                [
                  'Base ERP',
                  `${erp.filter((attribute) => hasValue(attribute.rawValue)).length}/${erp.length}`,
                ],
                [
                  'Enriquecimiento',
                  `${enrichment.filter((attribute) => hasValue(attribute.rawValue)).length}/${enrichment.length}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
        {showInternalDetails ? (
          <Card className="p-3">
            <h3 className="text-sm font-semibold">Atributos obligatorios faltantes</h3>
            {missingRequired.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {missingRequired.map((column) => (
                  <li key={column.key}>{column.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">
                Todos los atributos obligatorios visibles tienen valor.
              </p>
            )}
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function ApplicationsPanel({
  productId,
  unifiedCode,
  applications,
  loading,
  error,
}: {
  productId: string;
  unifiedCode?: string;
  applications: GroupApplicationDto[];
  loading: boolean;
  error: string | null;
}) {
  if (!unifiedCode) {
    return (
      <StatePanel
        variant="empty"
        title="Sin código unificador"
        description="Este producto no tiene un código unificador visible para consultar aplicaciones heredadas."
      />
    );
  }
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (error) {
    return (
      <StatePanel variant="error" title="No pudimos cargar las aplicaciones" description={error} />
    );
  }
  if (applications.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin aplicaciones registradas"
        description={`El código unificador ${unifiedCode} todavía no tiene aplicaciones activas.`}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Aplicaciones Compartidas</CardTitle>
        <CardDescription>
          Relaciones activas heredadas por todos los SKU del código {unifiedCode}.
        </CardDescription>
        <Link
          href={`/applications?${new URLSearchParams({ productId, unifiedCode })}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Abrir aplicaciones del código unificador
        </Link>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vehículo</th>
              <th className="px-4 py-3">Marca / Modelo</th>
              <th className="px-4 py-3">Años</th>
              <th className="px-4 py-3">Motor</th>
              <th className="px-4 py-3">Notas</th>
              <th className="px-4 py-3">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {applications.map((application) => (
              <tr key={application.id}>
                <td className="px-4 py-3">{application.vehicleType ?? '—'}</td>
                <td className="px-4 py-3">
                  {[application.make, application.model].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-3">
                  {application.yearFrom || application.yearTo
                    ? `${application.yearFrom ?? '…'}–${application.yearTo ?? '…'}`
                    : '—'}
                </td>
                <td className="px-4 py-3">{application.engine ?? '—'}</td>
                <td className="px-4 py-3">{application.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  {application.source === 'import' ? 'Importación' : 'Manual'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EquivalencesPanel({
  product,
  sheet,
  unifiedCode,
  homologs,
  oemCodes,
  oemError,
  loading,
  error,
}: {
  product: Product;
  sheet: ProductAttributeSheetDto | null;
  unifiedCode?: string;
  homologs: ExternalHomologDto[];
  oemCodes: GroupOemCodeDto[];
  oemError: string | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (error) {
    return (
      <StatePanel variant="error" title="No pudimos cargar los homólogos" description={error} />
    );
  }

  const identifierPattern =
    /codigo|código|ean|oem|fmsi|sku|articulo|artículo|proveedor|unificador/i;
  const sheetIdentifiers = sheet
    ? sheet.schema.columns
        .filter((column) => identifierPattern.test(`${column.key} ${column.label}`))
        .map((column) => ({
          key: column.key,
          label: column.label,
          value: sheet.product.attributes[column.key]?.value,
          source:
            column.sourceAuthority === 'erp'
              ? 'ERP · solo lectura'
              : sheet.product.attributes[column.key]?.source === 'manual'
                ? 'Enriquecimiento manual'
                : 'Plantilla PIM',
          locked: column.sourceAuthority !== 'pim' || !column.permissions.edit,
        }))
    : [];
  const fallbackIdentifiers = [
    { key: 'sku', label: 'Código de Artículo · Identidad', value: product.sku },
    { key: 'provider', label: 'Código de Proveedor', value: product.providerCode },
    { key: 'unifier', label: 'Código Unificador', value: unifiedCode },
  ]
    .filter(({ value }) => value)
    .map((identifier) => ({
      ...identifier,
      source: 'Catálogo base',
      locked: true,
    }));
  const identifiers = sheetIdentifiers.length > 0 ? sheetIdentifiers : fallbackIdentifiers;
  const eligibleHomologs = homologs.filter(
    (homolog) => homolog.active && homolog.approvalStatus === 'approved',
  );
  const eligibleOemCodes = oemCodes.filter(
    (oem) => oem.active && oem.approvalStatus === 'approved',
  );

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Identificadores del SKU · {identifiers.length}</CardTitle>
          <CardDescription>
            La identidad permanece en el SKU; los identificadores ERP no se editan desde el PIM.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Vigencia</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {identifiers.map((identifier) => (
                <tr key={identifier.key}>
                  <td className="px-4 py-3 font-semibold">{identifier.label}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {identifier.value === undefined || identifier.value === null
                      ? 'Pendiente'
                      : String(identifier.value)}
                  </td>
                  <td className="px-4 py-3 text-xs">{identifier.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={identifier.value ? 'success' : 'warning'}>
                      {identifier.value ? 'Vigente' : 'Pendiente'}
                    </StatusBadge>
                    {identifier.locked ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <LockKeyhole aria-hidden="true" className="size-3" /> ERP
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Homólogos del código unificador {unifiedCode ?? '—'} · {eligibleHomologs.length}
          </CardTitle>
          <CardDescription>
            Solo se muestran referencias activas y aprobadas. Se asocian al grupo y sirven para
            encontrar los SKU que CDR sí comercializa.
          </CardDescription>
        </CardHeader>
        {!unifiedCode ? (
          <div className="px-6 pb-6">
            <StatePanel
              variant="empty"
              title="Sin código unificador"
              description="No aplica la herencia de homólogos hasta que ERP asigne el código unificador."
            />
          </div>
        ) : eligibleHomologs.length === 0 ? (
          <div className="px-6 pb-6">
            <StatePanel
              variant="empty"
              title="Sin homólogos elegibles"
              description={`El código ${unifiedCode} no tiene homólogos simultáneamente activos y aprobados.`}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Marca</th>
                  <th className="px-4 py-3">Código Homólogo</th>
                  <th className="px-4 py-3">Fuente</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {eligibleHomologs.map((homolog) => (
                  <tr key={homolog.id}>
                    <td className="px-4 py-3 font-semibold">{homolog.externalBrand}</td>
                    <td className="px-4 py-3 font-mono text-xs">{homolog.externalCode}</td>
                    <td className="px-4 py-3">
                      {homolog.source === 'import' ? 'Importación' : 'Manual'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="success">Activo · Aprobado</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden xl:col-span-2">
        <CardHeader>
          <CardTitle>
            Códigos OEM del código unificador {unifiedCode ?? '—'} · {eligibleOemCodes.length}
          </CardTitle>
          <CardDescription>
            Referencias de fabricante original heredadas por el grupo automotriz. Solo se muestran
            relaciones activas y aprobadas.
          </CardDescription>
        </CardHeader>
        {oemError ? (
          <div className="px-6 pb-6">
            <StatePanel
              variant="error"
              title="No pudimos cargar los códigos OEM"
              description={oemError}
            />
          </div>
        ) : eligibleOemCodes.length === 0 ? (
          <div className="px-6 pb-6">
            <StatePanel
              variant="empty"
              title="Sin códigos OEM elegibles"
              description="Este código unificador no tiene referencias OEM activas y aprobadas."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Código OEM</th>
                  <th className="px-4 py-3">Marcas</th>
                  <th className="px-4 py-3">Fuente</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {eligibleOemCodes.map((oem) => (
                  <tr key={oem.id}>
                    <td className="px-4 py-3 font-mono text-xs">{oem.oemCode}</td>
                    <td className="px-4 py-3 font-semibold">{oem.brands.join(', ')}</td>
                    <td className="px-4 py-3">
                      {oem.source === 'import' ? 'Importación' : 'Manual'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="success">Activo · Aprobado</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DocumentsPanel({
  product,
  canWrite,
  onUploaded,
}: {
  product: Product;
  canWrite: boolean;
  onUploaded: (asset: ProductAssetDto) => void;
}) {
  const [assets, setAssets] = useState<ProductAssetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<ProductAssetType>('FT');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listProductAssets({ productId: product.id }, controller.signal)
      .then(setAssets)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible consultar los activos.',
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [product.id, revision]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const uploaded = await uploadProductAsset({ productId: product.id, type: assetType, file });
      onUploaded(uploaded);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setUploadNotice(`${uploaded.filename} quedó asociado a ${product.sku}.`);
      setRevision((current) => current + 1);
    } catch (requestError) {
      setUploadError(
        requestError instanceof Error ? requestError.message : 'No fue posible subir el activo.',
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <Skeleton className="h-64 rounded-xl" aria-label="Cargando activos" />;
  if (error) {
    return (
      <StatePanel
        variant="error"
        title="No fue posible consultar los activos"
        description={error}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Imágenes y Documentos · {assets.length}</CardTitle>
          <CardDescription>
            Archivos persistidos en el storage privado y asociados a {product.sku}.
          </CardDescription>
        </div>
        <Button asChild type="button" variant="outline">
          <Link href={`/documents?productId=${encodeURIComponent(product.id)}`}>
            {canWrite ? 'Gestionar activos' : 'Ver todos los activos'}
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {canWrite ? (
          <form
            className="mb-5 grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end"
            onSubmit={upload}
          >
            <Select
              label="Tipo de activo"
              value={assetType}
              onChange={(event) => {
                setAssetType(event.target.value as ProductAssetType);
                setFile(null);
                setUploadError(null);
                setUploadNotice(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              {DETAIL_ASSET_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.value} · {entry.label}
                </option>
              ))}
            </Select>
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Archivo individual
              <input
                ref={fileInput}
                type="file"
                accept={DETAIL_ASSET_TYPES.find((entry) => entry.value === assetType)?.accept}
                className="h-11 rounded-md border bg-white p-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:font-semibold file:text-primary"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setUploadError(null);
                  setUploadNotice(null);
                }}
                required
              />
            </label>
            <Button type="submit" disabled={!file || uploading}>
              <UploadCloud aria-hidden="true" className="size-4" />
              {uploading ? 'Subiendo…' : 'Subir al SKU'}
            </Button>
            {assetType === 'FOTO' ? (
              <p className="text-[11px] leading-5 text-muted-foreground md:col-span-3">
                Recomendamos fotografías JPG o PNG cuadradas de 800 × 800 o 1000 × 1000 px. También
                se admite WebP, hasta 20 MB. Un SKU admite varias fotos; se cargan una a la vez y se
                muestran en la galería del producto.
              </p>
            ) : null}
            {uploadNotice ? (
              <p className="text-xs text-emerald-700 md:col-span-3" role="status">
                {uploadNotice}
              </p>
            ) : null}
            {uploadError ? (
              <p className="text-xs text-red-700 md:col-span-3" role="alert">
                {uploadError}
              </p>
            ) : null}
          </form>
        ) : null}
        {assets.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-slate-50 p-5 text-sm text-muted-foreground">
            Este SKU no tiene imágenes ni documentos registrados.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => (
              <a
                key={asset.id}
                href={productAssetDownloadUrl(asset.id)}
                className="flex min-w-0 items-start gap-3 rounded-lg border p-4 transition hover:border-orange-300 hover:bg-orange-50/30"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-primary">
                  <FileText aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{asset.filename}</strong>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {asset.type} · {asset.kind === 'image' ? 'Imagen' : 'Documento'} ·{' '}
                    {(asset.size / 1024).toFixed(1)} KB
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-primary">Descargar</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourcesPanel({ product }: { product: Product }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canal e Identificación Técnica</CardTitle>
        <CardDescription>
          Datos de transporte de la ficha; no representan procedencia de negocio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">Canal de Consulta</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {product.queryChannel ?? 'No informado'}
            </dd>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">ID Técnico</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {product.technicalId ?? 'No informado'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
          La fuente y la autoridad de cada valor se muestran junto al atributo correspondiente en
          Información técnica. Este canal identifica únicamente cómo se consultó la ficha base.
        </p>
      </CardContent>
    </Card>
  );
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function HistoryPanel({
  changes,
  total,
  loading,
  error,
}: {
  changes: AuditChangeDto[];
  total: number;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (error) {
    return (
      <StatePanel variant="error" title="No pudimos cargar el historial" description={error} />
    );
  }
  if (changes.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin cambios registrados"
        description="Todavía no existen eventos de auditoría asociados directamente a este producto."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Historial de Cambios</CardTitle>
        <CardDescription>
          {total} cambios de campo asociados a este producto. Se muestran los 100 más recientes.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Campo</th>
              <th className="px-4 py-3">Antes</th>
              <th className="px-4 py-3">Después</th>
              <th className="px-4 py-3">Vigente desde</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {changes.map((change) => (
              <tr key={change.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(change.occurredAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{change.field}</td>
                <td className="max-w-56 break-words px-4 py-3 text-xs">
                  {auditValue(change.before)}
                </td>
                <td className="max-w-56 break-words px-4 py-3 text-xs">
                  {auditValue(change.after)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  {change.previousValueValidFrom ? formatDate(change.previousValueValidFrom) : '—'}
                </td>
                <td className="px-4 py-3 text-xs">{change.actorId ?? 'Sistema'}</td>
                <td className="px-4 py-3 text-xs">{change.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function variantKey(variant: ProductSalesVariantDto): string {
  return variant.aplicacion?.id ?? variant.tipo;
}

function variantLabel(variant: ProductSalesVariantDto): string {
  const application = variant.aplicacion;
  if (!application) return variant.tipo === 'industrial' ? 'Uso industrial' : 'Uso automotriz';
  const years = [application.anioDesde, application.anioHasta].filter((year) => year !== null);
  return [application.marcaVehiculo, application.modelo, years.join('–')].filter(Boolean).join(' ');
}

function ProductVariantPicker({
  variants,
  selected,
  loading,
  error,
  compact = false,
  onPick,
  onGeneral,
  onViewTable,
}: {
  variants: ProductSalesVariantDto[];
  selected: ProductSalesVariantDto | undefined;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  onPick: (variant: ProductSalesVariantDto) => void;
  onGeneral: () => void;
  onViewTable?: () => void;
}) {
  const applicationCount = variants.filter((variant) => variant.aplicacion).length;
  const options = compact
    ? variants
        .filter((variant) => !variant.aplicacion)
        .concat(variants.filter((variant) => variant.aplicacion).slice(0, 4))
    : variants;
  const content = (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', compact ? '' : 'mb-2')}>
        <h2
          className={
            compact
              ? 'text-[10px] font-bold uppercase tracking-wide text-muted-foreground'
              : 'text-sm font-semibold'
          }
        >
          Aplicaciones · {applicationCount}
        </h2>
        {!compact && variants.length > 0 ? (
          <StatusBadge tone="neutral">
            {new Set(variants.map((variant) => variant.tipo)).size > 1
              ? 'Automotriz e industrial'
              : variants[0]?.tipo === 'industrial'
                ? 'Industrial'
                : 'Automotriz'}
          </StatusBadge>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Cargando aplicaciones…
        </p>
      ) : null}
      {error ? (
        <p role="status" className="text-xs text-amber-800">
          {error}
        </p>
      ) : null}
      {!loading && !error && variants.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin variantes de venta registradas.</p>
      ) : null}
      {!compact && options.length > 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {selected
            ? 'La cabecera muestra el nombre de la opción seleccionada.'
            : 'Elige una opción para ver su nombre en la cabecera.'}
        </p>
      ) : null}
      <div className={compact ? 'contents' : 'grid max-h-[340px] gap-1.5 overflow-y-auto'}>
        {options.map((variant) => {
          const isSelected = !!selected && variantKey(selected) === variantKey(variant);
          const application = variant.aplicacion;
          return (
            <button
              key={variantKey(variant)}
              type="button"
              aria-pressed={isSelected}
              title={variant.nombreAmigable}
              onClick={() => (isSelected ? onGeneral() : onPick(variant))}
              className={cn(
                'border bg-white text-left transition-colors hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                compact
                  ? 'rounded-full px-2.5 py-1 text-[11px] font-semibold'
                  : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2.5 py-2',
                variant.tipo === 'industrial' && compact && 'border-dashed',
                isSelected && 'border-primary bg-orange-50 text-primary',
              )}
            >
              <span className={compact ? '' : 'text-[13px] font-semibold'}>
                {variantLabel(variant)}
              </span>
              {!compact ? (
                <>
                  <small className="col-start-1 mt-0.5 text-[11px] text-muted-foreground">
                    {application
                      ? [application.motor, application.tipo, application.area, application.subarea]
                          .filter(Boolean)
                          .join(' · ')
                      : variant.tipo === 'industrial'
                        ? 'Línea industrial del producto'
                        : 'Sin vehículos registrados'}
                  </small>
                  {isSelected ? (
                    <span className="col-start-2 row-span-2 row-start-1 text-[9px] font-bold uppercase text-primary">
                      Seleccionada
                    </span>
                  ) : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      {compact && variants.length > options.length ? (
        <span className="text-[11px] text-muted-foreground">
          +{variants.length - options.length} más
        </span>
      ) : null}
      {compact && onViewTable ? (
        <button
          type="button"
          onClick={onViewTable}
          className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Ver tabla
        </button>
      ) : null}
      {selected ? (
        <button
          type="button"
          onClick={onGeneral}
          className={cn(
            'text-[11px] font-semibold text-primary underline-offset-2 hover:underline',
            !compact && 'mt-3',
          )}
        >
          Ver nombre general
        </button>
      ) : null}
    </>
  );
  return compact ? (
    <div
      role="group"
      aria-label="Aplicaciones del SKU"
      className="mt-2 flex flex-wrap items-center gap-1.5"
    >
      {content}
    </div>
  ) : (
    <Card aria-label="Aplicaciones del SKU" className={cn(styles.aside, 'h-fit p-3')}>
      {content}
    </Card>
  );
}

export function ProductDetailView({
  productId,
  canWriteAssets = false,
  canReassignTemplate = false,
  showCompleteness = false,
  showProductStatus = true,
}: {
  productId: string;
  canWriteAssets?: boolean;
  canReassignTemplate?: boolean;
  showCompleteness?: boolean;
  showProductStatus?: boolean;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [experience, setExperience] = useState<ProductExperienceDto | null>(null);
  const [experienceLoading, setExperienceLoading] = useState(true);
  const [experienceError, setExperienceError] = useState<string | null>(null);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const [darkIdentity, setDarkIdentity] = useState(false);
  const [assets, setAssets] = useState<ProductAssetDto[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [attributeSheet, setAttributeSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [attributeSheetError, setAttributeSheetError] = useState<string | null>(null);
  const [technicalSheet, setTechnicalSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [technicalSheetError, setTechnicalSheetError] = useState<string | null>(null);
  const [templateOptions, setTemplateOptions] = useState<CatalogCategorySummaryDto[]>([]);
  const [templateOptionsError, setTemplateOptionsError] = useState<string | null>(null);
  const [assigningTemplate, setAssigningTemplate] = useState(false);
  const [applications, setApplications] = useState<GroupApplicationDto[]>([]);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [homologs, setHomologs] = useState<ExternalHomologDto[]>([]);
  const [homologsError, setHomologsError] = useState<string | null>(null);
  const [homologsLoading, setHomologsLoading] = useState(false);
  const [oemCodes, setOemCodes] = useState<GroupOemCodeDto[]>([]);
  const [oemError, setOemError] = useState<string | null>(null);
  const [auditChanges, setAuditChanges] = useState<AuditChangeDto[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>('technical');
  const [unitSystem, setUnitSystem] = useState<MeasurementSystem>('metric');
  const [editOpen, setEditOpen] = useState(false);
  const [inlineEditRequest, setInlineEditRequest] = useState(0);
  const [inlineDirty, setInlineDirty] = useState(false);
  const canEditDirect = canReassignTemplate && showCompleteness;
  const openEnrichment = useCallback(() => {
    if (canEditDirect) {
      setActiveTab('technical');
      setInlineEditRequest((value) => value + 1);
    } else {
      setEditOpen(true);
    }
  }, [canEditDirect]);
  const [technicalSheetOpen, setTechnicalSheetOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const use = params.get('uso');
      setSelectedVariantKey(
        params.get('aplicacion') || (use === 'industrial' || use === 'automotriz' ? use : null),
      );
      setDarkIdentity(params.get('idbar') === 'b');
    };
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, [productId]);

  const selectVariant = useCallback((variant: ProductSalesVariantDto | null) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('aplicacion');
    params.delete('uso');
    if (variant?.aplicacion) params.set('aplicacion', variant.aplicacion.id);
    else if (variant) params.set('uso', variant.tipo);
    const query = params.toString();
    window.history.pushState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    setSelectedVariantKey(variant ? variantKey(variant) : null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setExperienceLoading(true);
    setExperience(null);
    setExperienceError(null);
    setAssetsLoading(true);
    setAssets([]);
    setAssetsError(null);
    void fetchProductExperience(productId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setExperience(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setExperienceError('No fue posible consultar los nombres y las variantes del producto.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setExperienceLoading(false);
      });
    void listProductAssets({ productId }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAssets(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setAssetsError('No fue posible consultar los activos del producto.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAssetsLoading(false);
      });
    return () => controller.abort();
  }, [productId, revision]);

  useEffect(() => {
    if (
      (!showCompleteness && activeTab === 'applications') ||
      (!showProductStatus &&
        !showCompleteness &&
        (activeTab === 'sources' || activeTab === 'history'))
    ) {
      setActiveTab('technical');
    }
  }, [activeTab, showCompleteness, showProductStatus]);

  useEffect(() => {
    try {
      const preference = window.sessionStorage.getItem(UNIT_PREFERENCE_KEY);
      if (preference === 'metric' || preference === 'imperial') setUnitSystem(preference);
    } catch {
      // The preference is optional; private browsing must not break the product sheet.
    }
  }, []);

  const changeUnitSystem = useCallback((system: MeasurementSystem) => {
    setUnitSystem(system);
    try {
      window.sessionStorage.setItem(UNIT_PREFERENCE_KEY, system);
    } catch {
      // Keep the current view usable when session storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!attributeSheet) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') !== 'enrichment') return;
    setEditOpen(true);
    params.delete('edit');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [attributeSheet]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then((categories) => {
        setTemplateOptions(categories);
        setTemplateOptionsError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        setTemplateOptions([]);
        setTemplateOptionsError('No fue posible consultar las variantes de esta categoría.');
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    setAuditLoading(true);
    void Promise.allSettled([
      fetchProduct(productId, controller.signal),
      fetchProductAttributeSheet(productId, controller.signal),
      fetchProductTechnicalSheet(productId, controller.signal),
      listAuditChanges({ resourceId: productId, page: 1, pageSize: 100 }, controller.signal),
    ])
      .then(([productResult, sheetResult, technicalSheetResult, auditResult]) => {
        if (controller.signal.aborted) return;

        if (productResult.status === 'fulfilled') {
          setProduct(productResult.value);
        } else {
          const requestError = productResult.reason as unknown;
          setError(
            requestError instanceof CatalogApiError && requestError.status === 404
              ? 'No encontramos el producto solicitado.'
              : requestError instanceof Error
                ? requestError.message
                : 'No fue posible cargar el producto.',
          );
        }

        if (sheetResult.status === 'fulfilled') {
          setAttributeSheet(sheetResult.value);
          setAttributeSheetError(null);
        } else {
          const requestError = sheetResult.reason as unknown;
          setAttributeSheet(null);
          setAttributeSheetError(
            requestError instanceof DynamicCatalogApiError && requestError.status === 404
              ? null
              : 'No fue posible consultar la plantilla de atributos.',
          );
        }

        if (technicalSheetResult.status === 'fulfilled') {
          setTechnicalSheet(technicalSheetResult.value);
          setTechnicalSheetError(null);
        } else {
          setTechnicalSheet(null);
          setTechnicalSheetError('No fue posible preparar la ficha técnica descargable.');
        }

        if (auditResult.status === 'fulfilled') {
          setAuditChanges(auditResult.value.items);
          setAuditTotal(auditResult.value.total);
          setAuditError(null);
        } else {
          const requestError = auditResult.reason as unknown;
          setAuditChanges([]);
          setAuditTotal(0);
          setAuditError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible consultar el historial.',
          );
        }
        setAuditLoading(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, revision]);

  const unifiedCode = useMemo(
    () => unifiedCodeFromSheet(attributeSheet) ?? product?.unifiedCode,
    [attributeSheet, product?.unifiedCode],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (!unifiedCode) {
      setApplications([]);
      setHomologs([]);
      setOemCodes([]);
      setOemError(null);
      setApplicationsError(null);
      setHomologsError(null);
      setApplicationsLoading(false);
      setHomologsLoading(false);
      return () => controller.abort();
    }

    setApplicationsLoading(true);
    setHomologsLoading(true);
    void Promise.allSettled([
      listApplications({ unifiedCode }, controller.signal),
      listHomologs({ unifiedCode }, controller.signal),
      listOemCodes({ unifiedCode }, controller.signal),
    ]).then(([applicationsResult, homologsResult, oemResult]) => {
      if (controller.signal.aborted) return;
      if (applicationsResult.status === 'fulfilled') {
        setApplications(applicationsResult.value);
        setApplicationsError(null);
      } else {
        setApplications([]);
        setApplicationsError(
          applicationsResult.reason instanceof Error
            ? applicationsResult.reason.message
            : 'No fue posible consultar las aplicaciones.',
        );
      }
      if (homologsResult.status === 'fulfilled') {
        setHomologs(homologsResult.value);
        setHomologsError(null);
      } else {
        setHomologs([]);
        setHomologsError(
          homologsResult.reason instanceof Error
            ? homologsResult.reason.message
            : 'No fue posible consultar los homólogos.',
        );
      }
      if (oemResult.status === 'fulfilled') {
        setOemCodes(oemResult.value);
        setOemError(null);
      } else {
        setOemCodes([]);
        setOemError(
          oemResult.reason instanceof Error
            ? oemResult.reason.message
            : 'No fue posible consultar los códigos OEM.',
        );
      }
      setApplicationsLoading(false);
      setHomologsLoading(false);
    });
    return () => controller.abort();
  }, [unifiedCode]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setProduct(null);
    setAttributeSheet(null);
    setAttributeSheetError(null);
    setAuditChanges([]);
    setAuditTotal(0);
    setAuditError(null);
    setAuditLoading(true);
    setRevision((value) => value + 1);
  };

  const changeTemplate = async (templateId: string) => {
    if (inlineDirty) {
      setTemplateOptionsError(
        'Guarda o cancela los cambios de la ficha antes de cambiar de plantilla.',
      );
      return;
    }
    const currentTemplateId = attributeSheet?.schema.template.id;
    if (!currentTemplateId || templateId === currentTemplateId || !canReassignTemplate) return;
    setAssigningTemplate(true);
    setTemplateOptionsError(null);
    try {
      const result = await reassignProductTemplate(productId, {
        templateId,
        expectedTemplateId: currentTemplateId,
      });
      setSaveNotice(
        `Variante ${result.template.variantKey} · ${result.template.name} asignada al producto.`,
      );
      reload();
    } catch (requestError) {
      setTemplateOptionsError(
        requestError instanceof DynamicCatalogApiError && requestError.status === 409
          ? 'Otra persona cambió la plantilla del producto. Recarga la ficha antes de intentarlo nuevamente.'
          : requestError instanceof Error
            ? requestError.message
            : 'No fue posible asignar la variante de plantilla.',
      );
    } finally {
      setAssigningTemplate(false);
    }
  };

  const handleAssetUploaded = useCallback((asset: ProductAssetDto) => {
    setAssets((current) => [
      ...current.filter(
        (previous) => previous.id !== asset.id && previous.id !== asset.replacesAssetId,
      ),
      asset,
    ]);
    setAssetsError(null);
  }, []);

  const panel = useMemo(() => {
    if (!product) return null;
    if (activeTab === 'applications') {
      return (
        <ApplicationsPanel
          productId={product.id}
          unifiedCode={unifiedCode}
          applications={applications}
          loading={applicationsLoading}
          error={applicationsError}
        />
      );
    }
    if (activeTab === 'equivalences') {
      return (
        <EquivalencesPanel
          product={product}
          sheet={attributeSheet}
          unifiedCode={unifiedCode}
          homologs={homologs}
          oemCodes={oemCodes}
          oemError={oemError}
          loading={homologsLoading}
          error={homologsError}
        />
      );
    }
    if (activeTab === 'documents') {
      return (
        <DocumentsPanel
          product={product}
          canWrite={canWriteAssets}
          onUploaded={handleAssetUploaded}
        />
      );
    }
    if (activeTab === 'sources') return <SourcesPanel product={product} />;
    if (activeTab === 'history') {
      return (
        <HistoryPanel
          changes={auditChanges}
          total={auditTotal}
          loading={auditLoading}
          error={auditError}
        />
      );
    }
    return null;
  }, [
    activeTab,
    applications,
    applicationsError,
    applicationsLoading,
    attributeSheet,
    attributeSheetError,
    auditChanges,
    auditError,
    auditLoading,
    auditTotal,
    canWriteAssets,
    handleAssetUploaded,
    canReassignTemplate,
    showCompleteness,
    changeUnitSystem,
    homologs,
    homologsError,
    homologsLoading,
    oemCodes,
    oemError,
    product,
    unifiedCode,
    unitSystem,
  ]);

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

  const categoryName = attributeSheet?.schema.category.name ?? product.category;
  const templateLabel = attributeSheet
    ? `${attributeSheet.schema.template.name} · ${attributeSheet.schema.template.variantKey} · v${attributeSheet.schema.template.version}`
    : product.templateKey;
  const categoryTemplateOptions = attributeSheet
    ? templateOptions.filter((option) => option.id === attributeSheet.schema.category.id)
    : [];
  const sheetValue = (pattern: RegExp) => {
    const column = attributeSheet?.schema.columns.find((column) =>
      pattern.test(`${column.key} ${column.label}`),
    );
    const value = column ? attributeSheet?.product.attributes[column.key]?.value : null;
    return value === null || value === undefined || value === '' ? undefined : String(value);
  };
  const firstApplication = applications[0];
  const applicationSummary =
    sheetValue(/tipo.?aplicaci[oó]n/iu) ??
    (firstApplication
      ? [firstApplication.vehicleType, firstApplication.make, firstApplication.model]
          .filter(Boolean)
          .join(' · ')
      : /^no disponible/iu.test(product.application)
        ? 'Pendiente'
        : product.application);
  const variants = experience?.variants.filter((variant) => variant.productId === product.id) ?? [];
  const selectedVariant = variants.find((variant) => variantKey(variant) === selectedVariantKey);
  const heroName =
    selectedVariant?.nombreAmigable ||
    experience?.nombreGeneral ||
    (product.name === product.sku
      ? (attributeSheet?.schema.template.name ?? product.name)
      : product.name);
  const galleryAttributes = attributeSheet
    ? technicalAttributesFromSheet(attributeSheet)
    : product.attributes.map((attribute) => ({ ...attribute, value: attribute.rawValue }));
  const heroDescription =
    product.description ??
    sheetValue(/descripcion.?tecnica|descripci[oó]n t[eé]cnica|especificaci[oó]n t[eé]cnica/iu);
  const hasRegisteredValue = (value: unknown) =>
    value !== null && value !== undefined && value !== '';
  const heroColumns = attributeSheet?.schema.columns ?? [];
  const heroCompleteness =
    attributeSheet?.completeness !== undefined ? attributeSheet.completeness : product.completeness;
  const heroRequired = heroColumns.filter((column) => column.required);
  const heroMissing = heroRequired.filter(
    (column) => !hasRegisteredValue(attributeSheet?.product.attributes[column.key]?.value),
  );
  const identityFields = heroColumns
    .filter((column) => column.sourceAuthority === 'erp')
    .map((column) => [
      column.label,
      attributeInputValue(attributeSheet?.product.attributes[column.key]?.value) || 'Pendiente',
    ]);
  const heroIdentity = identityFields.length
    ? identityFields
    : [
        ['Código de artículo', product.sku],
        ['Código de proveedor', product.providerCode ?? 'Pendiente'],
        ['Marca', product.brand],
        ['Categoría', categoryName],
        ['Tipo de aplicación', applicationSummary],
        ['Código unificador', unifiedCode ?? 'Sin código'],
      ];
  const editableAttributeCount =
    attributeSheet?.schema.columns.filter(
      (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
    ).length ?? 0;
  const eligibleHomologCount = homologs.filter(
    (homolog) => homolog.active && homolog.approvalStatus === 'approved',
  ).length;
  const eligibleOemCount = oemCodes.filter(
    (oem) => oem.active && oem.approvalStatus === 'approved',
  ).length;

  const visibleTabs = tabs.filter(
    (tab) =>
      (showCompleteness || tab.id !== 'applications') &&
      (showProductStatus || showCompleteness || (tab.id !== 'sources' && tab.id !== 'history')),
  );

  return (
    <>
      {attributeSheet || technicalSheet ? (
        <>
          {attributeSheet ? (
            <EnrichmentDrawer
              sheet={attributeSheet}
              open={editOpen}
              onClose={() => setEditOpen(false)}
              onSaved={(replicatedProducts) => {
                setEditOpen(false);
                setSaveNotice(
                  replicatedProducts > 0
                    ? `Cambios guardados y heredados a ${replicatedProducts} SKU del mismo código unificador.`
                    : 'Cambios guardados para este SKU.',
                );
                reload();
              }}
            />
          ) : null}
          {technicalSheet ? (
            <TechnicalSheetPreview
              open={technicalSheetOpen}
              product={product}
              sheet={technicalSheet}
              unitSystem={unitSystem}
              onClose={() => setTechnicalSheetOpen(false)}
            />
          ) : null}
        </>
      ) : null}
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

      {saveNotice ? (
        <div
          role="status"
          className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <span>{saveNotice}</span>
          <button type="button" className="font-bold" onClick={() => setSaveNotice(null)}>
            Cerrar
          </button>
        </div>
      ) : null}

      <section className={cn(styles.layout, 'pb-3')}>
        <div className="min-w-0">
          <ProductGallery
            category={categoryName}
            name={product.name}
            assets={assets}
            attributes={galleryAttributes}
            error={assetsError}
          />
          <div className="mt-2">
            <span className="block text-[10px] text-muted-foreground">Marca</span>
            <strong className="text-base">{product.brand}</strong>
          </div>
        </div>
        <div className="min-w-0">
          <span className="text-[10px] uppercase tracking-[.06em] text-muted-foreground">
            Código artículo{' '}
            <strong className="ml-1 text-sm font-semibold text-cdr-ink">{product.sku}</strong> ·
            identidad ERP
          </span>
          <div className="flex items-center gap-2">
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-cdr-ink">
              {heroName}
            </h1>
            <span data-page-help-slot />
            <ScreenGuide
              objective="Ficha consolidada: identidad del SKU, especificaciones, relaciones, activos y trazabilidad."
              actions={[
                'Consulta las secciones de la ficha y las relaciones de su código unificador.',
                'Edita los atributos permitidos por la plantilla; los datos ERP son de solo lectura.',
                'Alterna entre métrico e imperial sin cambiar el valor registrado.',
                'Descarga los atributos publicables en la ficha técnica.',
              ]}
              dataSource="Catálogo ERP, plantilla activa, aplicaciones, homólogos, documentos e historial del producto."
            />
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {heroDescription ?? 'Descripción técnica pendiente de completar'}
          </p>
          {showCompleteness ? (
            <ProductVariantPicker
              variants={variants}
              selected={selectedVariant}
              loading={experienceLoading}
              error={experienceError}
              compact
              onPick={selectVariant}
              onGeneral={() => selectVariant(null)}
              onViewTable={() => setActiveTab('applications')}
            />
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {showProductStatus ? (
              <StatusBadge tone={statusTone(product.status)}>
                {statusLabel(product.status)}
              </StatusBadge>
            ) : null}
            <StatusBadge tone="neutral">{applicationSummary}</StatusBadge>
            {templateLabel ? <StatusBadge tone="neutral">{templateLabel}</StatusBadge> : null}
          </div>
          {attributeSheet && categoryTemplateOptions.length > 1 ? (
            <div className="mt-3 max-w-xl">
              <Select
                label="Subtipo de plantilla"
                value={attributeSheet.schema.template.id}
                disabled={!canReassignTemplate || assigningTemplate || inlineDirty}
                title={
                  inlineDirty
                    ? 'Guarda o cancela la edición antes de cambiar la plantilla.'
                    : undefined
                }
                onChange={(event) => void changeTemplate(event.target.value)}
              >
                {categoryTemplateOptions.map((option) => (
                  <option key={option.templateId} value={option.templateId}>
                    {option.templateVariantKey} · {option.templateName} · v{option.templateVersion}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {categoryTemplateOptions.length} variantes en «{attributeSheet.schema.category.name}
                ».
              </p>
            </div>
          ) : null}
          {templateOptionsError ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {templateOptionsError}
            </p>
          ) : null}
          <dl className="mt-3 grid gap-x-5 gap-y-1 sm:grid-cols-3">
            {heroIdentity.map(([label, value]) => (
              <div key={label} className="min-w-0 border-b py-1">
                <dt className="text-[10px] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-words text-xs">{value}</dd>
              </div>
            ))}
          </dl>
          {!showCompleteness ? (
            <div aria-label="Información PIM" className="mt-3 flex flex-wrap gap-2">
              <span className="sr-only">Información PIM</span>
              {editableAttributeCount > 0 ? (
                <Button
                  type="button"
                  variant="dark"
                  size="sm"
                  onClick={openEnrichment}
                  disabled={!attributeSheet || editableAttributeCount === 0}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Editar enriquecimiento
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTechnicalSheetOpen(true)}
                disabled={!technicalSheet}
                title={technicalSheetError ?? undefined}
              >
                <FileText aria-hidden="true" className="size-3.5" />
                Ficha técnica (PDF)
              </Button>
            </div>
          ) : null}
        </div>
        {showCompleteness ? (
          <Card className={cn(styles.aside, 'h-fit overflow-hidden')}>
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <h2 className="text-sm font-semibold">Control PIM</h2>
              {showProductStatus ? (
                <StatusBadge tone={statusTone(product.status)}>
                  {statusLabel(product.status)}
                </StatusBadge>
              ) : null}
            </div>
            <div className="p-3">
              <div className="mb-3">
                <strong className="text-3xl font-semibold">
                  {heroCompleteness === null ? '—' : `${heroCompleteness}%`}
                </strong>
                <span className="ml-2 text-[11px] text-muted-foreground">completitud</span>
                {heroCompleteness !== null ? (
                  <Progress
                    className="mt-2"
                    value={heroCompleteness}
                    label={`Completitud de ${product.sku}`}
                  />
                ) : null}
              </div>
              <dl className="divide-y text-xs">
                {[
                  ['Fuente base', 'ERP · Sismetic / AX'],
                  ['Código unificador', unifiedCode ?? 'Pendiente'],
                  [
                    'Atributos obligatorios',
                    heroRequired.length
                      ? `${heroRequired.length - heroMissing.length}/${heroRequired.length} completos`
                      : 'Sin regla definida',
                  ],
                  ['Última actualización', formatDate(product.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="max-w-[60%] break-words text-right">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid gap-1.5">
                <Button
                  type="button"
                  variant="dark"
                  size="sm"
                  onClick={openEnrichment}
                  disabled={!attributeSheet || editableAttributeCount === 0}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Editar enriquecimiento
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTechnicalSheetOpen(true)}
                  disabled={!technicalSheet}
                  title={technicalSheetError ?? undefined}
                >
                  <FileText aria-hidden="true" className="size-3.5" />
                  Ficha técnica (PDF)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('history')}
                >
                  <History aria-hidden="true" className="size-3.5" />
                  Ver historial
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <ProductVariantPicker
            variants={variants}
            selected={selectedVariant}
            loading={experienceLoading}
            error={experienceError}
            onPick={selectVariant}
            onGeneral={() => selectVariant(null)}
          />
        )}
      </section>

      <section className="mt-4 min-w-0" aria-label="Detalle complementario">
        <div className="sticky top-12 z-20 -mx-4 md:top-0 border-y bg-white/95 px-4 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-[35px] lg:px-[35px]">
          <dl
            className={cn(styles.identity, darkIdentity && styles.darkIdentity)}
            aria-label="Contexto persistente del producto"
          >
            {[
              ['Código de artículo', product.sku],
              ['Código de proveedor', product.providerCode ?? 'No disponible'],
              ['Marca', product.brand],
              ['Código unificador', unifiedCode ?? 'Sin código'],
              ...(selectedVariant
                ? [
                    [
                      selectedVariant.aplicacion ? 'Aplicación' : 'Uso',
                      variantLabel(selectedVariant),
                    ],
                  ]
                : []),
            ].map(([label, value]) => (
              <div key={label} className={styles.identityField}>
                <dt>{label}</dt>
                <dd title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          <div
            className="scrollbar-thin overflow-x-auto"
            role="tablist"
            aria-label="Secciones de la ficha"
          >
            <div className="flex min-w-max gap-1">
              {visibleTabs.map((tab) => {
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
                      const currentIndex = visibleTabs.findIndex((item) => item.id === tab.id);
                      let targetIndex: number | null = null;

                      if (event.key === 'ArrowRight') {
                        targetIndex = (currentIndex + 1) % visibleTabs.length;
                      } else if (event.key === 'ArrowLeft') {
                        targetIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
                      } else if (event.key === 'Home') {
                        targetIndex = 0;
                      } else if (event.key === 'End') {
                        targetIndex = visibleTabs.length - 1;
                      }

                      if (targetIndex === null) return;
                      event.preventDefault();
                      const target = visibleTabs[targetIndex];
                      if (!target) return;
                      setActiveTab(target.id);
                      requestAnimationFrame(() =>
                        document.getElementById(`tab-${target.id}`)?.focus(),
                      );
                    }}
                    className={cn(
                      'flex min-h-10 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cdr-ink sm:px-4',
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
        </div>
        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="mt-5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdr-ink"
        >
          <div hidden={activeTab !== 'technical'}>
            <TechnicalPanel
              product={product}
              active={activeTab === 'technical'}
              assets={assets}
              assetsLoading={assetsLoading}
              assetsError={assetsError}
              sheet={attributeSheet}
              sheetError={attributeSheetError}
              unitSystem={unitSystem}
              onUnitSystemChange={changeUnitSystem}
              canEditDirect={canEditDirect}
              editRequest={inlineEditRequest}
              onDirtyChange={setInlineDirty}
              showCompleteness={showCompleteness}
              showInternalDetails={showProductStatus || showCompleteness}
              canManageAssets={canWriteAssets}
              onManageAssets={() => setActiveTab('documents')}
              onSaved={(replicatedProducts) => {
                setSaveNotice(
                  replicatedProducts > 0
                    ? `Cambios guardados y heredados a ${replicatedProducts} SKU del mismo código unificador.`
                    : 'Cambios guardados para este SKU.',
                );
                setRevision((value) => value + 1);
              }}
            />
          </div>
          {panel}
        </div>
      </section>
      <section
        className={cn(
          'mt-5 rounded-xl border px-5 py-4',
          unifiedCode ? 'border-slate-200 bg-white' : 'bg-slate-50',
        )}
        aria-label="Grupo del código unificador"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-muted-foreground">
              Código unificador recibido desde ERP
            </span>
            <h2 className="mt-1 font-mono text-xl font-bold">{unifiedCode ?? 'Sin asignar'}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Agrupa relaciones compartidas sin fusionar la identidad del SKU {product.sku}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StatusBadge tone="info">{applications.length} aplicaciones activas</StatusBadge>
            <StatusBadge tone="success">{eligibleHomologCount} homólogos elegibles</StatusBadge>
            <StatusBadge tone="info">{eligibleOemCount} OEM elegibles</StatusBadge>
          </div>
        </div>
      </section>
    </>
  );
}
