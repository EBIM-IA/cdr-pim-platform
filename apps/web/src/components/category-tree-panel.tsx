'use client';

import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import { ChevronRight, Minus, Pencil, Plus, RotateCcw, ToggleLeft } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { CategoryTreeRow } from '@/components/categories-admin-workspace';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function CategoryTreePanel({
  rows,
  templatesForCategory,
  searching,
  savingId,
  onEdit,
  onInspectCategory,
  onSetActive,
}: {
  rows: readonly CategoryTreeRow[];
  templatesForCategory: (id: string) => AdminTemplateDto[];
  searching: boolean;
  savingId: string | null;
  onEdit: (category: AdminCatalogCategoryDto) => void;
  onInspectCategory?: (id: string) => void;
  onSetActive: (category: AdminCatalogCategoryDto, active: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(rows.filter((row) => !row.leaf && row.depth > 0).map((row) => row.category.id)),
  );
  const [showDetail, setShowDetail] = useState(false);
  const selected = rows.find(({ category }) => category.id === selectedId) ?? rows[0];
  const byId = useMemo(() => new Map(rows.map((row) => [row.category.id, row])), [rows]);
  const visible = rows.filter(({ category }) => {
    if (searching) return true;
    let parentId = category.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (collapsed.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.category.parentId ?? null;
    }
    return true;
  });
  const variants = selected ? templatesForCategory(selected.category.id) : [];
  const children = selected
    ? rows.filter(({ category }) => category.parentId === selected.category.id)
    : [];

  return (
    <div
      className={cn(
        'grid items-start gap-4',
        showDetail && 'xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]',
      )}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Árbol de categorías</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} categorías · {rows.filter((row) => row.leaf).length} finales
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => setCollapsed(new Set())}>
              Expandir
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCollapsed(new Set(rows.filter((row) => !row.leaf).map((row) => row.category.id)))
              }
            >
              Contraer
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={showDetail}
              aria-controls="category-detail"
              onClick={() => setShowDetail((value) => !value)}
            >
              Detalle
            </Button>
          </div>
        </div>
        <ul className="max-h-[650px] overflow-y-auto py-2" aria-label="Jerarquía de categorías">
          {visible.map(({ category, depth, leaf }) => {
            const activeVariants = templatesForCategory(category.id).filter(
              (template) => template.status === 'active',
            );
            const expanded = searching || !collapsed.has(category.id);
            return (
              <li
                key={category.id}
                className={cn(
                  'flex min-h-8 items-center gap-1 border-b border-slate-100 pr-3 last:border-0',
                  showDetail && selected?.category.id === category.id
                    ? 'bg-orange-50'
                    : 'hover:bg-slate-50',
                )}
                style={{ paddingLeft: `${12 + depth * 22}px` }}
              >
                {!leaf ? (
                  <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded hover:bg-orange-100"
                    aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${category.name}`}
                    aria-expanded={expanded}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(category.id)) next.delete(category.id);
                        else next.add(category.id);
                        return next;
                      })
                    }
                  >
                    <span className="grid size-3.5 place-items-center rounded-sm border border-slate-400">
                      {expanded ? <Minus className="size-3" /> : <Plus className="size-3" />}
                    </span>
                  </button>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                <button
                  type="button"
                  aria-label={`Seleccionar categoría ${category.name}`}
                  aria-pressed={selected?.category.id === category.id}
                  onClick={() => {
                    setSelectedId(category.id);
                    setShowDetail(true);
                    onInspectCategory?.(category.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 break-words text-sm',
                      !category.active && 'text-muted-foreground line-through',
                    )}
                  >
                    {category.name}
                  </span>
                  {leaf ? (
                    <span className="ml-3 inline-flex min-w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          activeVariants.length ? 'bg-emerald-600' : 'bg-amber-500',
                        )}
                        aria-hidden="true"
                      />
                      {activeVariants.length
                        ? `${activeVariants.length} plantilla${activeVariants.length > 1 ? 's' : ''}`
                        : 'Sin plantilla'}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      {showDetail && selected ? (
        <Card id="category-detail" className="overflow-hidden">
          <div className="border-b p-4">
            <p className="text-xs text-muted-foreground">
              Nivel {selected.depth + 1} ·{' '}
              {selected.leaf ? 'Categoría final' : 'Categoría estructural'}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{selected.category.name}</h2>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {selected.category.path.replaceAll('/', ' › ')}
            </p>
          </div>
          <div className="space-y-5 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Aplicación</dt>
                <dd>{selected.category.application ?? 'Sin definir'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vigencia</dt>
                <dd>
                  <StatusBadge tone={selected.category.active ? 'success' : 'neutral'}>
                    {selected.category.active ? 'Activa' : 'Inactiva'}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
            <section>
              <h3 className="mb-2 font-semibold">
                {selected.leaf ? 'Plantillas de la categoría' : 'Subcategorías'}
              </h3>
              {selected.leaf ? (
                variants.length ? (
                  <ul className="space-y-2">
                    {variants.map((template) => (
                      <li key={template.id} className="rounded-lg border p-3">
                        <Link
                          className="text-sm text-primary underline-offset-2 hover:underline"
                          href={`/templates?template=${encodeURIComponent(template.id)}`}
                        >
                          {template.name}
                        </Link>
                        <small className="mt-1 block text-muted-foreground">
                          Variante {template.variantKey} · v{template.version} ·{' '}
                          {template.status === 'active'
                            ? 'Activa'
                            : template.status === 'draft'
                              ? 'Borrador'
                              : 'Retirada'}{' '}
                          ·{' '}
                          {template.attributes
                            ? `${template.attributes.filter((attribute) => attribute.active).length} atributos activos`
                            : 'Detalle de atributos por cargar'}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    Pendiente de definición. Esta categoría todavía no tiene una plantilla
                    persistida.
                  </p>
                )
              ) : (
                <ul className="divide-y rounded-lg border">
                  {children.map(({ category }) => (
                    <li key={category.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(category.id);
                          onInspectCategory?.(category.id);
                          setCollapsed((current) => {
                            const next = new Set(current);
                            next.delete(selected.category.id);
                            return next;
                          });
                        }}
                        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm"
                      >
                        {category.name}
                        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button size="sm" variant="outline" onClick={() => onEdit(selected.category)}>
                <Pencil className="size-3.5" />
                Editar categoría
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={savingId !== null}
                onClick={() => onSetActive(selected.category, !selected.category.active)}
              >
                {selected.category.active ? (
                  <ToggleLeft className="size-3.5" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {selected.category.active ? 'Desactivar' : 'Reactivar'}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Las variantes pertenecen a la categoría final. Cada producto conserva su asignación de
              plantilla.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
