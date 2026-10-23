'use client';

import type {
  AdminAttributeRoleAccessDto,
  AdminCatalogCategoryDto,
  AdminTemplateAttributeDto,
  AdminTemplateDto,
  UpdateTemplateAttributeInput,
} from '@cdr/contracts';
import { Pencil, RefreshCw, Search, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CatalogAdminApiError,
  getAdminTemplate,
  listAdminCategories,
  listAdminTemplates,
  updateAdminTemplateAttribute,
} from '@/lib/catalog-admin-api';
import { cn } from '@/lib/utils';

const roles = ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'] as const;
type BusinessRole = (typeof roles)[number];
type Permission = 'canView' | 'canEdit' | 'canImport' | 'canExport';

const roleLabels: Record<BusinessRole, string> = {
  ADMINISTRADOR: 'Administrador',
  COMPRAS: 'Compras',
  VENTAS: 'Ventas',
};

const permissionLabels: Record<Permission, string> = {
  canView: 'Ver',
  canEdit: 'Editar',
  canImport: 'Importar',
  canExport: 'Exportar',
};

export interface AttributeDraft {
  active: boolean;
  required: boolean;
  replicable: boolean;
  searchable: boolean;
  includeInTechnicalSheet: boolean;
  position: string;
  roleAccess: AdminAttributeRoleAccessDto[];
}

export function buildTemplateAttributeUpdateInput(
  draft: AttributeDraft,
  expectedUpdatedAt: string,
  canManageRoleAccess: boolean,
): UpdateTemplateAttributeInput {
  const input: UpdateTemplateAttributeInput = {
    active: draft.active,
    required: draft.required,
    replicable: draft.replicable,
    searchable: draft.searchable,
    includeInTechnicalSheet: draft.includeInTechnicalSheet,
    position: Number(draft.position),
    expectedUpdatedAt,
  };

  if (canManageRoleAccess) input.roleAccess = draft.roleAccess;
  return input;
}

export function completeRoleAccess(
  access: readonly AdminAttributeRoleAccessDto[],
): AdminAttributeRoleAccessDto[] {
  return roles.map(
    (role) =>
      access.find((entry) => entry.role === role) ?? {
        role,
        canView: false,
        canEdit: false,
        canImport: false,
        canExport: false,
      },
  );
}

export function updateRolePermission(
  access: readonly AdminAttributeRoleAccessDto[],
  role: BusinessRole,
  permission: Permission,
  checked: boolean,
): AdminAttributeRoleAccessDto[] {
  return completeRoleAccess(access).map((entry) => {
    if (entry.role !== role) return entry;
    if (permission === 'canView' && !checked) {
      return { ...entry, canView: false, canEdit: false, canImport: false, canExport: false };
    }
    if (permission !== 'canView' && checked) {
      return { ...entry, canView: true, [permission]: true };
    }
    return { ...entry, [permission]: checked };
  });
}

function toDraft(attribute: AdminTemplateAttributeDto): AttributeDraft {
  return {
    active: attribute.active,
    required: attribute.required,
    replicable: attribute.replicable,
    searchable: attribute.searchable,
    includeInTechnicalSheet: attribute.includeInTechnicalSheet,
    position: String(attribute.position),
    roleAccess: completeRoleAccess(attribute.roleAccess),
  };
}

function AttributeSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'text-primary' : 'text-slate-500',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-primary' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-3',
          )}
        />
      </span>
      {checked ? 'Sí' : 'No'}
    </button>
  );
}

export function TemplatesAdminWorkspace({ canManageTemplate }: { canManageTemplate: boolean }) {
  const [categories, setCategories] = useState<AdminCatalogCategoryDto[]>([]);
  const [pendingCategoryId, setPendingCategoryId] = useState('');
  const [templates, setTemplates] = useState<AdminTemplateDto[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState<AdminTemplateDto | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [requiredFilter, setRequiredFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [replicableFilter, setReplicableFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [exportFilter, setExportFilter] = useState('');
  const [editing, setEditing] = useState<AdminTemplateAttributeDto | null>(null);
  const [draft, setDraft] = useState<AttributeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const templateRequest = useRef(0);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('template');
    if (requested) setTemplateId(requested);
  }, []);

  useEffect(() => {
    void listAdminCategories(true)
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const result = await listAdminTemplates();
      setTemplates(result);
      setTemplateId((current) =>
        result.some((item) => item.id === current) ? current : (result[0]?.id ?? ''),
      );
      if (result.length === 0) setTemplate(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar las plantillas.',
      );
      setTemplates([]);
      setTemplate(null);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => void loadTemplates(), [loadTemplates]);

  const loadTemplate = useCallback(async (selectedId: string) => {
    const requestId = ++templateRequest.current;
    if (!selectedId) {
      setTemplate(null);
      setLoadingTemplate(false);
      return;
    }
    setLoadingTemplate(true);
    setError(null);
    try {
      const result = await getAdminTemplate(selectedId);
      if (requestId === templateRequest.current) setTemplate(result);
    } catch (requestError) {
      if (requestId !== templateRequest.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar la plantilla.',
      );
      setTemplate(null);
    } finally {
      if (requestId === templateRequest.current) setLoadingTemplate(false);
    }
  }, []);

  useEffect(() => void loadTemplate(templateId), [loadTemplate, templateId]);

  const attributes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return (template?.attributes ?? [])
      .filter((attribute) => !activeFilter || String(attribute.active) === activeFilter)
      .filter(
        (attribute) =>
          !sectionFilter ||
          sectionFilter === (attribute.sourceAuthority === 'erp' ? 'erp' : 'enrichment'),
      )
      .filter((attribute) => !kindFilter || attribute.dataType === kindFilter)
      .filter((attribute) => !requiredFilter || String(attribute.required) === requiredFilter)
      .filter((attribute) => !replicableFilter || String(attribute.replicable) === replicableFilter)
      .filter(
        (attribute) => !exportFilter || String(attribute.includeInTechnicalSheet) === exportFilter,
      )
      .filter((attribute) => {
        if (!roleFilter) return true;
        const [role, visible] = roleFilter.split(':');
        return (
          String(attribute.roleAccess.find((access) => access.role === role)?.canView ?? false) ===
          visible
        );
      })
      .filter(
        (attribute) =>
          !normalized ||
          [attribute.label, attribute.key, attribute.dataType, attribute.sourceAuthority].some(
            (value) => value.toLocaleLowerCase('es').includes(normalized),
          ),
      )
      .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));
  }, [
    query,
    activeFilter,
    sectionFilter,
    kindFilter,
    requiredFilter,
    replicableFilter,
    exportFilter,
    roleFilter,
    template?.attributes,
  ]);
  const visibleTemplates = useMemo(() => {
    const normalized = templateQuery.trim().toLocaleLowerCase('es');
    if (!normalized) return templates;
    return templates.filter((item) =>
      [item.name, item.categoryName, item.variantKey, item.status].some((value) =>
        value.toLocaleLowerCase('es').includes(normalized),
      ),
    );
  }, [templateQuery, templates]);

  const parentIds = new Set(categories.map((category) => category.parentId).filter(Boolean));
  const pendingCategories = categories.filter(
    (category) =>
      !parentIds.has(category.id) &&
      !templates.some((item) => item.categoryId === category.id && item.status === 'active'),
  );
  const visiblePendingCategories = pendingCategories.filter(
    (category) =>
      !templateQuery.trim() ||
      `${category.name} ${category.path}`
        .toLocaleLowerCase('es')
        .includes(templateQuery.trim().toLocaleLowerCase('es')),
  );
  const pendingCategory = categories.find((category) => category.id === pendingCategoryId);
  const selectedCategory = categories.find((category) => category.id === template?.categoryId);
  const sourcePriority = Object.entries(selectedCategory?.sourcePriority ?? {}).sort(
    (left, right) => Number(left[1]) - Number(right[1]),
  );
  const policyLabels = {
    FT: 'Ficha técnica',
    MSDS: 'Ficha de seguridad MSDS',
    CERT: 'Certificado de conformidad',
    PLANO: 'Plano técnico',
    FOTO: 'Fotografía del producto',
  };
  const assetPolicies = template?.assetRequirements ?? [];
  const visibleAssetPolicies = assetPolicies.filter(
    (policy) =>
      (!sectionFilter || sectionFilter === 'asset') &&
      (!kindFilter || kindFilter === (policy.type === 'FOTO' ? 'image' : 'file')) &&
      (!requiredFilter || String(policy.required) === requiredFilter) &&
      (!activeFilter || activeFilter === 'true') &&
      !replicableFilter &&
      !roleFilter &&
      !exportFilter &&
      (!query.trim() ||
        `${policyLabels[policy.type]} ${policy.type}`
          .toLocaleLowerCase('es')
          .includes(query.trim().toLocaleLowerCase('es'))),
  );
  const typeLabels = {
    text: 'Alfanumérico',
    number: 'Numérico',
    measurement: 'Medida',
    boolean: 'Sí / No',
    date: 'Fecha',
    enum: 'Lista',
  };
  const sourceLabels = {
    erp: 'ERP · Sismetic / AX',
    pim: 'Enriquecimiento PIM',
    supplier: 'Proveedor',
    calculated: 'Calculado',
  };
  const priorityLabels: Record<string, string> = {
    fabricante: 'Fabricante',
    archivo: 'Archivo',
    manual: 'Manual',
    tecdoc: 'TecDoc',
  };

  const beginEdit = (attribute: AdminTemplateAttributeDto) => {
    setEditing(attribute);
    setDraft(toDraft(attribute));
    setError(null);
    setNotice(null);
  };

  const changeRolePermission = (role: BusinessRole, permission: Permission, checked: boolean) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            roleAccess: updateRolePermission(current.roleAccess, role, permission, checked),
          }
        : current,
    );
  };

  const hasUnsavedChanges = Boolean(
    editing && draft && JSON.stringify(toDraft(editing)) !== JSON.stringify(draft),
  );
  const closeEditor = () => {
    if (
      saving ||
      (hasUnsavedChanges &&
        !window.confirm(
          'Tienes cambios sin guardar. ¿Quieres descartarlos y cerrar la configuración?',
        ))
    )
      return;
    setEditing(null);
    setDraft(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !template || !editing || !draft) return;
    const position = Number(draft.position);
    if (!Number.isInteger(position) || position < 0) {
      setError('La posición debe ser un número entero mayor o igual a cero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAdminTemplateAttribute(
        template.id,
        editing.id,
        buildTemplateAttributeUpdateInput(draft, editing.updatedAt, canManageTemplate),
      );
      setNotice('Configuración del atributo actualizada y auditada correctamente.');
      setEditing(null);
      setDraft(null);
      await loadTemplate(template.id);
    } catch (requestError) {
      if (requestError instanceof CatalogAdminApiError && requestError.status === 409) {
        setEditing(null);
        setDraft(null);
        await loadTemplate(template.id);
        setError(
          'Otra persona modificó este atributo. Recargamos la plantilla vigente; vuelve a intentar tu cambio.',
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible guardar el atributo.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const updateFromTable = async (
    attribute: AdminTemplateAttributeDto,
    input: Omit<UpdateTemplateAttributeInput, 'expectedUpdatedAt'>,
  ) => {
    if (!template || !canManageTemplate || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateAdminTemplateAttribute(template.id, attribute.id, {
        ...input,
        expectedUpdatedAt: attribute.updatedAt,
      });
      setTemplate((current) =>
        current
          ? {
              ...current,
              attributes: current.attributes?.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setNotice(`${attribute.label}: configuración actualizada y auditada.`);
    } catch (requestError) {
      if (requestError instanceof CatalogAdminApiError && requestError.status === 409) {
        await loadTemplate(template.id);
        setError(
          'Otra persona modificó este atributo. Recargamos la configuración vigente; vuelve a intentar tu cambio.',
        );
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible guardar el atributo.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Plantilla dinámica"
        description="Configuración de atributos por categoría."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/administration?view=settings">Catálogos</Link>
            </Button>
            <Button
              variant="outline"
              disabled
              title="La creación de atributos aún no está disponible"
            >
              Añadir atributo
            </Button>
            <Button
              onClick={() => void loadTemplate(templateId)}
              disabled={!templateId || loadingTemplate}
            >
              <RefreshCw
                className={loadingTemplate ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
              />
              Actualizar plantilla
            </Button>
          </>
        }
      />
      <ScreenGuide
        objective={
          canManageTemplate
            ? 'Gobierna el comportamiento de cada atributo y la matriz de permisos de la plantilla seleccionada.'
            : 'Gobierna el comportamiento operativo de cada atributo y consulta la matriz de permisos vigente.'
        }
        actions={[
          'Filtra por categoría y elige una variante y versión de plantilla para revisar todos sus atributos.',
          canManageTemplate
            ? 'Configura vigencia, obligatoriedad, replicación, búsqueda, ficha técnica, posición y permisos por rol.'
            : 'Consulta reglas y permisos vigentes; sólo Administración puede modificar la plantilla.',
        ]}
        dataSource="Las plantillas, asignaciones y permisos se leen y actualizan mediante la API administrativa con control de concurrencia."
        limitation="No se crean ni publican nuevas versiones desde esta pantalla porque el backend aún no ofrece endpoints aprobados para esas operaciones."
      />

      {notice ? (
        <div
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {error && template ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="mb-[18px] grid items-start gap-5 min-[901px]:grid-cols-[280px_minmax(0,1fr)]">
        <Card
          className="max-h-80 overflow-auto p-4 min-[901px]:sticky min-[901px]:top-3 min-[901px]:max-h-[calc(100dvh-24px)]"
          aria-label="Selector de plantilla"
        >
          <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
            Buscar plantilla
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9 normal-case tracking-normal"
                value={templateQuery}
                onChange={(event) => setTemplateQuery(event.target.value)}
                placeholder="Nombre, línea u hoja…"
              />
            </span>
          </label>
          <div className="mt-2 space-y-0.5">
            {visibleTemplates.map((item, index) => (
              <button
                key={item.id}
                type="button"
                disabled={saving}
                aria-pressed={item.id === templateId}
                onClick={() => {
                  setPendingCategoryId('');
                  setTemplateId(item.id);
                  setEditing(null);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition',
                  item.id === templateId
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'hover:bg-slate-50',
                )}
              >
                <span
                  className={`grid h-6 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold ${item.id === templateId ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs leading-tight">{item.name}</strong>
                  <small className="block truncate text-[10px] text-muted-foreground">
                    {item.id === template?.id
                      ? `${template.attributes?.length ?? 0} atributos · ${template.attributes?.filter((attribute) => attribute.active && attribute.required).length ?? 0} obligatorios`
                      : `Variante ${item.variantKey} · versión ${item.version}`}
                  </small>
                </span>
              </button>
            ))}
            {visiblePendingCategories.length ? (
              <>
                <h3 className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pendientes de definición
                </h3>
                {visiblePendingCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    disabled={saving}
                    aria-pressed={pendingCategoryId === category.id}
                    onClick={() => {
                      setPendingCategoryId(category.id);
                      setTemplateId('');
                      setEditing(null);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left ${pendingCategoryId === category.id ? 'border-orange-200 bg-orange-50' : 'border-transparent hover:bg-slate-50'}`}
                  >
                    <span className="grid h-6 w-7 shrink-0 place-items-center rounded-md bg-amber-50 text-xs text-amber-800">
                      —
                    </span>
                    <span>
                      <strong className="block text-xs leading-tight">{category.name}</strong>
                      <small className="text-[10px] text-muted-foreground">
                        Sin plantilla activa
                      </small>
                    </span>
                  </button>
                ))}
              </>
            ) : null}
            {visibleTemplates.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted-foreground">
                Sin plantillas que coincidan.
              </p>
            ) : null}
          </div>
        </Card>
        <div className="min-w-0 space-y-3">
          {pendingCategory ? (
            <Card className="grid min-h-80 place-items-center p-8 text-center">
              <div>
                <StatusBadge tone="warning">Pendiente de definición</StatusBadge>
                <h2 className="mt-3 text-lg font-semibold">{pendingCategory.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Esta categoría no tiene una plantilla activa. Sus atributos y reglas se mostrarán
                  cuando exista una definición aprobada.
                </p>
              </div>
            </Card>
          ) : template ? (
            <>
              <Card className="grid gap-6 px-5 py-[18px] min-[1281px]:grid-cols-[minmax(0,1fr)_240px]">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Plantilla PIM · variante {template.variantKey} · versión {template.version}
                  </p>
                  <h2 className="text-base font-semibold">{template.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      Aplicación: {selectedCategory?.application ?? 'Pendiente'}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      Categoría final: {selectedCategory?.path ?? template.categoryName}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {template.status === 'active'
                        ? 'Activa'
                        : template.status === 'draft'
                          ? 'Borrador'
                          : 'Retirada'}
                    </span>
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      ['Atributos', template.attributes?.length ?? 0],
                      [
                        'Inactivos',
                        template.attributes?.filter((item) => !item.active).length ?? 0,
                      ],
                      [
                        'Obligatorios activos',
                        template.attributes?.filter((item) => item.active && item.required)
                          .length ?? 0,
                      ],
                      [
                        'Opcionales',
                        template.attributes?.filter((item) => item.active && !item.required)
                          .length ?? 0,
                      ],
                      [
                        'Base ERP',
                        template.attributes?.filter((item) => item.sourceAuthority === 'erp')
                          .length ?? 0,
                      ],
                      ...(template.assetRequirements
                        ? [['Archivo / imagen', assetPolicies.length]]
                        : []),
                      [
                        'Con unidad',
                        template.attributes?.filter((item) => Boolean(item.unit)).length ?? 0,
                      ],
                      [
                        'Replicables',
                        template.attributes?.filter((item) => item.active && item.replicable)
                          .length ?? 0,
                      ],
                      [
                        'Visibles COMPRAS',
                        template.attributes?.filter(
                          (item) =>
                            item.active &&
                            item.roleAccess.some(
                              (access) => access.role === 'COMPRAS' && access.canView,
                            ),
                        ).length ?? 0,
                      ],
                      [
                        'Visibles VENTAS',
                        template.attributes?.filter(
                          (item) =>
                            item.active &&
                            item.roleAccess.some(
                              (access) => access.role === 'VENTAS' && access.canView,
                            ),
                        ).length ?? 0,
                      ],
                      [
                        'Exportables',
                        template.attributes?.filter(
                          (item) => item.active && item.includeInTechnicalSheet,
                        ).length ?? 0,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-baseline gap-1.5 rounded-full border px-2 py-0.5"
                      >
                        <dt className="text-[10px] text-muted-foreground">{label}</dt>
                        <dd className="text-xs font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <aside className="border-t pt-4 min-[1281px]:border-l min-[1281px]:border-t-0 min-[1281px]:pl-6 min-[1281px]:pt-0">
                  <h3 className="text-sm font-semibold">Prioridad de fuentes</h3>
                  {sourcePriority.length ? (
                    <ol className="mt-3 space-y-2">
                      {sourcePriority.map(([source, rank]) => (
                        <li key={source} className="flex items-center gap-2.5 text-xs">
                          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-orange-50 text-[11px] font-semibold text-primary">
                            {rank}
                          </span>
                          {priorityLabels[source] ?? source}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Sin prioridad de fuentes configurada para esta categoría.
                    </p>
                  )}
                  <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                    Matriz BUSQUEDA de la categoría. El dato base ERP no compite: llega por PUSH y
                    es de solo lectura.
                  </p>
                </aside>
              </Card>
              <Card className="px-5 py-[18px]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Alta desde AX · atributos replicables
                </p>
                <h2 className="mt-2 text-base font-semibold">¿Qué hereda un SKU nuevo?</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Los atributos marcados como replicables se comparten entre los SKU de un mismo
                  código unificador. Los demás se completan en cada producto; los datos base ERP
                  llegan desde AX.
                </p>
                <div className="my-4 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="rounded-lg border bg-slate-50 px-3 py-2">
                    <small className="block text-[10px] text-muted-foreground">
                      MISMO CÓDIGO UNIFICADOR
                    </small>
                    <strong className="text-sm">Atributos replicables de la plantilla</strong>
                  </div>
                  <span aria-hidden="true" className="text-center text-lg text-primary">
                    ›
                  </span>
                  <div className="rounded-lg border bg-slate-50 px-3 py-2">
                    <small className="block text-[10px] text-muted-foreground">
                      IDENTIDAD PROPIA
                    </small>
                    <strong className="text-sm">Cada SKU conserva su código de artículo</strong>
                  </div>
                </div>
                <dl className="grid gap-3 sm:grid-cols-4">
                  {[
                    [
                      'Replicables',
                      template.attributes?.filter(
                        (item) => item.active && item.replicable && item.sourceAuthority === 'pim',
                      ).length ?? 0,
                    ],
                    [
                      'Obligatorios no replicables',
                      template.attributes?.filter(
                        (item) =>
                          item.active &&
                          item.required &&
                          !item.replicable &&
                          item.sourceAuthority === 'pim',
                      ).length ?? 0,
                    ],
                    [
                      'Opcionales no replicables',
                      template.attributes?.filter(
                        (item) =>
                          item.active &&
                          !item.required &&
                          !item.replicable &&
                          item.sourceAuthority === 'pim',
                      ).length ?? 0,
                    ],
                    [
                      'Base ERP (llega de AX)',
                      template.attributes?.filter(
                        (item) => item.active && item.sourceAuthority === 'erp',
                      ).length ?? 0,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border px-3 py-2">
                      <dt className="text-[10px] text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-base font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">
                    Vista consultiva de la configuración vigente; no recibe ni crea productos en AX.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReplicableFilter('true');
                      setSectionFilter('enrichment');
                      document
                        .getElementById('template-attributes')
                        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    Ver atributos replicables
                  </Button>
                </div>
              </Card>
            </>
          ) : loadingList || loadingTemplate ? null : (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Selecciona una plantilla para consultar su definición.
            </Card>
          )}
          {canManageTemplate && editing && draft ? (
            <WorkspaceDrawer
              title="Configurar atributo"
              busy={saving}
              unsavedChanges={hasUnsavedChanges}
              onClose={closeEditor}
            >
              <form onSubmit={save}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Configurar atributo
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">{editing.label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {editing.key} · {editing.dataType}
                      {editing.unit ? ` · ${editing.unit}` : ''} · fuente {editing.sourceAuthority}
                    </p>
                  </div>
                </div>

                {error ? (
                  <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </p>
                ) : null}

                <fieldset disabled={saving}>
                  <legend className="mb-2 text-sm font-semibold">Comportamiento</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ['active', 'Activo'],
                        ['required', 'Obligatorio'],
                        ['replicable', 'Replicable'],
                        ['searchable', 'Buscable'],
                        ['includeInTechnicalSheet', 'Incluir en ficha técnica'],
                      ] as const
                    ).map(([field, label]) => (
                      <label
                        key={field}
                        className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft[field]}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, [field]: event.target.checked } : current,
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                      Posición
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft.position}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, position: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="mt-5" disabled={saving}>
                  <legend className="mb-2 text-sm font-semibold">Permisos por rol</legend>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead className="border-b bg-slate-50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Rol</th>
                          {(Object.keys(permissionLabels) as Permission[]).map((permission) => (
                            <th key={permission} className="px-4 py-3 text-center">
                              {permissionLabels[permission]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {draft.roleAccess.map((access) => (
                          <tr key={access.role}>
                            <th scope="row" className="px-4 py-3 text-left font-semibold">
                              {roleLabels[access.role]}
                            </th>
                            {(Object.keys(permissionLabels) as Permission[]).map((permission) => (
                              <td key={permission} className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`${permissionLabels[permission]} para ${roleLabels[access.role]}`}
                                  checked={access[permission]}
                                  onChange={(event) =>
                                    changeRolePermission(
                                      access.role,
                                      permission,
                                      event.target.checked,
                                    )
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Activar edición, importación o exportación concede también visibilidad. Quitar
                    visibilidad revoca las demás operaciones del rol.
                  </p>
                </fieldset>

                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={saving} onClick={closeEditor}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Settings2 className="size-4" aria-hidden="true" />
                    )}
                    {saving ? 'Guardando…' : 'Guardar configuración'}
                  </Button>
                </div>
              </form>
            </WorkspaceDrawer>
          ) : null}

          {pendingCategory ? null : loadingList || loadingTemplate ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : error && !template ? (
            <StatePanel
              variant="error"
              title="No pudimos cargar la plantilla"
              description={error}
              actionLabel="Reintentar"
              onAction={() => void loadTemplates()}
            />
          ) : !template ? (
            <StatePanel
              variant="empty"
              title="Sin plantillas"
              description="No hay versiones de plantilla para la categoría seleccionada."
            />
          ) : (
            <Card id="template-attributes" className="scroll-mt-3 overflow-hidden">
              <div className="px-5 pb-3 pt-4">
                <h2 className="text-base font-semibold">
                  Atributos · {attributes.length + visibleAssetPolicies.length} de{' '}
                  {(template.attributes?.length ?? 0) + assetPolicies.length}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Orden de la plantilla. Los datos base ERP son de solo lectura en la ficha. COMPRAS
                  y VENTAS indican la visibilidad por rol; Exportable controla la ficha técnica
                  descargable. Al desactivar un atributo conserva sus valores y deja de contar en la
                  completitud.
                </p>
              </div>
              <div className="grid gap-2.5 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1.6fr)_repeat(3,minmax(0,1fr))] [&_select]:h-9 [&_select]:min-w-0 [&_select]:rounded-md [&_select]:border [&_select]:bg-white [&_select]:px-2 [&_select]:text-xs">
                <label>
                  <span className="sr-only">Buscar atributos</span>
                  <Input
                    className="h-9 text-xs"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar atributo o clave…"
                  />
                </label>
                <select
                  aria-label="Sección"
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                >
                  <option value="">Todas las secciones</option>
                  <option value="erp">Base ERP</option>
                  <option value="enrichment">Enriquecimiento</option>
                  <option value="asset">Archivo / imagen</option>
                </select>
                <select
                  aria-label="Tipo de atributo"
                  value={kindFilter}
                  onChange={(event) => setKindFilter(event.target.value)}
                >
                  <option value="">Todos los tipos</option>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                  <option value="file">Archivo</option>
                  <option value="image">Imagen</option>
                </select>
                <select
                  aria-label="Obligatoriedad"
                  value={requiredFilter}
                  onChange={(event) => setRequiredFilter(event.target.value)}
                >
                  <option value="">Obligatorio y opcional</option>
                  <option value="true">Obligatorio</option>
                  <option value="false">Opcional</option>
                </select>
                <select
                  aria-label="Estado del atributo"
                  value={activeFilter}
                  onChange={(event) => setActiveFilter(event.target.value)}
                >
                  <option value="">Activos e inactivos</option>
                  <option value="true">Solo activos</option>
                  <option value="false">Solo inactivos</option>
                </select>
                <select
                  aria-label="Replicable"
                  value={replicableFilter}
                  onChange={(event) => setReplicableFilter(event.target.value)}
                >
                  <option value="">Replicable y no replicable</option>
                  <option value="true">Solo replicables</option>
                  <option value="false">Solo no replicables</option>
                </select>
                <select
                  aria-label="Visibilidad por rol"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="">Todos los roles</option>
                  <option value="COMPRAS:true">Visibles para COMPRAS</option>
                  <option value="COMPRAS:false">Ocultos para COMPRAS</option>
                  <option value="VENTAS:true">Visibles para VENTAS</option>
                  <option value="VENTAS:false">Ocultos para VENTAS</option>
                </select>
                <select
                  aria-label="Exportable en la ficha técnica"
                  value={exportFilter}
                  onChange={(event) => setExportFilter(event.target.value)}
                >
                  <option value="">Exportables y no exportables</option>
                  <option value="true">Solo exportables</option>
                  <option value="false">Solo no exportables</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-left text-sm">
                  <caption className="sr-only">Atributos y permisos de {template.name}</caption>
                  <thead>
                    <tr>
                      {[
                        'Orden',
                        'Atributo',
                        'Activo',
                        'Tipo',
                        'Unidad',
                        'Fuente',
                        'Obligatorio',
                        'Replicable',
                        'COMPRAS',
                        'VENTAS',
                        'Exportable',
                        'Muestra',
                        'Acción',
                      ].map((label) => (
                        <th key={label} scope="col" className="px-2 py-1">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attributes.map((attribute) => (
                      <tr
                        key={attribute.id}
                        className={cn(
                          'border-t align-top',
                          !attribute.active && 'bg-slate-50 text-slate-500',
                        )}
                      >
                        <td className="px-2 py-1 text-center">{attribute.position}</td>
                        <td className="min-w-44 px-2 py-1">
                          <span className="block">{attribute.label}</span>
                          <code className="text-[10px] text-muted-foreground">{attribute.key}</code>
                        </td>
                        <td className="px-2 py-1">
                          <AttributeSwitch
                            checked={attribute.active}
                            disabled={!canManageTemplate || saving}
                            label={`Activo: ${attribute.label}`}
                            onChange={() =>
                              void updateFromTable(attribute, { active: !attribute.active })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">{typeLabels[attribute.dataType]}</td>
                        <td className="px-2 py-1">{attribute.unit ?? '—'}</td>
                        <td className="px-2 py-1 text-xs">
                          {sourceLabels[attribute.sourceAuthority]}
                        </td>
                        <td className="px-2 py-1">
                          <AttributeSwitch
                            checked={attribute.required}
                            disabled={!canManageTemplate || saving}
                            label={`Obligatorio: ${attribute.label}`}
                            onChange={() =>
                              void updateFromTable(attribute, { required: !attribute.required })
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <AttributeSwitch
                            checked={attribute.replicable}
                            disabled={!canManageTemplate || saving}
                            label={`Replicable: ${attribute.label}`}
                            onChange={() =>
                              void updateFromTable(attribute, { replicable: !attribute.replicable })
                            }
                          />
                        </td>
                        {(['COMPRAS', 'VENTAS'] as const).map((role) => {
                          const access = completeRoleAccess(attribute.roleAccess).find(
                            (item) => item.role === role,
                          )!;
                          return (
                            <td key={role} className="px-2 py-1">
                              <AttributeSwitch
                                checked={access.canView}
                                disabled={!canManageTemplate || saving}
                                label={`Visible para ${roleLabels[role]}: ${attribute.label}`}
                                onChange={() =>
                                  void updateFromTable(attribute, {
                                    roleAccess: updateRolePermission(
                                      attribute.roleAccess,
                                      role,
                                      'canView',
                                      !access.canView,
                                    ),
                                  })
                                }
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1">
                          <AttributeSwitch
                            checked={attribute.includeInTechnicalSheet}
                            disabled={!canManageTemplate || saving}
                            label={`Ficha técnica: ${attribute.label}`}
                            onChange={() =>
                              void updateFromTable(attribute, {
                                includeInTechnicalSheet: !attribute.includeInTechnicalSheet,
                              })
                            }
                          />
                        </td>
                        <td
                          className="px-2 py-1 text-muted-foreground"
                          title="La muestra original no está disponible para consulta"
                        >
                          —
                        </td>
                        <td className="px-2 py-1">
                          {canManageTemplate ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={saving}
                              onClick={() => beginEdit(attribute)}
                            >
                              <Pencil className="size-3" aria-hidden="true" />
                              Configurar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visibleAssetPolicies.map((policy) => (
                      <tr key={`asset-${policy.type}`} className="border-t align-top">
                        <td className="px-2 py-1">—</td>
                        <td className="px-2 py-1">
                          {policyLabels[policy.type]}
                          <code className="block text-[10px] text-muted-foreground">
                            {policy.type}
                          </code>
                        </td>
                        <td className="px-2 py-1">Sí</td>
                        <td className="px-2 py-1">
                          {policy.type === 'FOTO' ? 'Imagen' : 'Archivo'}
                        </td>
                        <td className="px-2 py-1">—</td>
                        <td className="px-2 py-1">Activo del producto</td>
                        <td className="px-2 py-1">
                          <StatusBadge tone={policy.required ? 'warning' : 'neutral'}>
                            {policy.required ? 'Obligatorio' : 'Opcional'}
                          </StatusBadge>
                        </td>
                        <td colSpan={5} className="px-2 py-1 text-xs text-muted-foreground">
                          Requisito documental de la plantilla · consulta
                        </td>
                        <td className="px-2 py-1">
                          <Link href="/documents" className="text-xs underline">
                            Ver activos
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!attributes.length && !visibleAssetPolicies.length ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                          Ningún atributo coincide con los filtros.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
