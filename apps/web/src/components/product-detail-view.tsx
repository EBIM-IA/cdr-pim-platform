'use client';

import type {
  AuditChangeDto,
  ExternalHomologDto,
  GroupApplicationDto,
  ProductAttributeSheetDto,
} from '@cdr/contracts';
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
import { DynamicCatalogApiError, fetchProductAttributeSheet } from '@/lib/dynamic-catalog-api';
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
  { id: 'equivalences', label: 'Equivalencias', icon: Link2 },
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
  unifiedCode,
  homologs,
  loading,
  error,
}: {
  unifiedCode?: string;
  homologs: ExternalHomologDto[];
  loading: boolean;
  error: string | null;
}) {
  if (!unifiedCode) {
    return (
      <StatePanel
        variant="empty"
        title="Sin código unificador"
        description="Este producto no tiene un código unificador visible para consultar homólogos."
      />
    );
  }
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (error) {
    return (
      <StatePanel variant="error" title="No pudimos cargar los homólogos" description={error} />
    );
  }
  if (homologs.length === 0) {
    return (
      <StatePanel
        variant="empty"
        title="Sin homólogos registrados"
        description={`El código unificador ${unifiedCode} todavía no tiene homólogos activos.`}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Homólogos relacionados</CardTitle>
        <CardDescription>
          Referencias externas activas asociadas al código unificador {unifiedCode}.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Código externo</th>
              <th className="px-4 py-3">Marca externa</th>
              <th className="px-4 py-3">Aprobación</th>
              <th className="px-4 py-3">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {homologs.map((homolog) => (
              <tr key={homolog.id}>
                <td className="px-4 py-3 font-semibold">{homolog.externalCode}</td>
                <td className="px-4 py-3">{homolog.externalBrand}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={
                      homolog.approvalStatus === 'approved'
                        ? 'success'
                        : homolog.approvalStatus === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {homolog.approvalStatus === 'approved'
                      ? 'Aprobado'
                      : homolog.approvalStatus === 'rejected'
                        ? 'Rechazado'
                        : 'Pendiente'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  {homolog.source === 'import' ? 'Importación' : 'Manual'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          unifiedCode={unifiedCode}
          homologs={homologs}
          loading={homologsLoading}
          error={homologsError}
        />
      );
    }
    if (activeTab === 'documents') return <DocumentsPanel product={product} />;
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
        objective="Reúne la identidad del producto con sus atributos visibles, relaciones heredadas y trazabilidad real."
        actions={[
          'Consulta las seis secciones para separar información técnica, relaciones, activos, fuentes e historial.',
          'Alterna entre métrico e imperial sin cambiar el valor registrado por la fuente.',
          'Vuelve al catálogo para continuar la consulta de otros productos.',
        ]}
        dataSource="La identidad proviene del catálogo; los atributos, su procedencia, las aplicaciones, los homólogos y el historial se consultan en sus APIs operativas."
        limitation="Si el producto no tiene una plantilla activa, la ficha conserva como respaldo los identificadores del catálogo base."
      />

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_320px]">
        <Card className="overflow-hidden p-3 sm:p-4">
          <ProductArtwork category={categoryName} name={product.name} className="h-full min-h-64" />
        </Card>

        <div className="min-w-0 py-1">
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
