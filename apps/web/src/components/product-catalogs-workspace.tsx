'use client';

import {
  PRODUCT_CATALOG_MAX_BYTES,
  PRODUCT_CATALOG_SHARE_TERMS,
  type ProductCatalogDetailDto,
  type ProductCatalogDto,
  type ProductCatalogListDto,
  type ProductCatalogShareTerm,
  type WorkspaceDto,
  productCatalogCreateSchema,
} from '@cdr/contracts';
import {
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  ExcelTableFilterBar,
  ExcelTableHeader,
  useExcelTableRows,
} from '@/components/excel-table-filter';
import { StatusBadge, type BadgeTone } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import {
  ProductCatalogsApiError,
  createProductCatalog,
  createProductCatalogShare,
  deleteProductCatalog,
  getProductCatalog,
  listAllProductCatalogs,
  productCatalogDownloadUrl,
  restoreProductCatalog,
  revokeProductCatalogShare,
  updateProductCatalog,
} from '@/lib/product-catalogs-api';
import { downloadXlsx } from '@/lib/tabular-export';

const columns = [
  { key: 'code', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descripción' },
  { key: 'fileName', label: 'Archivo PDF' },
  { key: 'validFrom', label: 'Vigente desde' },
  { key: 'validUntil', label: 'Vigente hasta' },
  { key: 'status', label: 'Estado' },
  { key: 'links', label: 'Enlaces' },
  { key: 'createdBy', label: 'Creado por' },
  { key: 'createdAt', label: 'Fecha de creación' },
  { key: 'updatedBy', label: 'Modificado por' },
  { key: 'updatedAt', label: 'Fecha de modificación' },
] as const;
type ColumnKey = (typeof columns)[number]['key'];
const catalogValue = (row: ProductCatalogDto, key: ColumnKey) =>
  key === 'links' ? `${row.activeLinks} activos de ${row.totalLinks}` : row[key];
const tableColumns = columns.map((column) => ({
  ...column,
  getValue: (row: ProductCatalogDto) => catalogValue(row, column.key),
}));
const termLabels: Record<ProductCatalogShareTerm, string> = {
  '1d': '1 día',
  '3d': '3 días',
  '7d': '7 días',
  '1m': '1 mes',
  '3m': '3 meses',
  '6m': '6 meses',
  never: 'Nunca expira',
};
const statusTones: Record<string, BadgeTone> = {
  Vigente: 'success',
  Activo: 'success',
  'Por vencer': 'warning',
  'Catálogo no vigente': 'warning',
  Programado: 'info',
  Vencido: 'danger',
  Eliminado: 'neutral',
  Revocado: 'neutral',
};
const canShareCatalog = (catalog: ProductCatalogDto) =>
  !catalog.deletedAt && ['Vigente', 'Por vencer'].includes(catalog.status);
const dateLabel = (value: string | null) =>
  value ? value.split('-').reverse().join('/') : 'Sin vencimiento';
const timeLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} KB`
    : `${(bytes / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} MB`;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'No se pudo completar la operación. Inténtalo nuevamente.';
const conflictMessage = (error: unknown) =>
  error instanceof ProductCatalogsApiError && error.status === 409
    ? `${error.message} Los datos cambiaron. Cierra y vuelve a abrir el catálogo para revisar la versión actual; tu borrador sigue aquí.`
    : errorMessage(error);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
function displayValue(row: ProductCatalogDto, key: ColumnKey): string {
  if (key === 'validFrom' || key === 'validUntil') return dateLabel(row[key]);
  if (key === 'createdAt' || key === 'updatedAt') return timeLabel(row[key]);
  return String(catalogValue(row, key) || '—');
}

function AuditMetadata({ catalog }: { catalog: ProductCatalogDto }) {
  return (
    <dl className="grid gap-3 text-xs sm:grid-cols-2">
      {[
        ['ID', catalog.code],
        ['Creado por', catalog.createdBy],
        ['Fecha de creación', timeLabel(catalog.createdAt)],
        ['Modificado por', catalog.updatedBy],
        ['Fecha de modificación', timeLabel(catalog.updatedAt)],
        ...(catalog.deletedAt
          ? [
              ['Eliminado por', catalog.deletedBy ?? '—'],
              ['Fecha de baja', timeLabel(catalog.deletedAt)],
            ]
          : []),
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

async function validatePdf(file: File): Promise<string | null> {
  if (!file.size) return 'El PDF está vacío.';
  if (file.size > PRODUCT_CATALOG_MAX_BYTES) return 'El PDF supera el máximo de 50 MB.';
  if (!/\.pdf$/iu.test(file.name) || (file.type && file.type !== 'application/pdf'))
    return 'Selecciona un archivo PDF.';
  try {
    const head = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
      reader.readAsText(file.slice(0, 5));
    });
    return head === '%PDF-' ? null : 'El archivo no es un PDF válido.';
  } catch {
    return 'No se pudo leer el PDF. Selecciónalo nuevamente.';
  }
}

function CatalogForm({
  catalog,
  onClose,
  onSaved,
}: {
  catalog: ProductCatalogDto | null;
  onClose: () => void;
  onSaved: (catalog: ProductCatalogDto) => void;
}) {
  const [title, setTitle] = useState(catalog?.title ?? '');
  const [description, setDescription] = useState(catalog?.description ?? '');
  const [validFrom, setValidFrom] = useState(catalog?.validFrom ?? today());
  const [validUntil, setValidUntil] = useState(catalog?.validUntil ?? '');
  const [file, setFile] = useState<File | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty =
    title !== (catalog?.title ?? '') ||
    description !== (catalog?.description ?? '') ||
    validFrom !== (catalog?.validFrom ?? today()) ||
    validUntil !== (catalog?.validUntil ?? '') ||
    Boolean(file);
  const close = () => {
    if (!busy && (!dirty || window.confirm('¿Descartar los cambios sin guardar?'))) onClose();
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = productCatalogCreateSchema.safeParse({
      title,
      description,
      validFrom,
      validUntil: validUntil || null,
    });
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] =
          key === 'title'
            ? 'Indica un título de hasta 120 caracteres.'
            : key === 'description'
              ? 'La descripción admite hasta 1000 caracteres.'
              : key === 'validFrom'
                ? 'Indica una fecha de inicio válida.'
                : key === 'validUntil' && issue.code !== 'custom'
                  ? 'Indica una fecha de fin válida.'
                  : issue.message;
      }
    if (!file && !catalog) next.file = 'Selecciona el catálogo en PDF.';
    setBusy(true);
    if (file) {
      const fileError = await validatePdf(file);
      if (fileError) next.file = fileError;
    }
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) {
      setBusy(false);
      return;
    }
    try {
      const saved = catalog
        ? await updateProductCatalog(
            catalog.id,
            { ...parsed.data, expectedUpdatedAt: catalog.updatedAt },
            file,
          )
        : await createProductCatalog(parsed.data, file!);
      onSaved(saved);
    } catch (error) {
      setErrors({ form: conflictMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  const fieldError = (key: string) =>
    errors[key] ? (
      <span role="alert" className="text-xs text-red-700">
        {errors[key]}
      </span>
    ) : null;
  return (
    <WorkspaceDrawer
      title={catalog ? `Editar catálogo · ${catalog.code}` : 'Subir catálogo'}
      onClose={close}
      busy={busy}
      unsavedChanges={dirty}
    >
      <form onSubmit={(event) => void save(event)} noValidate className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="grid gap-1.5 text-xs font-semibold">
            Título *
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="p. ej. Catálogo de rodamientos SKF 2026"
              aria-invalid={Boolean(errors.title)}
            />
            {fieldError('title')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            Descripción
            <textarea
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Qué contiene, marcas, líneas, público…"
              className="w-full resize-y rounded-md border bg-white p-3 text-sm font-normal"
            />
            {fieldError('description')}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold">
              Vigente desde *
              <Input
                type="date"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
                aria-invalid={Boolean(errors.validFrom)}
              />
              {fieldError('validFrom')}
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">
              Vigente hasta
              <Input
                type="date"
                value={validUntil}
                min={validFrom}
                onChange={(event) => setValidUntil(event.target.value)}
                aria-invalid={Boolean(errors.validUntil)}
              />
              <small className="font-normal text-muted-foreground">
                Vacío = sin fecha de vencimiento.
              </small>
              {fieldError('validUntil')}
            </label>
          </div>
          <label className="grid gap-2 text-xs font-semibold">
            Catálogo en PDF {catalog ? '(opcional: reemplaza el actual)' : '*'}
            {catalog ? (
              <span className="flex items-center gap-2 rounded-md bg-slate-50 p-3 font-normal">
                <FileText className="size-4" aria-hidden="true" />
                {catalog.fileName} · {fileSize(catalog.fileSize)}
              </span>
            ) : null}
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0])}
              aria-invalid={Boolean(errors.file)}
            />
            <small className="font-normal text-muted-foreground">
              Solo PDF, hasta 50 MB. El archivo se guarda en el servidor.
            </small>
            {fieldError('file')}
          </label>
        </fieldset>
        {catalog ? (
          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Auditoría</h3>
            <AuditMetadata catalog={catalog} />
          </section>
        ) : null}
        {fieldError('form')}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : catalog ? 'Guardar cambios' : 'Subir catálogo'}
          </Button>
        </div>
      </form>
    </WorkspaceDrawer>
  );
}

const auditActionLabels: Record<string, string> = {
  created: 'Alta de catálogo',
  updated: 'Edición de catálogo',
  deleted: 'Baja de catálogo',
};
const auditFieldLabels: Record<string, string> = {
  title: 'Título',
  description: 'Descripción',
  validFrom: 'Vigente desde',
  validUntil: 'Vigente hasta',
  fileName: 'Archivo PDF',
  fileSize: 'Tamaño',
  deletedAt: 'Fecha de baja',
  term: 'Plazo',
  note: 'Nota',
  expiresAt: 'Vencimiento del enlace',
  revokedAt: 'Fecha de revocación',
  shareId: 'Enlace',
  status: 'Estado',
  revokedShare: 'Enlace revocado',
  revokedShareIds: 'Enlaces revocados',
  sharedLink: 'Enlace generado',
  id: 'Enlace',
};
function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
type CatalogAuditEvent = ProductCatalogDetailDto['audit'][number];
function auditObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function auditRows(event: CatalogAuditEvent) {
  return Object.entries(event.changes).flatMap(([key, change]) => {
    if (key === 'actor') return [];
    if (key === 'catalog' || key === 'sharedLink') {
      const before = auditObject(change.before),
        after = auditObject(change.after);
      return [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        .map((field) => ({
          label: auditFieldLabels[field] ?? field,
          before: before[field],
          after: after[field],
        }));
    }
    return [{ label: auditFieldLabels[key] ?? key, before: change.before, after: change.after }];
  });
}
function auditReason(event: CatalogAuditEvent) {
  if (event.changes.sharedLink) return 'Enlace generado';
  if (event.changes.revokedShare) return 'Enlace revocado';
  const before = auditObject(event.changes.catalog?.before),
    after = auditObject(event.changes.catalog?.after);
  if (before.deletedAt && after.deletedAt === null) return 'Restauración de catálogo';
  return auditActionLabels[event.action] ?? 'Cambio de catálogo';
}
function auditActor(event: CatalogAuditEvent) {
  const actor = auditObject(event.changes.actor?.after);
  return typeof actor.email === 'string' ? actor.email : (event.actorId ?? 'Sistema');
}

function CatalogDetail({
  catalog: initial,
  focusShare,
  canManage,
  canShare,
  canViewAudit,
  onClose,
  onEdit,
  onChanged,
}: {
  catalog: ProductCatalogDto;
  focusShare: boolean;
  canManage: boolean;
  canShare: boolean;
  canViewAudit: boolean;
  onClose: () => void;
  onEdit: (catalog: ProductCatalogDto) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ProductCatalogDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState<ProductCatalogShareTerm>('7d');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState<{ shareId: string; url: string } | null>(null);
  const shareSection = useRef<HTMLElement>(null);
  const catalog = detail?.catalog ?? initial;
  useEffect(() => {
    const controller = new AbortController();
    void getProductCatalog(initial.id, controller.signal)
      .then(setDetail)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initial.id]);
  useEffect(() => {
    if (!loading && focusShare) shareSection.current?.scrollIntoView?.({ block: 'center' });
  }, [focusShare, loading]);
  const reload = async () => setDetail(await getProductCatalog(catalog.id));
  const retryDetail = async () => {
    setLoading(true);
    setError('');
    try {
      await reload();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const generated = await createProductCatalogShare(catalog.id, {
        term,
        note: note.trim(),
        expectedUpdatedAt: catalog.updatedAt,
      });
      setFresh({
        shareId: generated.share.id,
        url: `${window.location.origin}/shared/catalogs#${generated.token}`,
      });
      setNote('');
      setNotice('Enlace generado. Cópialo antes de cerrar este panel.');
      await reload();
      onChanged();
    } catch (reason) {
      setError(conflictMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (share: ProductCatalogDetailDto['shares'][number]) => {
    if (!window.confirm('¿Revocar este enlace? Dejará de abrir el catálogo.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await revokeProductCatalogShare(catalog.id, share.id, share.updatedAt);
      if (fresh?.shareId === share.id) setFresh(null);
      await reload();
      onChanged();
      setNotice('Enlace revocado.');
    } catch (reason) {
      setError(conflictMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      await restoreProductCatalog(catalog.id, catalog.updatedAt);
      await reload();
      onChanged();
      setNotice('Catálogo restaurado. Los enlaces revocados conservan su estado.');
    } catch (reason) {
      setError(conflictMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setNotice('Enlace copiado al portapapeles.');
    } catch {
      setNotice('No se pudo copiar automáticamente. Selecciona el enlace y cópialo.');
    }
  };
  return (
    <WorkspaceDrawer title={`${catalog.code} · ${catalog.title}`} onClose={onClose} busy={busy}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <StatusBadge tone={statusTones[catalog.status] ?? 'neutral'}>
            {catalog.status}
          </StatusBadge>
          <span>
            Vigencia: <b>{dateLabel(catalog.validFrom)}</b> → <b>{dateLabel(catalog.validUntil)}</b>
          </span>
        </div>
        {catalog.description ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{catalog.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3 text-xs">
          <FileText className="size-5 text-primary" aria-hidden="true" />
          <b className="min-w-0 break-all">{catalog.fileName}</b>
          <span className="text-muted-foreground">{fileSize(catalog.fileSize)}</span>
          {!catalog.deletedAt ? (
            <>
              <Button asChild size="sm" variant="outline">
                <a
                  href={productCatalogDownloadUrl(catalog.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver PDF
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a
                  href={productCatalogDownloadUrl(catalog.id, 'attachment')}
                  download={catalog.fileName}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Descargar
                </a>
              </Button>
            </>
          ) : null}
          {canManage ? (
            catalog.deletedAt ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || loading}
                onClick={() => void restore()}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restaurar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || loading}
                onClick={() => onEdit(catalog)}
              >
                Editar
              </Button>
            )
          ) : null}
        </div>
        {loading ? (
          <p role="status" className="text-xs text-muted-foreground">
            Cargando enlaces e historial…
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            {error}
            {!detail ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => void retryDetail()}
              >
                Reintentar detalle
              </Button>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            {notice}
          </p>
        ) : null}
        <section
          ref={shareSection}
          className="space-y-3 border-t pt-4"
          aria-labelledby="catalog-share-heading"
        >
          <h3 id="catalog-share-heading" className="text-sm font-semibold">
            Compartir con enlace
          </h3>
          {!canShare ? (
            <p className="text-xs text-muted-foreground">
              Tu rol permite consultar y descargar este catálogo.
            </p>
          ) : !canShareCatalog(catalog) ? (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              El catálogo está {catalog.status.toLocaleLowerCase('es')}: solo se comparten catálogos
              vigentes.{' '}
              {canManage && !catalog.deletedAt ? 'Ajusta la vigencia para compartirlo.' : ''}
            </p>
          ) : (
            <>
              <p className="text-xs leading-5 text-muted-foreground">
                Elige cuánto tiempo estará disponible el enlace. Al vencer, revocarlo o salir el
                catálogo de vigencia, dejará de mostrar el PDF.
              </p>
              <fieldset disabled={busy || loading || !detail} className="space-y-3">
                <div
                  role="radiogroup"
                  aria-label="Vencimiento del enlace"
                  className="flex flex-wrap gap-2"
                >
                  {PRODUCT_CATALOG_SHARE_TERMS.map((value) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs ${term === value ? 'border-primary bg-orange-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="catalog-share-term"
                        value={value}
                        checked={term === value}
                        onChange={() => setTerm(value)}
                      />
                      {termLabels[value]}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    aria-label="Nota del enlace"
                    maxLength={80}
                    placeholder="Nota opcional: cliente, campaña o destinatario"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="min-w-52 flex-1"
                  />
                  <Button onClick={() => void generate()} disabled={busy || loading || !detail}>
                    {busy ? 'Procesando…' : 'Generar enlace'}
                  </Button>
                </div>
              </fieldset>
            </>
          )}
          {fresh ? (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <label htmlFor="generated-catalog-url" className="text-xs font-semibold">
                Enlace generado
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="generated-catalog-url"
                  readOnly
                  value={fresh.url}
                  onFocus={(event) => event.target.select()}
                  className="min-w-48 flex-1"
                />
                <Button size="sm" onClick={() => void copy()}>
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copiar
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={fresh.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Abrir
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-[11px] leading-5 text-muted-foreground">
            Copia el enlace antes de cerrar el panel. Por seguridad, el historial conserva sus datos
            y permite revocarlo, pero no vuelve a mostrar su dirección.
          </p>
        </section>
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">
            Enlaces generados · {detail?.shares.length ?? catalog.totalLinks}
          </h3>
          {detail?.shares.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr>
                    {[
                      'Enlace',
                      'Plazo',
                      'Vence',
                      'Estado',
                      'Visitas',
                      'Generado por',
                      'Acciones',
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.shares.map((share) => (
                    <tr
                      key={share.id}
                      className={fresh?.shareId === share.id ? 'bg-emerald-50' : ''}
                    >
                      <td>
                        <code title={share.id}>…{share.id.slice(-8)}</code>
                        {share.note ? (
                          <small className="mt-1 block max-w-40 break-words text-muted-foreground">
                            {share.note}
                          </small>
                        ) : null}
                      </td>
                      <td>{termLabels[share.term]}</td>
                      <td>{share.expiresAt ? timeLabel(share.expiresAt) : 'Nunca'}</td>
                      <td>
                        <StatusBadge tone={statusTones[share.status] ?? 'neutral'}>
                          {share.status}
                        </StatusBadge>
                      </td>
                      <td>{share.views}</td>
                      <td>
                        {share.createdBy}
                        <small className="mt-1 block text-muted-foreground">
                          {timeLabel(share.createdAt)}
                        </small>
                      </td>
                      <td>
                        {canShare && share.status !== 'Revocado' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void revoke(share)}
                          >
                            Revocar
                          </Button>
                        ) : share.revokedAt ? (
                          <small>
                            {share.revokedBy}
                            <br />
                            {timeLabel(share.revokedAt)}
                          </small>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !loading && detail ? (
            <p className="text-xs text-muted-foreground">Todavía no se compartió.</p>
          ) : null}
        </section>
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Auditoría</h3>
          <AuditMetadata catalog={catalog} />
          {detail?.audit.length ? (
            <ul className="divide-y rounded-md border text-xs">
              {detail.audit.map((event) => (
                <li key={event.id} className="space-y-1 p-3">
                  <b>{auditReason(event)}</b>
                  <span className="block text-muted-foreground">
                    {timeLabel(event.occurredAt)} · {auditActor(event)}
                  </span>
                  {auditRows(event).map((change) => (
                    <div key={change.label} className="break-words">
                      <span>{change.label}</span>: {auditValue(change.before)} →{' '}
                      {auditValue(change.after)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}
          {canViewAudit ? (
            <Button asChild size="sm" variant="ghost">
              <a href="/administration?view=audit">Ver en Auditoría</a>
            </Button>
          ) : null}
        </section>
      </div>
    </WorkspaceDrawer>
  );
}

/** PDF files and share secrets are never persisted in browser storage. */
export function ProductCatalogsWorkspace({
  canManage = false,
  canShare = false,
  canViewAudit = false,
}: {
  canManage?: boolean;
  canShare?: boolean;
  canViewAudit?: boolean;
  workspace?: WorkspaceDto;
  onReload?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [result, setResult] = useState<ProductCatalogListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [scope, setScope] = useState<'active' | 'deleted' | 'all'>('active');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [form, setForm] = useState<{ catalog: ProductCatalogDto | null } | null>(null);
  const [detail, setDetail] = useState<{ catalog: ProductCatalogDto; focusShare: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ProductCatalogDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setSelected(new Set());
    void listAllProductCatalogs({ q: appliedQuery, includeDeleted: canManage }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedQuery, canManage, revision]);
  const rows = useMemo(
    () =>
      (result?.items ?? []).filter(
        (row) => scope === 'all' || (scope === 'deleted' ? Boolean(row.deletedAt) : !row.deletedAt),
      ),
    [result, scope],
  );
  const table = useExcelTableRows({ rows, columns: tableColumns });
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [appliedQuery, scope, table.filters, table.sort]);
  const pages = Math.max(1, Math.ceil(table.visibleRows.length / 25));
  const currentPage = Math.min(page, pages);
  const pageRows = table.visibleRows.slice((currentPage - 1) * 25, currentPage * 25);
  const selectedRows = (result?.items ?? []).filter((row) => selected.has(row.id));
  const one = selectedRows.length === 1 ? selectedRows[0] : undefined;
  const allSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.id));
  const changed = () => {
    setRevision((value) => value + 1);
  };
  const openForm = (catalog: ProductCatalogDto | null) => {
    setDetail(null);
    setForm({ catalog });
  };
  const select = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const exportRows = () =>
    downloadXlsx(
      {
        headers: [
          'ID',
          'Título',
          'Descripción',
          'Archivo PDF',
          'Tamaño (bytes)',
          'Vigente desde',
          'Vigente hasta',
          'Estado',
          'Enlaces activos',
          'Enlaces generados',
          'Creado por',
          'Fecha de creación',
          'Modificado por',
          'Fecha de modificación',
        ],
        rows: table.visibleRows.map((row) => [
          row.code,
          row.title,
          row.description,
          row.fileName,
          row.fileSize,
          row.validFrom,
          row.validUntil ?? 'Sin vencimiento',
          row.status,
          row.activeLinks,
          row.totalLinks,
          row.createdBy,
          row.createdAt,
          row.updatedBy,
          row.updatedAt,
        ]),
      },
      'catalogos.xlsx',
    );
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError('');
    let completed = 0;
    try {
      for (const row of deleting) {
        await deleteProductCatalog(row.id, row.updatedAt);
        completed += 1;
      }
      setDeleting(null);
      setNotice(
        `${completed} catálogo${completed === 1 ? ' eliminado' : 's eliminados'}. Puedes restaurarlos desde Eliminados.`,
      );
    } catch (reason) {
      setDeleting(null);
      setError(
        `${completed ? `${completed} catálogo(s) eliminados. ` : ''}${conflictMessage(reason)}`,
      );
    } finally {
      setBusy(false);
      changed();
    }
  };
  const restoreSelected = async () => {
    if (!one || !canManage) return;
    setBusy(true);
    setError('');
    try {
      await restoreProductCatalog(one.id, one.updatedAt);
      setNotice('Catálogo restaurado.');
      changed();
    } catch (reason) {
      setError(conflictMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setQuery('');
    setAppliedQuery('');
    setScope('active');
    table.clear();
  };
  const disabled = loading || busy || query.trim() !== appliedQuery;
  const metrics = result?.metrics;
  return (
    <div className="min-w-0 space-y-4">
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm"
        role="toolbar"
        aria-label="Acciones de catálogos"
      >
        <Button
          size="sm"
          disabled={!canManage || busy}
          title={!canManage ? 'Solo Administrador y Compras pueden subir catálogos.' : undefined}
          onClick={() => openForm(null)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Subir catálogo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canManage || !one || Boolean(one.deletedAt) || disabled}
          onClick={() => one && openForm(one)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canShare || !one || !canShareCatalog(one) || disabled}
          onClick={() => one && setDetail({ catalog: one, focusShare: true })}
        >
          <Share2 className="size-3.5" aria-hidden="true" />
          Compartir
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !canManage ||
            !selectedRows.length ||
            selectedRows.some((row) => row.deletedAt) ||
            disabled
          }
          onClick={() => setDeleting(selectedRows)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Eliminar{selectedRows.length ? ` (${selectedRows.length})` : ''}
        </Button>
        {canManage && (scope !== 'active' || one?.deletedAt) ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!one?.deletedAt || disabled}
            onClick={() => void restoreSelected()}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Restaurar
          </Button>
        ) : null}
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Button
          size="sm"
          variant="outline"
          disabled={!table.visibleRows.length || disabled}
          onClick={exportRows}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Exportar Excel
        </Button>
        <label className="relative min-w-60 flex-1 sm:ml-auto">
          <span className="sr-only">Buscar catálogos</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-9 pl-9 text-xs"
            placeholder="Buscar por título, descripción, archivo o usuario…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {error || loadError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
        >
          {error || loadError}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError('');
              changed();
            }}
          >
            Reintentar
          </Button>
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {metrics && metrics.catalogs > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Catálogos',
              value: metrics.catalogs,
              note: 'cargados en PDF',
              icon: FileText,
              color: 'bg-orange-50 text-primary',
            },
            {
              label: 'Vigentes',
              value: metrics.current,
              note: `${metrics.expiring} por vencer en 30 días`,
              icon: CheckCircle2,
              color: 'bg-emerald-50 text-emerald-700',
            },
            {
              label: 'Vencidos / programados',
              value: `${metrics.expired} / ${metrics.scheduled}`,
              note: 'fuera de vigencia hoy',
              icon: Clock3,
              color: 'bg-amber-50 text-amber-700',
            },
            {
              label: 'Enlaces activos',
              value: metrics.activeLinks,
              note: 'compartidos y sin vencer',
              icon: Link2,
              color: 'bg-blue-50 text-blue-700',
            },
          ].map(({ label, value, note: helper, icon: Icon, color }) => (
            <Card key={label} className="flex items-start gap-3 p-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-full ${color}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="my-1 text-2xl font-bold tabular-nums">{value}</dd>
                <p className="text-[11px] text-muted-foreground">{helper}</p>
              </div>
            </Card>
          ))}
        </dl>
      ) : null}
      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              Catálogos · {table.visibleRows.length}
              {table.visibleRows.length !== rows.length ? ` de ${rows.length}` : ''}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Clic en el título para ver el detalle, compartir y su historial. Marca un catálogo
              para las acciones de la barra.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canManage ? (
              <label className="flex items-center gap-2 text-xs">
                Mostrar
                <select
                  aria-label="Mostrar catálogos"
                  value={scope}
                  onChange={(event) => setScope(event.target.value as typeof scope)}
                  className="h-8 rounded-md border bg-white px-2"
                >
                  <option value="active">Disponibles</option>
                  <option value="deleted">Eliminados</option>
                  <option value="all">Todos</option>
                </select>
              </label>
            ) : null}
            <Button size="sm" variant="ghost" disabled={loading || busy} onClick={changed}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>
        {loading ? (
          <p role="status" className="p-6 text-center text-xs text-muted-foreground">
            Cargando catálogos…
          </p>
        ) : (
          <>
            <ExcelTableFilterBar
              filteredColumns={table.filteredColumnKeys.map(
                (key) => columns.find((column) => column.key === key)?.label ?? key,
              )}
              sort={
                table.sort
                  ? {
                      label:
                        columns.find((column) => column.key === table.sort?.key)?.label ??
                        table.sort.key,
                      direction: table.sort.direction,
                    }
                  : undefined
              }
              visibleCount={table.visibleRows.length}
              totalCount={rows.length}
              onClear={clear}
            />
            {table.visibleRows.length ? (
              <div className="overflow-x-auto" tabIndex={0} aria-label="Tabla de catálogos PDF">
                <table className="w-full min-w-[1580px] border-collapse text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="sticky left-0 z-10 w-10 bg-slate-50">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los visibles"
                          checked={allSelected}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              for (const row of pageRows) {
                                if (event.target.checked) next.add(row.id);
                                else next.delete(row.id);
                              }
                              return next;
                            })
                          }
                        />
                      </th>
                      {columns.map((column) => (
                        <th key={column.key}>
                          <ExcelTableHeader
                            columnKey={column.key}
                            label={column.label}
                            options={table.getValueOptions(column.key)}
                            selectedValues={table.filters[column.key]}
                            sortDirection={
                              table.sort?.key === column.key ? table.sort.direction : undefined
                            }
                            onFilterChange={(values) => table.setColumnFilter(column.key, values)}
                            onSort={(direction) => table.setSort(column.key, direction)}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr
                        key={row.id}
                        className={selected.has(row.id) ? 'bg-orange-50' : 'hover:bg-slate-50/60'}
                      >
                        <td
                          className={`sticky left-0 ${selected.has(row.id) ? 'bg-orange-50' : 'bg-white'}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${row.title}`}
                            checked={selected.has(row.id)}
                            onChange={(event) => select(row.id, event.target.checked)}
                          />
                        </td>
                        {columns.map((column) => (
                          <td key={column.key} className="max-w-64 align-top">
                            {column.key === 'title' ? (
                              <button
                                className="text-left font-semibold text-primary hover:underline"
                                onClick={() => setDetail({ catalog: row, focusShare: false })}
                              >
                                {row.title}
                              </button>
                            ) : column.key === 'code' ? (
                              <code>{row.code}</code>
                            ) : column.key === 'status' ? (
                              <StatusBadge tone={statusTones[row.status] ?? 'neutral'}>
                                {row.status}
                              </StatusBadge>
                            ) : column.key === 'fileName' ? (
                              <>
                                <a
                                  className="flex items-center gap-1 text-primary hover:underline"
                                  href={productCatalogDownloadUrl(row.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-disabled={Boolean(row.deletedAt)}
                                  onClick={(event) => {
                                    if (row.deletedAt) event.preventDefault();
                                  }}
                                >
                                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{row.fileName}</span>
                                </a>
                                <small className="text-muted-foreground">
                                  {fileSize(row.fileSize)}
                                </small>
                              </>
                            ) : (
                              <span
                                className="block truncate"
                                title={displayValue(row, column.key)}
                              >
                                {displayValue(row, column.key)}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid justify-items-center gap-3 px-5 py-12 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-orange-50 text-primary">
                  <FileText className="size-7" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold">
                  {appliedQuery || table.filteredColumnKeys.length
                    ? 'Sin catálogos para estos filtros'
                    : scope === 'deleted'
                      ? 'No hay catálogos eliminados'
                      : 'Todavía no hay catálogos'}
                </h3>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  {appliedQuery || table.filteredColumnKeys.length
                    ? 'Cambia la búsqueda o quita los filtros para consultar los catálogos disponibles.'
                    : scope === 'deleted'
                      ? 'Las bajas aparecerán aquí para consultar su historial y restaurarlas.'
                      : 'Sube el PDF de un catálogo con su título, descripción y vigencia. Después podrás compartirlo con un enlace que vence en el plazo que elijas.'}
                </p>
                {appliedQuery || table.filteredColumnKeys.length ? (
                  <Button size="sm" variant="outline" onClick={clear}>
                    Quitar filtros
                  </Button>
                ) : canManage && scope === 'active' ? (
                  <Button size="sm" onClick={() => openForm(null)}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    Subir catálogo
                  </Button>
                ) : null}
              </div>
            )}
            {table.visibleRows.length ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <span>
                  {(currentPage - 1) * 25 + 1}–
                  {Math.min(currentPage * 25, table.visibleRows.length)} de{' '}
                  {table.visibleRows.length} catálogos
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {currentPage} de {pages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
        <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">
          {!canManage
            ? 'Tu rol consulta, descarga y comparte; suben, editan y eliminan Administrador y Compras. '
            : ''}
          La exportación incluye todos los catálogos que coinciden con los filtros. Las bajas y los
          enlaces quedan registrados en Auditoría.
        </p>
      </Card>
      {form ? (
        <CatalogForm
          catalog={form.catalog}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            setNotice(`Catálogo ${saved.code} ${form.catalog ? 'actualizado' : 'subido'}.`);
            changed();
          }}
        />
      ) : null}
      {detail ? (
        <CatalogDetail
          key={detail.catalog.id}
          catalog={detail.catalog}
          focusShare={detail.focusShare}
          canManage={canManage}
          canShare={canShare}
          canViewAudit={canViewAudit}
          onClose={() => setDetail(null)}
          onEdit={openForm}
          onChanged={changed}
        />
      ) : null}
      {deleting ? (
        <WorkspaceDrawer
          title="Eliminar catálogos"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
          busy={busy}
        >
          <p className="text-sm">
            Se darán de baja {deleting.length} catálogo(s). Sus enlaces dejarán de mostrar el PDF:
          </p>
          <ul className="my-4 space-y-2 rounded-md border bg-slate-50 p-4 text-sm">
            {deleting.map((row) => (
              <li key={row.id}>
                <code className="mr-2 text-xs">{row.code}</code>
                {row.title}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            La baja es reversible desde Eliminados. Se registra quién la realizó y cuándo. Los
            enlaces revocados conservan su estado al restaurar.
          </p>
          <div className="mt-5 flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
