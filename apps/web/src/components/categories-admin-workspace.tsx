'use client';

import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderTree,
  ListChecks,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/metric-card';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CatalogAdminApiError,
  getAdminTemplate,
  listAdminCategories,
  listAdminTemplates,
  updateAdminCategory,
} from '@/lib/catalog-admin-api';

interface CategoryDraft {
  name: string;
  position: string;
}

export interface CategoryTreeRow {
  readonly category: AdminCatalogCategoryDto;
  readonly depth: number;
  readonly leaf: boolean;
}

export function orderCategoryTree(
  categories: readonly AdminCatalogCategoryDto[],
): CategoryTreeRow[] {
  const availableIds = new Set(categories.map((category) => category.id));
  const children = new Map<string | null, AdminCatalogCategoryDto[]>();
  categories.forEach((category) => {
    const parentId =
      category.parentId && availableIds.has(category.parentId) ? category.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), category]);
  });
  children.forEach((rows) =>
    rows.sort(
      (left, right) => left.position - right.position || left.name.localeCompare(right.name, 'es'),
    ),
  );

  const ordered: CategoryTreeRow[] = [];
  const visit = (category: AdminCatalogCategoryDto, depth: number) => {
    const descendants = children.get(category.id) ?? [];
    ordered.push({ category, depth, leaf: descendants.length === 0 });
    descendants.forEach((child) => visit(child, depth + 1));
  };
  (children.get(null) ?? []).forEach((category) => visit(category, 0));
  return ordered;
}

export function filterCategoryTreeRows(
  categories: readonly AdminCatalogCategoryDto[],
  treeRows: readonly CategoryTreeRow[],
  query: string,
  showInactive: boolean,
): CategoryTreeRow[] {
  const normalized = query.trim().toLocaleLowerCase('es');
  const allowed = new Set(
    categories.filter((category) => showInactive || category.active).map((category) => category.id),
  );
  if (!normalized) return treeRows.filter((row) => allowed.has(row.category.id));

  const matching = new Set(
    categories
      .filter((category) => allowed.has(category.id))
      .filter((category) =>
        [category.name, category.slug, category.path, category.application ?? ''].some((value) =>
          value.toLocaleLowerCase('es').includes(normalized),
        ),
      )
      .map((category) => category.id),
  );
  const byId = new Map(categories.map((category) => [category.id, category] as const));
  const visibleIds = new Set(matching);
  let expanded = true;
  while (expanded) {
    expanded = false;
    categories.forEach((category) => {
      if (!allowed.has(category.id)) return;
      if (category.parentId && visibleIds.has(category.parentId) && !visibleIds.has(category.id)) {
        visibleIds.add(category.id);
        expanded = true;
      }
    });
  }
  matching.forEach((id) => {
    let current = byId.get(id);
    while (current?.parentId) {
      if (allowed.has(current.parentId)) visibleIds.add(current.parentId);
      current = byId.get(current.parentId);
    }
  });
  return treeRows.filter((row) => visibleIds.has(row.category.id));
}

export function CategoriesAdminWorkspace() {
  const [categories, setCategories] = useState<AdminCatalogCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>({ name: '', position: '0' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AdminTemplateDto[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryRows, templateHeaders] = await Promise.all([
        listAdminCategories(true),
        listAdminTemplates(),
      ]);
      setCategories(categoryRows);
      setTemplates(
        await Promise.all(
          templateHeaders.map((template) =>
            template.attributes ? Promise.resolve(template) : getAdminTemplate(template.id),
          ),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar las categorías.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const treeRows = useMemo(() => orderCategoryTree(categories), [categories]);
  const visibleTreeRows = useMemo(
    () => filterCategoryTreeRows(categories, treeRows, query, showInactive),
    [categories, query, showInactive, treeRows],
  );
  const activeTemplates = templates.filter((template) => template.status === 'active');
  const categoriesWithActiveTemplate = new Set(
    activeTemplates.map((template) => template.categoryId),
  );
  const pendingDefinitionCount = treeRows.filter(
    ({ category, leaf }) =>
      leaf && category.active && !categoriesWithActiveTemplate.has(category.id),
  ).length;
  const attributeCount = activeTemplates.reduce(
    (total, template) =>
      total + (template.attributes?.filter((attribute) => attribute.active).length ?? 0),
    0,
  );
  const requiredCount = activeTemplates.reduce(
    (total, template) =>
      total +
      (template.attributes?.filter((attribute) => attribute.active && attribute.required).length ??
        0),
    0,
  );
  const templateFor = (categoryId: string) =>
    templates.find(
      (template) => template.categoryId === categoryId && template.status === 'active',
    ) ?? templates.find((template) => template.categoryId === categoryId);

  const beginEdit = (category: AdminCatalogCategoryDto) => {
    setEditingId(category.id);
    setDraft({ name: category.name, position: String(category.position) });
    setError(null);
    setNotice(null);
  };

  const recoverConflict = async () => {
    setEditingId(null);
    setNotice(null);
    await load();
    setError(
      'Otra persona modificó la categoría. Recargamos los datos vigentes; vuelve a intentar tu cambio.',
    );
  };

  const save = async (category: AdminCatalogCategoryDto) => {
    const position = Number(draft.position);
    if (!draft.name.trim() || !Number.isInteger(position) || position < 0) {
      setError('Ingresa un nombre y una posición entera mayor o igual a cero.');
      return;
    }
    setSavingId(category.id);
    setError(null);
    try {
      await updateAdminCategory(category.id, {
        name: draft.name.trim(),
        position,
        expectedUpdatedAt: category.updatedAt,
      });
      setEditingId(null);
      setNotice('Categoría actualizada y auditada correctamente.');
      await load();
    } catch (requestError) {
      if (requestError instanceof CatalogAdminApiError && requestError.status === 409) {
        await recoverConflict();
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible actualizar la categoría.',
        );
      }
    } finally {
      setSavingId(null);
    }
  };

  const setActive = async (category: AdminCatalogCategoryDto, active: boolean) => {
    setSavingId(category.id);
    setError(null);
    setNotice(null);
    try {
      await updateAdminCategory(category.id, {
        active,
        expectedUpdatedAt: category.updatedAt,
      });
      setNotice(
        active
          ? 'Categoría reactivada y disponible para sus operaciones.'
          : 'Categoría desactivada sin eliminar su historial.',
      );
      await load();
    } catch (requestError) {
      if (requestError instanceof CatalogAdminApiError && requestError.status === 409) {
        await recoverConflict();
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No fue posible cambiar el estado.',
        );
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Árbol de Categorías"
        description="Jerarquía del ERP y relación de cada categoría final con su plantilla PIM."
        actions={
          <>
            <Button
              disabled
              title="La importación requiere el contrato aprobado de sincronización ERP"
            >
              Importar árbol
            </Button>
            <Button asChild variant="outline">
              <Link href="/templates">Administrar plantillas</Link>
            </Button>
          </>
        }
      />
      <ScreenGuide
        objective="Representa los niveles del ERP como un árbol; la plantilla y sus atributos pertenecen a la última categoría de cada rama."
        actions={[
          'Busca una categoría padre para incluir todas sus categorías descendientes.',
          'Abre la plantilla de una categoría final o edita nombre, orden y vigencia.',
          'Exporta el árbol vigente para validarlo con el cliente.',
        ]}
        dataSource="Las categorías, plantillas y asignaciones provienen de la API administrativa del catálogo; cada actualización usa control de concurrencia."
        limitation="La importación, creación y reorganización del árbol permanecen bloqueadas hasta recibir los códigos y la sincronización definitiva del ERP."
      />

      <section
        className="mb-[18px] grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores de categorías"
      >
        <MetricCard
          label="Plantillas definidas"
          value={activeTemplates.length}
          note="versiones activas persistidas"
          icon={ListChecks}
          tone="green"
          href="/templates"
        />
        <MetricCard
          label="Pendientes de definición"
          value={pendingDefinitionCount}
          note="categorías activas sin plantilla"
          icon={Clock3}
          tone="orange"
          href="/templates"
        />
        <MetricCard
          label="Atributos configurados"
          value={attributeCount}
          note="asignaciones activas"
          icon={SlidersHorizontal}
          href="/templates"
        />
        <MetricCard
          label="Obligatorios"
          value={requiredCount}
          note="atributos requeridos"
          icon={CheckCircle2}
          tone="orange"
          href="/templates"
        />
      </section>

      <div className="mb-[18px] rounded-lg bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
        Las ramas pueden terminar en nivel 2 o 3. Cuando el Excel repite el nivel final, el PIM lo
        interpreta como una sola categoría, no como un nodo duplicado. La plantilla solo se evalúa
        en la categoría hoja.
      </div>

      {notice ? (
        <div
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {error && categories.length > 0 ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            Buscar categorías
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Categoría padre, hija, aplicación o ruta"
              />
            </span>
          </label>
          <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Mostrar inactivas
          </label>
          <TableExportButtons
            filename="arbol-categorias"
            sheetName="Árbol de Categorías"
            headers={['Nivel', 'Categoría', 'Slug', 'Ruta', 'Aplicación', 'Plantilla', 'Estado']}
            rows={visibleTreeRows.map(({ category, depth }) => [
              depth + 1,
              category.name,
              category.slug,
              category.path,
              category.application,
              templateFor(category.id)?.name,
              category.active ? 'Activa' : 'Inactiva',
            ])}
          />
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : error && categories.length === 0 ? (
        <StatePanel
          variant="error"
          title="No pudimos cargar las categorías"
          description={error}
          actionLabel="Reintentar"
          onAction={load}
        />
      ) : visibleTreeRows.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin categorías"
          description="No hay categorías que coincidan con la búsqueda y el estado seleccionados."
        />
      ) : (
        <Card id="category-table" className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-[17px] font-semibold">Categorías y Plantillas Persistidas</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {
                visibleTreeRows.filter(
                  ({ category, leaf }) => leaf && Boolean(templateFor(category.id)),
                ).length
              }{' '}
              categorías finales definidas ·{' '}
              {
                visibleTreeRows.filter(({ category, leaf }) => leaf && !templateFor(category.id))
                  .length
              }{' '}
              pendientes
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <caption className="sr-only">
                Árbol jerárquico de categorías activas e inactivas
              </caption>
              <thead className="border-b bg-slate-50 text-xs tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Categoría
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Nivel y ruta
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Aplicación
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Plantilla PIM
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Atributos
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Obligatorios
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Definición
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...visibleTreeRows].map(({ category, depth, leaf }) => {
                  const editing = editingId === category.id;
                  const saving = savingId === category.id;
                  const template = templateFor(category.id);
                  const activeAttributes =
                    template?.attributes?.filter((attribute) => attribute.active) ?? [];
                  return (
                    <Fragment key={category.id}>
                      <tr className="hover:bg-orange-50/40">
                        <td className="px-4 py-3">
                          {editing ? (
                            <div className="grid grid-cols-[minmax(180px,1fr)_78px] gap-2">
                              <Input
                                aria-label={`Nombre de ${category.name}`}
                                value={draft.name}
                                disabled={saving}
                                onChange={(event) =>
                                  setDraft((current) => ({ ...current, name: event.target.value }))
                                }
                              />
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                aria-label={`Posición de ${category.name}`}
                                value={draft.position}
                                disabled={saving}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    position: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <div
                              className="flex items-center gap-2"
                              style={{ paddingLeft: `${depth * 18}px` }}
                            >
                              {depth > 0 ? (
                                <ChevronRight
                                  className="size-3.5 shrink-0 text-slate-400"
                                  aria-hidden="true"
                                />
                              ) : (
                                <FolderTree
                                  className="size-4 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                              )}
                              <span>
                                <strong className="block text-xs">{category.name}</strong>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {category.slug} · orden {category.position}
                                </span>
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <strong className="block text-cdr-ink">
                            Nivel {depth + 1}
                            {leaf ? ' · Final' : ''}
                          </strong>
                          <span className="font-mono text-[10px]">{category.path}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {category.application ?? 'Sin aplicación definida'}
                        </td>
                        <td className="px-4 py-3">
                          {leaf ? (
                            <>
                              <strong className="block">{template?.name ?? 'Sin plantilla'}</strong>
                              <span className="text-xs text-muted-foreground">
                                {template
                                  ? `Versión ${template.version}`
                                  : 'Pendiente de definición'}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Solo categoría final
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">{activeAttributes.length}</td>
                        <td className="px-4 py-3 font-semibold">
                          {activeAttributes.filter((attribute) => attribute.required).length}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              (!leaf || template?.status === 'active') && category.active
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {!category.active
                              ? 'Inactiva'
                              : !leaf
                                ? 'Estructural'
                                : template?.status === 'active'
                                  ? 'Definida'
                                  : 'Pendiente'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {editing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="dark"
                                  disabled={saving}
                                  onClick={() => void save(category)}
                                >
                                  {saving ? (
                                    <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Check className="size-4" aria-hidden="true" />
                                  )}
                                  Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={saving}
                                  onClick={() => setEditingId(null)}
                                >
                                  <X className="size-4" aria-hidden="true" />
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => beginEdit(category)}
                                >
                                  <Pencil className="size-4" aria-hidden="true" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={saving}
                                  onClick={() => void setActive(category, !category.active)}
                                >
                                  {category.active ? (
                                    <ToggleLeft className="size-4" aria-hidden="true" />
                                  ) : (
                                    <RotateCcw className="size-4" aria-hidden="true" />
                                  )}
                                  {category.active ? 'Desactivar' : 'Reactivar'}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
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
