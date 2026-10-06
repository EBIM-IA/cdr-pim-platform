'use client';

import type {
  AuditChangeDto,
  CatalogAttributeValue,
  CatalogGridColumnDto,
  ExternalHomologDto,
  GroupApplicationDto,
  ProductAttributeSheetDto,
} from '@cdr/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  History,
  Link2,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Ruler,
  Save,
  X,
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
import {
  DynamicCatalogApiError,
  fetchProductAttributeSheet,
  patchProductAttribute,
} from '@/lib/dynamic-catalog-api';
import { listApplications, listAuditChanges, listHomologs } from '@/lib/operational-api';
import { technicalAttributesFromSheet, unifiedCodeFromSheet } from '@/lib/product-detail-data';
import type { Product } from '@/lib/types';
import { displayMeasurement, type MeasurementSystem } from '@/lib/units';
import { cn } from '@/lib/utils';

type DetailTab =
  'technical' | 'applications' | 'equivalences' | 'documents' | 'sources' | 'history';

const tabs: Array<{ id: DetailTab; label: string; icon: typeof Database }> = [
  { id: 'technical', label: 'Información técnica', icon: Database },
  { id: 'applications', label: 'Aplicaciones', icon: PackageCheck },
  { id: 'equivalences', label: 'Identificadores y homólogos', icon: Link2 },
  { id: 'documents', label: 'Imágenes y documentos', icon: FileText },
  { id: 'sources', label: 'Canal e ID', icon: Database },
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

function attributeInputValue(value: CatalogAttributeValue | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function parsedAttributeValue(column: CatalogGridColumnDto, value: string): CatalogAttributeValue {
  if (column.dataType === 'boolean') return value === 'true';
  if (column.dataType === 'number' || column.dataType === 'measurement') {
    if (!value.trim()) {
      throw new Error(
        `${column.label} no puede quedar vacío porque el contrato actual no admite valores nulos.`,
      );
    }
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
      const results = [];
      for (const column of changes) {
        const current = sheet.product.attributes[column.key];
        results.push(
          await patchProductAttribute(sheet.product.id, column.key, {
            value: parsedAttributeValue(column, values[column.key] ?? ''),
            expectedVersion: current?.version ?? 0,
          }),
        );
      }
      onSaved(new Set(results.flatMap((result) => result.replicatedProductIds)).size);
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
      />
      <section
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
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
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
              <h3 className="text-sm font-bold">Datos base y campos de solo lectura</h3>
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
                  Atributos de la plantilla · {editableColumns.length}
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

function TechnicalPanel({
  product,
  sheet,
  sheetError,
  unitSystem,
  onUnitSystemChange,
}: {
  product: Product;
  sheet: ProductAttributeSheetDto | null;
  sheetError: string | null;
  unitSystem: MeasurementSystem;
  onUnitSystemChange: (system: MeasurementSystem) => void;
}) {
  const attributes = sheet
    ? technicalAttributesFromSheet(sheet).map((attribute) => ({
        ...attribute,
        rawValue: attribute.value,
        displayValue: attribute.value === null ? 'Sin valor registrado' : String(attribute.value),
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

  if (attributes.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin atributos técnicos"
        description="El producto existe, pero no tiene atributos visibles para tu rol ni identificadores técnicos de respaldo."
      />
    );
  }

  const convertibleAttributes = attributes.filter(
    (attribute) =>
      attribute.rawValue !== null &&
      Boolean(
        displayMeasurement(
          attribute.rawValue,
          { unit: attribute.unit ?? undefined, attributeKey: attribute.key },
          unitSystem,
        )?.secondary,
      ),
  ).length;

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

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Datos técnicos e identificadores</CardTitle>
          <CardDescription>
            {sheet
              ? `${attributes.length} atributos visibles de ${sheet.schema.template.name}, versión ${sheet.schema.template.version}.`
              : `${attributes.length} identificadores disponibles como respaldo de la ficha base.`}
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
        {sheetError ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {sheetError} Se muestran los identificadores de la ficha base.
          </p>
        ) : null}
        <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
          {attributes.map((attribute) => {
            const measurement =
              attribute.rawValue === null
                ? null
                : displayMeasurement(
                    attribute.rawValue,
                    { unit: attribute.unit ?? undefined, attributeKey: attribute.key },
                    unitSystem,
                  );
            const fallbackUnit =
              attribute.unit &&
              attribute.rawValue !== null &&
              typeof attribute.rawValue !== 'string'
                ? ` ${attribute.unit}`
                : '';

            return (
              <div key={attribute.key} className="min-w-0 border-b py-4 first:pt-0">
                <dt className="text-xs leading-relaxed text-muted-foreground">{attribute.label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold">
                  {measurement
                    ? measurement.primary.text
                    : `${attribute.displayValue}${fallbackUnit}`}
                </dd>
                {measurement?.secondary ? (
                  <dd className="mt-1 break-words text-xs text-muted-foreground">
                    {measurement.secondary.registered ? 'Registrado' : 'Equivalente'}:{' '}
                    {measurement.secondary.text}
                  </dd>
                ) : null}
                {attribute.source || attribute.authority ? (
                  <dd className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {attribute.source ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        Fuente: {sourceLabels[attribute.source]}
                      </span>
                    ) : null}
                    {attribute.authority ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1">
                        Autoridad: {authorityLabels[attribute.authority]}
                      </span>
                    ) : null}
                    {attribute.includeInTechnicalSheet !== null ? (
                      <span
                        className={cn(
                          'rounded-full px-2 py-1',
                          attribute.includeInTechnicalSheet
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700',
                        )}
                      >
                        {attribute.includeInTechnicalSheet ? 'Ficha técnica' : 'Solo detalle'}
                      </span>
                    ) : null}
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

function ApplicationsPanel({
  unifiedCode,
  applications,
  loading,
  error,
}: {
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
        <CardTitle>Aplicaciones compartidas</CardTitle>
        <CardDescription>
          Relaciones activas heredadas por todos los SKU del código {unifiedCode}.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vehículo</th>
              <th className="px-4 py-3">Marca / modelo</th>
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
  loading,
  error,
}: {
  product: Product;
  sheet: ProductAttributeSheetDto | null;
  unifiedCode?: string;
  homologs: ExternalHomologDto[];
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
    { key: 'sku', label: 'Código artículo · identidad', value: product.sku },
    { key: 'provider', label: 'Código de proveedor', value: product.providerCode },
    { key: 'unifier', label: 'Código unificador', value: unifiedCode },
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
                  <th className="px-4 py-3">Código homólogo</th>
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
                      <StatusBadge tone="success">Activo · aprobado</StatusBadge>
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
  sheet,
}: {
  product: Product;
  sheet: ProductAttributeSheetDto | null;
}) {
  const assetPattern = /ficha|plano|document|archivo|fotograf|foto|imagen|manual|certific/i;
  const sheetAssets = sheet
    ? sheet.schema.columns
        .filter((column) => assetPattern.test(`${column.key} ${column.label}`))
        .map((column) => ({
          key: column.key,
          label: column.label,
          value: sheet.product.attributes[column.key]?.value,
          source: sheet.product.attributes[column.key]?.source ?? null,
          kind: /foto|imagen/i.test(`${column.key} ${column.label}`) ? 'Imagen' : 'Documento',
          required: column.required,
        }))
    : [];
  const documents =
    sheetAssets.length > 0
      ? sheetAssets
      : product.attributes
          .filter((attribute) => assetPattern.test(`${attribute.key} ${attribute.label}`))
          .map((attribute) => ({
            key: attribute.key,
            label: attribute.label,
            value: attribute.rawValue,
            source: null,
            kind: /foto|imagen/i.test(`${attribute.key} ${attribute.label}`)
              ? 'Imagen'
              : 'Documento',
            required: false,
          }));

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
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Imágenes y documentos · {documents.length}</CardTitle>
          <CardDescription>
            Activos definidos por la plantilla activa y valores registrados para este SKU.
          </CardDescription>
        </div>
        <Button type="button" variant="outline" disabled title="Carga de archivos no disponible">
          Gestionar activos
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {documents.map((document) => (
          <div
            key={document.key}
            className={cn(
              'flex min-w-0 items-start gap-3 rounded-lg border p-4',
              document.value === undefined || document.value === null || document.value === ''
                ? 'border-dashed bg-slate-50'
                : 'bg-white',
            )}
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-primary">
              <FileText aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <strong className="block text-sm">
                {document.label}
                {document.required ? <span className="ml-1 text-primary">*</span> : null}
              </strong>
              <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                {document.kind}
                {document.source ? ` · ${document.source}` : ''}
              </span>
              {typeof document.value === 'string' && /^https?:\/\//i.test(document.value) ? (
                <a
                  className="mt-2 block break-all text-xs font-semibold text-primary hover:underline"
                  href={document.value}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir activo
                </a>
              ) : (
                <span className="mt-2 block break-all text-xs text-muted-foreground">
                  {document.value === undefined || document.value === null || document.value === ''
                    ? document.required
                      ? 'Obligatorio pendiente'
                      : 'Sin archivo registrado'
                    : String(document.value)}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
      <p className="mx-6 mb-6 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
        La carga binaria todavía no forma parte del contrato del backend. La pantalla consulta y
        muestra únicamente activos realmente registrados; no simula archivos.
      </p>
    </Card>
  );
}

function SourcesPanel({ product }: { product: Product }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canal e identificación técnica</CardTitle>
        <CardDescription>
          Datos de transporte de la ficha; no representan procedencia de negocio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">Canal de consulta</dt>
            <dd className="mt-1 break-words text-sm font-semibold">
              {product.queryChannel ?? 'No informado'}
            </dd>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4">
            <dt className="text-xs text-muted-foreground">ID técnico</dt>
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
        <CardTitle>Historial de cambios</CardTitle>
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

export function ProductDetailView({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [attributeSheet, setAttributeSheet] = useState<ProductAttributeSheetDto | null>(null);
  const [attributeSheetError, setAttributeSheetError] = useState<string | null>(null);
  const [applications, setApplications] = useState<GroupApplicationDto[]>([]);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [homologs, setHomologs] = useState<ExternalHomologDto[]>([]);
  const [homologsError, setHomologsError] = useState<string | null>(null);
  const [homologsLoading, setHomologsLoading] = useState(false);
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
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

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
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, [attributeSheet]);

  useEffect(() => {
    const controller = new AbortController();
    setAuditLoading(true);
    void Promise.allSettled([
      fetchProduct(productId, controller.signal),
      fetchProductAttributeSheet(productId, controller.signal),
      listAuditChanges({ resourceId: productId, page: 1, pageSize: 100 }, controller.signal),
    ])
      .then(([productResult, sheetResult, auditResult]) => {
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
    ]).then(([applicationsResult, homologsResult]) => {
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

  const panel = useMemo(() => {
    if (!product) return null;
    if (activeTab === 'applications') {
      return (
        <ApplicationsPanel
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
          loading={homologsLoading}
          error={homologsError}
        />
      );
    }
    if (activeTab === 'documents')
      return <DocumentsPanel product={product} sheet={attributeSheet} />;
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
    return (
      <TechnicalPanel
        product={product}
        sheet={attributeSheet}
        sheetError={attributeSheetError}
        unitSystem={unitSystem}
        onUnitSystemChange={setUnitSystem}
      />
    );
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
    homologs,
    homologsError,
    homologsLoading,
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
    ? `${attributeSheet.schema.template.name} · v${attributeSheet.schema.template.version}`
    : product.templateKey;
  const firstApplication = applications[0];
  const applicationSummary = firstApplication
    ? [firstApplication.vehicleType, firstApplication.make, firstApplication.model]
        .filter(Boolean)
        .join(' · ')
    : product.application;
  const editableAttributeCount =
    attributeSheet?.schema.columns.filter(
      (column) => column.sourceAuthority === 'pim' && column.permissions.edit,
    ).length ?? 0;
  const eligibleHomologCount = homologs.filter(
    (homolog) => homolog.active && homolog.approvalStatus === 'approved',
  ).length;

  return (
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
        objective="Ficha consolidada: mantiene la identidad del SKU y reúne atributos, relaciones heredadas, activos y trazabilidad real."
        actions={[
          'Consulta las seis secciones o usa los accesos rápidos del SKU.',
          'Edita únicamente los atributos PIM permitidos por la plantilla; los datos ERP quedan bloqueados.',
          'Alterna entre métrico e imperial sin cambiar el valor registrado por la fuente.',
        ]}
        dataSource="La identidad proviene del catálogo; los atributos, su procedencia, las aplicaciones, los homólogos y el historial se consultan en sus APIs operativas."
        limitation="Los atributos replicables y las aplicaciones se heredan por código unificador; cada SKU conserva su propia identidad. La búsqueda solo considera homólogos activos y aprobados."
      />

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

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_320px]">
        <Card className="overflow-hidden p-3 sm:p-4">
          <ProductArtwork category={categoryName} name={product.name} className="h-full min-h-64" />
        </Card>

        <div className="min-w-0 py-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-primary">
            Código artículo · identidad ERP
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(product.status)}>
              {statusLabel(product.status)}
            </StatusBadge>
            {templateLabel ? <StatusBadge tone="neutral">{templateLabel}</StatusBadge> : null}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {product.sku}
          </p>
          <h1 className="mt-1 break-words text-3xl font-semibold leading-tight tracking-[-0.035em] text-cdr-ink sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            {product.description ??
              'El contrato actual no entrega una descripción para este producto.'}
          </p>

          <dl className="mt-7 grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
            {[
              ['Marca', product.brand],
              ['Aplicación', applicationSummary],
              ['Línea / categoría', categoryName],
              ['Dimensiones', product.dimensions ?? 'No disponibles en el contrato'],
              ['Código fabricante', product.providerCode ?? 'No disponible'],
              ['Código unificador', unifiedCode ?? 'No registrado'],
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
            <CardDescription>Estado e identificación técnica de la ficha.</CardDescription>
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
                <dt className="text-xs text-muted-foreground">Canal de consulta</dt>
                <dd className="mt-1 break-words font-semibold">
                  {product.queryChannel ?? 'No informado'}
                </dd>
              </div>
              {product.technicalId ? (
                <div>
                  <dt className="text-xs text-muted-foreground">ID técnico</dt>
                  <dd className="mt-1 break-words font-semibold">{product.technicalId}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Actualización</dt>
                <dd className="mt-1 font-semibold">{formatDate(product.updatedAt)}</dd>
              </div>
            </dl>
            <Button
              type="button"
              variant="dark"
              className="w-full"
              onClick={() => setEditOpen(true)}
              disabled={!attributeSheet || editableAttributeCount === 0}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Editar enriquecimiento
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setActiveTab('technical')}
            >
              Revisar información técnica
            </Button>
            <button
              type="button"
              className="mx-auto flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
              onClick={() => setActiveTab('history')}
            >
              <History aria-hidden="true" className="size-4" /> Ver historial
            </button>
          </CardContent>
        </Card>
      </section>

      <section
        className={cn(
          'mt-5 rounded-xl border px-5 py-4',
          unifiedCode
            ? 'border-orange-200 bg-gradient-to-b from-orange-50 to-white'
            : 'bg-slate-50',
        )}
        aria-label="Grupo del código unificador"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[.08em] text-primary">
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
          </div>
        </div>
      </section>

      <nav
        className="mt-4 flex flex-wrap items-center gap-2"
        aria-label={`Módulos de ${product.sku}`}
      >
        <span className="mr-1 text-[10px] font-extrabold uppercase tracking-[.06em] text-slate-500">
          Módulos de {product.sku}
        </span>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              activeTab === item.id
                ? 'bg-orange-100 text-primary'
                : 'bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-primary',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="mt-6 min-w-0" aria-label="Detalle complementario">
        <div
          className="scrollbar-thin sticky top-[72px] z-20 overflow-x-auto border-b bg-white/95 backdrop-blur"
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
