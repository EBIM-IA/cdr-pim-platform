'use client';

import type {
  AdminAttributeRoleAccessDto,
  AdminTemplateAttributeDto,
  AdminTemplateDto,
  UpdateTemplateAttributeInput,
} from '@cdr/contracts';
import { Pencil, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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

function flagLabel(value: boolean, positive: string): string {
  return value ? positive : 'No';
}

export function TemplatesAdminWorkspace({ canManageRoleAccess }: { canManageRoleAccess: boolean }) {
  const [categories, setCategories] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [templates, setTemplates] = useState<AdminTemplateDto[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState<AdminTemplateDto | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<AdminTemplateAttributeDto | null>(null);
  const [draft, setDraft] = useState<AttributeDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listAdminCategories(true)
      .then((result) =>
        setCategories(
          result.map((category) => ({
            id: category.id,
            name: category.name,
            active: category.active,
          })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const result = await listAdminTemplates(categoryId || undefined);
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
  }, [categoryId]);

  useEffect(() => void loadTemplates(), [loadTemplates]);

  const loadTemplate = useCallback(async (selectedId: string) => {
    if (!selectedId) {
      setTemplate(null);
      return;
    }
    setLoadingTemplate(true);
    setError(null);
    try {
      setTemplate(await getAdminTemplate(selectedId));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar la plantilla.',
      );
      setTemplate(null);
    } finally {
      setLoadingTemplate(false);
    }
  }, []);

  useEffect(() => void loadTemplate(templateId), [loadTemplate, templateId]);

  const attributes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return (template?.attributes ?? [])
      .filter((attribute) => showInactive || attribute.active)
      .filter(
        (attribute) =>
          !normalized ||
          [attribute.label, attribute.key, attribute.dataType, attribute.sourceAuthority].some(
            (value) => value.toLocaleLowerCase('es').includes(normalized),
          ),
      )
      .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));
  }, [query, showInactive, template?.attributes]);
  const visibleTemplates = useMemo(() => {
    const normalized = templateQuery.trim().toLocaleLowerCase('es');
    if (!normalized) return templates;
    return templates.filter((item) =>
      [item.name, item.categoryName, item.status].some((value) =>
        value.toLocaleLowerCase('es').includes(normalized),
      ),
    );
  }, [templateQuery, templates]);

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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!template || !editing || !draft) return;
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
        buildTemplateAttributeUpdateInput(draft, editing.updatedAt, canManageRoleAccess),
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

  return (
    <>
      <PageHeader
        title="Plantilla dinámica"
        description="Configuración de atributos por categoría."
        actions={
          <>
            <Button variant="outline" disabled title="Contrato de alta de atributos pendiente">
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
          canManageRoleAccess
            ? 'Gobierna el comportamiento de cada atributo y la matriz de permisos de la plantilla seleccionada.'
            : 'Gobierna el comportamiento operativo de cada atributo y consulta la matriz de permisos vigente.'
        }
        actions={[
          'Filtra por categoría y elige una versión de plantilla para revisar todos sus atributos.',
          'Configura vigencia, obligatoriedad, replicación, búsqueda, ficha técnica y posición.',
          canManageRoleAccess
            ? 'Define por rol quién puede ver, editar, importar y exportar cada atributo.'
            : 'Consulta los permisos por rol; sólo Administración puede modificarlos.',
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

      <div className="mb-[18px] grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="p-4">
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
                placeholder="Nombre, categoría o estado"
              />
            </span>
          </label>
          <div className="mt-4 max-h-[430px] space-y-1 overflow-y-auto">
            {visibleTemplates.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === templateId}
                onClick={() => {
                  setTemplateId(item.id);
                  setEditing(null);
                }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition',
                  item.id === templateId
                    ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200'
                    : 'hover:bg-slate-50',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] font-bold">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs">{item.name}</strong>
                  <small className="block truncate text-[10px] text-muted-foreground">
                    {item.categoryName} · v{item.version} · {item.status}
                  </small>
                </span>
              </button>
            ))}
            {visibleTemplates.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted-foreground">
                Sin plantillas que coincidan.
              </p>
            ) : null}
          </div>
        </Card>
        {template ? (
          <Card className="p-5 sm:p-7">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                  Plantilla PIM · versión {template.version}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{template.name}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-slate-100 px-2 py-1">
                    Categoría: {template.categoryName}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1">Estado: {template.status}</span>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ['Atributos', template.attributes?.length ?? 0],
                    [
                      'Inactivos',
                      (template.attributes ?? []).filter((item) => !item.active).length,
                    ],
                    [
                      'Obligatorios activos',
                      (template.attributes ?? []).filter((item) => item.active && item.required)
                        .length,
                    ],
                    [
                      'Opcionales',
                      (template.attributes ?? []).filter((item) => item.active && !item.required)
                        .length,
                    ],
                    [
                      'Replicables',
                      (template.attributes ?? []).filter((item) => item.active && item.replicable)
                        .length,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border p-3">
                      <dt className="text-[10px] uppercase leading-tight text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 text-2xl font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <aside className="border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <h3 className="text-sm font-semibold">Autoridades de fuente</h3>
                <ol className="mt-4 space-y-3 text-xs">
                  {[
                    ...new Set(
                      (template.attributes ?? [])
                        .filter((attribute) => attribute.active)
                        .map((attribute) => attribute.sourceAuthority),
                    ),
                  ].map((source, index) => (
                    <li key={source} className="flex items-center gap-3">
                      <span className="grid size-6 place-items-center rounded-full bg-orange-50 font-bold text-primary">
                        {index + 1}
                      </span>
                      {source}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
                  Fuentes declaradas por los atributos persistidos. El contrato actual no publica un
                  orden global de prioridad, por lo que no se infiere uno.
                </p>
              </aside>
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-64 place-items-center p-6 text-center text-sm text-muted-foreground">
            Selecciona una plantilla para consultar su definición.
          </Card>
        )}
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.2fr)_minmax(260px,1fr)_auto] xl:items-end">
          <Select
            label="Categoría"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setTemplateId('');
              setEditing(null);
            }}
          >
            <option value="">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active ? '' : ' · inactiva'}
              </option>
            ))}
          </Select>
          <Select
            label="Versión de plantilla"
            value={templateId}
            disabled={loadingList || templates.length === 0}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setEditing(null);
            }}
          >
            {templates.length === 0 ? <option value="">Sin plantillas</option> : null}
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.categoryName} · {item.name} v{item.version} · {item.status}
              </option>
            ))}
          </Select>
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Buscar atributos
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, clave, tipo o fuente"
              />
            </span>
          </label>
          <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Mostrar inactivos
          </label>
        </div>
        {template ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4 text-xs text-muted-foreground">
            <StatusBadge
              tone={
                template.status === 'active'
                  ? 'success'
                  : template.status === 'draft'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {template.status === 'active'
                ? 'Activa'
                : template.status === 'draft'
                  ? 'Borrador'
                  : 'Retirada'}
            </StatusBadge>
            <span>{template.attributes?.length ?? 0} atributos asignados</span>
            <span>Actualizada {new Date(template.updatedAt).toLocaleString('es-PE')}</span>
          </div>
        ) : null}
      </Card>

      {editing && draft ? (
        <Card className="mb-5 border-primary/40 p-5">
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
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
                aria-label="Cerrar configuración"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Comportamiento</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
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

            <fieldset className="mt-5" disabled={!canManageRoleAccess}>
              <legend className="mb-2 text-sm font-semibold">Permisos por rol</legend>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
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
                                changeRolePermission(access.role, permission, event.target.checked)
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
                {canManageRoleAccess
                  ? 'Activar edición, importación o exportación concede también visibilidad. Quitar visibilidad revoca las demás operaciones del rol.'
                  : 'La matriz es de solo lectura. Únicamente Administración puede cambiar los permisos por rol.'}
              </p>
            </fieldset>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
              >
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
        </Card>
      ) : null}

      {loadingList || loadingTemplate ? (
        <Skeleton className="h-96 rounded-xl" />
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
      ) : attributes.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin atributos"
          description="No hay atributos que coincidan con la búsqueda y el estado seleccionados."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <caption className="sr-only">Atributos y permisos de {template.name}</caption>
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Atributo
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tipo / fuente
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Posición
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reglas
                  </th>
                  {roles.map((role) => (
                    <th key={role} scope="col" className="px-4 py-3">
                      {roleLabels[role]}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attributes.map((attribute) => {
                  const matrix = completeRoleAccess(attribute.roleAccess);
                  return (
                    <tr key={attribute.id} className="align-top hover:bg-orange-50/40">
                      <td className="px-4 py-3">
                        <strong className="block">{attribute.label}</strong>
                        <span className="text-xs text-muted-foreground">{attribute.key}</span>
                        <span className="mt-1 block">
                          <StatusBadge tone={attribute.active ? 'success' : 'neutral'}>
                            {attribute.active ? 'Activo' : 'Inactivo'}
                          </StatusBadge>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block">{attribute.dataType}</span>
                        <span className="text-xs text-muted-foreground">
                          {attribute.sourceAuthority}
                          {attribute.unit ? ` · ${attribute.unit}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{attribute.position}</td>
                      <td className="px-4 py-3 text-xs leading-6">
                        <span className="block">
                          {flagLabel(attribute.required, 'Obligatorio')}
                        </span>
                        <span className="block">
                          {flagLabel(attribute.replicable, 'Replicable')}
                        </span>
                        <span className="block">{flagLabel(attribute.searchable, 'Buscable')}</span>
                        <span className="block">
                          {flagLabel(attribute.includeInTechnicalSheet, 'Ficha técnica')}
                        </span>
                      </td>
                      {matrix.map((access) => (
                        <td key={access.role} className="px-4 py-3 text-xs leading-6">
                          {!access.canView ? (
                            <span className="text-muted-foreground">Sin acceso</span>
                          ) : (
                            <>
                              <span className="block font-semibold">Ver</span>
                              <span className="block text-muted-foreground">
                                {[
                                  access.canEdit && 'Editar',
                                  access.canImport && 'Importar',
                                  access.canExport && 'Exportar',
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'Solo lectura'}
                              </span>
                            </>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => beginEdit(attribute)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Configurar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
