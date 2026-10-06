'use client';

import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import {
  Check,
  CheckCircle2,
  Clock3,
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

  const visibleCategories = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return categories
      .filter((category) => showInactive || category.active)
      .filter(
        (category) =>
          !normalized ||
          [category.name, category.slug, category.path].some((value) =>
            value.toLocaleLowerCase('es').includes(normalized),
          ),
      )
      .sort((left, right) => left.position - right.position || left.path.localeCompare(right.path));
  }, [categories, query, showInactive]);
  const activeTemplates = templates.filter((template) => template.status === 'active');
  const categoriesWithActiveTemplate = new Set(
    activeTemplates.map((template) => template.categoryId),
  );
  const pendingDefinitionCount = categories.filter(
    (category) => category.active && !categoriesWithActiveTemplate.has(category.id),
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
        title="Categorías y líneas"
        description="Líneas, categorías y vigencias del catálogo."
        actions={
          <>
            <Button disabled title="El contrato de asociación de línea ERP aún no está aprobado">
              Asociar línea ERP
            </Button>
            <Button asChild variant="outline">
              <Link href="/templates">Administrar plantillas</Link>
            </Button>
          </>
        }
      />
      <ScreenGuide
        objective="Relaciona la línea recibida desde ERP con la plantilla PIM que define qué atributos se enriquecen."
        actions={[
          'Abre una plantilla o edita el nombre, orden y vigencia de una categoría.',
          'Revisa las categorías activas, inactivas y pendientes de una plantilla definida.',
        ]}
        dataSource="Las categorías, plantillas y asignaciones provienen de la API administrativa del catálogo; cada actualización usa control de concurrencia."
        limitation="Esta pantalla no crea categorías ni modifica la jerarquía porque esos endpoints todavía no forman parte del contrato aprobado."
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
        La línea llega desde ERP en cada SKU; la plantilla PIM define qué atributos se enriquecen.
        Son entidades distintas y esta pantalla mantiene su asociación.
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
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
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
                placeholder="Nombre, slug o ruta"
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
      ) : visibleCategories.length === 0 ? (
        <StatePanel
          variant="empty"
          title="Sin categorías"
          description="No hay categorías que coincidan con la búsqueda y el estado seleccionados."
        />
      ) : (
        <Card id="category-table" className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-[17px] font-semibold">Plantillas y líneas persistidas</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibleCategories.filter((category) => Boolean(templateFor(category.id))).length}{' '}
              definidas · {visibleCategories.filter((category) => !templateFor(category.id)).length}{' '}
              pendientes de definición
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <caption className="sr-only">
                Administración de categorías activas e inactivas
              </caption>
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Plantilla PIM
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Línea recibida del ERP
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Categoría BUSQUEDA
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Aplicación
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
                {[
                  ...visibleCategories.filter((category) => Boolean(templateFor(category.id))),
                  ...visibleCategories.filter((category) => !templateFor(category.id)),
                ].map((category, index, orderedCategories) => {
                  const editing = editingId === category.id;
                  const saving = savingId === category.id;
                  const template = templateFor(category.id);
                  const activeAttributes =
                    template?.attributes?.filter((attribute) => attribute.active) ?? [];
                  return (
                    <Fragment key={category.id}>
                      {(index === 0 ||
                        Boolean(template) !==
                          Boolean(templateFor(orderedCategories[index - 1]?.id ?? ''))) && (
                        <tr className="bg-slate-50/80">
                          <th
                            colSpan={8}
                            className="px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-primary"
                          >
                            {template
                              ? 'Plantillas definidas'
                              : 'Categorías pendientes de definición'}
                          </th>
                        </tr>
                      )}
                      <tr className="hover:bg-orange-50/40">
                        <td className="px-4 py-3">
                          <strong className="block">{template?.name ?? 'Sin plantilla'}</strong>
                          <span className="text-xs text-muted-foreground">
                            {template ? `Versión ${template.version}` : 'Pendiente de definición'}
                          </span>
                        </td>
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
                            <>
                              <strong className="block text-xs">{category.name}</strong>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {category.slug} · orden {category.position}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {category.path}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          No modelada en el contrato
                        </td>
                        <td className="px-4 py-3 font-semibold">{activeAttributes.length}</td>
                        <td className="px-4 py-3 font-semibold">
                          {activeAttributes.filter((attribute) => attribute.required).length}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              template?.status === 'active' && category.active
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {template?.status === 'active' && category.active
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
