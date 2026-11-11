'use client';
import type { AdminCatalogCategoryDto, AdminTemplateDto } from '@cdr/contracts';
import { useState } from 'react';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createAdminCategory,
  moveAdminCategory,
  configureAdminCategoryTemplate,
} from '@/lib/catalog-admin-api';

export function CatalogDesignDrawer({
  categories,
  templates,
  category,
  operation,
  onClose,
  onSaved,
}: {
  categories: AdminCatalogCategoryDto[];
  templates: AdminTemplateDto[];
  category: AdminCatalogCategoryDto | null;
  operation: 'create' | 'move' | 'template';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(operation === 'template' ? (category?.name ?? '') : '');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [sourceId, setSourceId] = useState('');
  const [mode, setMode] = useState<'assign' | 'copy' | 'empty'>('assign');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title =
    operation === 'create'
      ? 'Nueva categoría'
      : operation === 'move'
        ? 'Cambiar padre'
        : 'Plantilla de la categoría final';
  return (
    <WorkspaceDrawer
      title={title}
      busy={saving}
      unsavedChanges={Boolean(name || slug || sourceId)}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            if (operation === 'create')
              await createAdminCategory({ name, slug, parentId: parentId || null, position: 0 });
            else if (category && operation === 'move')
              await moveAdminCategory(category.id, {
                parentId: parentId || null,
                expectedUpdatedAt: category.updatedAt,
              });
            else if (category)
              await configureAdminCategoryTemplate(category.id, {
                mode,
                name,
                ...(mode !== 'empty' ? { sourceTemplateId: sourceId } : {}),
                expectedUpdatedAt: category.updatedAt,
              });
            await onSaved();
            onClose();
          } catch (failure) {
            setError(
              failure instanceof Error ? failure.message : 'No se pudo guardar la configuración',
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        {category ? <p className="text-sm font-semibold">{category.path}</p> : null}
        {error ? (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <fieldset
          disabled={saving}
          className="space-y-4 [&_select]:h-11 [&_select]:rounded-md [&_select]:border [&_select]:bg-white [&_select]:px-3"
        >
          {operation !== 'move' ? (
            <label className="grid gap-1.5 text-sm">
              {operation === 'template' ? 'Nombre de la plantilla' : 'Nombre'}
              <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          ) : null}
          {operation === 'create' ? (
            <label className="grid gap-1.5 text-sm">
              Código PIM
              <Input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                placeholder="rodamiento-especial"
                onChange={(event) => setSlug(event.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                Código único en minúsculas y guiones.
              </span>
            </label>
          ) : null}
          {operation !== 'template' ? (
            <label className="grid gap-1.5 text-sm">
              Categoría padre
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">Sin padre · nivel 1</option>
                {categories
                  .filter((row) => row.active && row.id !== category?.id)
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.path}
                    </option>
                  ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Máximo tres niveles. Una categoría con plantilla permanece como categoría final.
              </span>
            </label>
          ) : (
            <>
              <label className="grid gap-1.5 text-sm">
                Acción
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as typeof mode)}
                >
                  <option value="assign">Asignar / cambiar plantilla</option>
                  <option value="copy">Copiar como nueva</option>
                  <option value="empty">Crear vacía con campos ERP</option>
                </select>
              </label>
              {mode !== 'empty' ? (
                <label className="grid gap-1.5 text-sm">
                  Plantilla de origen
                  <select
                    required
                    value={sourceId}
                    onChange={(event) => {
                      setSourceId(event.target.value);
                      const source = templates.find((row) => row.id === event.target.value);
                      if (source) setName(source.name);
                    }}
                  >
                    <option value="">Seleccionar plantilla activa…</option>
                    {templates
                      .filter((row) => row.status === 'active')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.categoryName} · {row.name} · v{row.version}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <p className="rounded border bg-amber-50 p-3 text-sm">
                Todos los SKU de esta categoría usarán la plantilla elegida. Sus valores registrados
                se conservan. Las plantillas de otra categoría se copian a esta categoría para
                conservar la jerarquía.
              </p>
            </>
          )}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </form>
    </WorkspaceDrawer>
  );
}
