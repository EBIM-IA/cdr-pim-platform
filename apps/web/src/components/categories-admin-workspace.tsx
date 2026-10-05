'use client';

import type { AdminCatalogCategoryDto } from '@cdr/contracts';
import { Check, Pencil, RefreshCw, RotateCcw, Search, ToggleLeft, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ScreenGuide } from '@/components/screen-guide';
import { StatePanel } from '@/components/state-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CatalogAdminApiError,
  listAdminCategories,
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listAdminCategories(true));
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
        eyebrow="Estructura del catálogo"
        title="Categorías"
        description="Organiza las categorías persistidas y desactiva las que ya no deben utilizarse, sin borrar su historial."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
            Actualizar
          </Button>
        }
      />
      <ScreenGuide
        objective="Administra el nombre, el orden y la vigencia de la taxonomía que utiliza el catálogo dinámico."
        actions={[
          'Busca por nombre, identificador o ruta y revisa categorías activas e inactivas.',
          'Edita el nombre y la posición directamente desde la tabla.',
          'Desactiva o reactiva una categoría sin eliminar sus plantillas ni su trazabilidad.',
        ]}
        dataSource="La lista y cada cambio provienen de la API administrativa del catálogo; las actualizaciones usan control de concurrencia."
        limitation="Esta pantalla no crea categorías ni modifica la jerarquía porque esos endpoints todavía no forman parte del contrato aprobado."
      />

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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">
                Administración de categorías activas e inactivas
              </caption>
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Categoría
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Ruta
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Posición
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleCategories.map((category) => {
                  const editing = editingId === category.id;
                  const saving = savingId === category.id;
                  return (
                    <tr key={category.id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3">
                        {editing ? (
                          <Input
                            aria-label={`Nombre de ${category.name}`}
                            value={draft.name}
                            disabled={saving}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, name: event.target.value }))
                            }
                          />
                        ) : (
                          <>
                            <strong className="block">{category.name}</strong>
                            <span className="text-xs text-muted-foreground">{category.slug}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {category.path}
                      </td>
                      <td className="w-32 px-4 py-3">
                        {editing ? (
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            aria-label={`Posición de ${category.name}`}
                            value={draft.position}
                            disabled={saving}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, position: event.target.value }))
                            }
                          />
                        ) : (
                          category.position
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={category.active ? 'success' : 'neutral'}>
                          {category.active ? 'Activa' : 'Inactiva'}
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
                              <Button size="sm" variant="ghost" onClick={() => beginEdit(category)}>
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
