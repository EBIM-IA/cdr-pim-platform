'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  categoryGovernanceSchema,
  categoryTreePreviewSchema,
  type AdminCatalogCategoryDto,
  type CategoryGovernanceDto,
  type CategoryTreeImportRow,
  type SaveCategoryDynamicAttribute,
} from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
import { formatWorkspaceDateTime } from '@/lib/workspace-view';
import { readFirstXlsxWorksheet } from '@/lib/xlsx-import';
import { parseImportSource } from '@/lib/import-mapping';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatePanel } from '@/components/state-panel';

const titles = {
  import: 'Importar árbol desde Excel',
  attributes: 'Atributos dinámicos por categoría',
  diagnostics: 'Diagnóstico de categorías y SKU',
};
const issueLabels = {
  unknown_category: 'Categoría desconocida',
  incomplete_levels: 'Niveles incompletos',
  non_final_category: 'Categoría no final',
  missing_template: 'Sin plantilla activa',
  ambiguous_variant: 'Variante pendiente',
};
const endpoint = '/api/catalog/admin/category-governance';
async function send(path: string, body?: unknown) {
  const response = await authenticatedBffFetch(
    endpoint + path,
    body
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof payload.message === 'string'
        ? payload.message
        : 'No se pudo completar la operación',
    );
  return payload;
}
export function CategoryGovernanceDrawer({
  mode,
  categories,
  onClose,
  onSaved,
}: {
  mode: keyof typeof titles;
  categories: AdminCatalogCategoryDto[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<CategoryGovernanceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categoryId, setCategoryId] = useState(
    categories.find((category) => category.active)?.id ?? '',
  );
  useEffect(() => {
    if (!categories.some((category) => category.id === categoryId && category.active))
      setCategoryId(categories.find((category) => category.active)?.id ?? '');
  }, [categories, categoryId]);
  const [issue, setIssue] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof categoryTreePreviewSchema.parse> | null>(
    null,
  );
  const [importRows, setImportRows] = useState<CategoryTreeImportRow[]>([]);
  const [draft, setDraft] = useState<SaveCategoryDynamicAttribute | null>(null);
  async function load() {
    try {
      setData(categoryGovernanceSchema.parse(await send('')));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los datos');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const ancestors = useMemo(() => {
    const ids = new Set<string>();
    let category = categories.find((entry) => entry.id === categoryId);
    while (category && !ids.has(category.id)) {
      ids.add(category.id);
      category = categories.find((entry) => entry.id === category?.parentId);
    }
    return ids;
  }, [categories, categoryId]);
  const attributes =
    data?.dynamicAttributes.filter(
      (attribute) => ancestors.has(attribute.categoryId) && attribute.active,
    ) ?? [];
  const diagnostics = data?.diagnostics.filter((entry) => !issue || entry.kind === issue) ?? [];
  async function saveAttribute(input: SaveCategoryDynamicAttribute) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setData(categoryGovernanceSchema.parse(await send('/attributes', input)));
      setDraft(null);
      setNotice(
        'Atributo guardado y heredado por las plantillas y SKU de la rama. El cambio queda auditado.',
      );
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDrawer
      title={titles[mode]}
      onClose={onClose}
      busy={busy}
      unsavedChanges={Boolean(draft || preview)}
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
            {notice}
          </p>
        ) : null}
        {mode === 'import' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Carga local del árbol y de los códigos ERP suministrados. Cada fila describe una
              categoría final de dos o tres niveles. Si el nivel 3 repite el 2 se conserva una
              categoría de dos niveles. No crea SKU ni activa la sincronización con Dynamics AX.
            </p>
            <TableExportButtons
              filename="arbol-categorias-erp"
              sheetName="Árbol de categorías"
              headers={[
                'categoria_nivel_1',
                'categoria_nivel_2',
                'categoria_nivel_3',
                'codigo_nivel_1',
                'codigo_nivel_2',
                'codigo_nivel_3',
              ]}
              rows={categories
                .filter((entry) => !categories.some((child) => child.parentId === entry.id))
                .map((entry) => {
                  const path: AdminCatalogCategoryDto[] = [];
                  let current: AdminCatalogCategoryDto | undefined = entry;
                  while (current) {
                    path.unshift(current);
                    current = categories.find((candidate) => candidate.id === current?.parentId);
                  }
                  return [
                    path[0]?.name ?? '',
                    path[1]?.name ?? '',
                    path[2]?.name ?? path[1]?.name ?? '',
                    ...[path[0], path[1], path[2] ?? path[1]].map(
                      (node) =>
                        data?.erpCodes.find((code) => code.categoryId === node?.id)?.code ?? '',
                    ),
                  ];
                })}
            />
            <label className="grid gap-2 rounded border p-4 text-sm font-semibold">
              Archivo Excel o CSV · hasta 1.000 filas
              <input
                type="file"
                accept=".xlsx,.csv"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setBusy(true);
                  setError('');
                  setPreview(null);
                  setNotice('');
                  try {
                    if (file.size > 5_000_000)
                      throw new Error('El archivo debe pesar como máximo 5 MB');
                    const raw = file.name.toLowerCase().endsWith('.xlsx')
                      ? await readFirstXlsxWorksheet(file)
                      : parseImportSource(await file.text(), 'csv');
                    if (!raw.length || raw.length > 1000)
                      throw new Error('Carga entre 1 y 1.000 filas');
                    if (
                      !Object.hasOwn(raw[0]!, 'categoria_nivel_1') ||
                      !Object.hasOwn(raw[0]!, 'categoria_nivel_2')
                    )
                      throw new Error('Usa los encabezados de la plantilla exportada');
                    const rows = raw.map((row) => ({
                      level1: String(row.categoria_nivel_1 ?? ''),
                      level2: String(row.categoria_nivel_2 ?? ''),
                      level3: String(row.categoria_nivel_3 ?? ''),
                      code1: String(row.codigo_nivel_1 ?? ''),
                      code2: String(row.codigo_nivel_2 ?? ''),
                      code3: String(row.codigo_nivel_3 ?? ''),
                    }));
                    setImportRows(rows);
                    setPreview(
                      categoryTreePreviewSchema.parse(await send('/tree/preview', { rows })),
                    );
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : 'Archivo no válido');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Los códigos vacíos conservan los existentes. No se generan códigos ERP. Las rutas
              nuevas quedan sin plantilla hasta que el administrador la defina. Una categoría con
              plantilla no puede recibir subcategorías.
            </p>
            {preview ? (
              <>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th className="p-2">Fila</th>
                        <th className="p-2">Ruta</th>
                        <th className="p-2">Nuevas</th>
                        <th className="p-2">Validación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.row} className="border-t">
                          <td className="p-2">{row.row}</td>
                          <td className="p-2">{row.path}</td>
                          <td className="p-2">{row.newCategories}</td>
                          <td className="p-2">{row.error ?? 'Válida'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  disabled={busy || preview.rows.every((row) => row.error)}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const result = categoryTreePreviewSchema.parse(
                        await send('/tree/confirm', {
                          rows: importRows,
                          expectedRevision: preview.revision,
                        }),
                      );
                      setPreview(null);
                      setNotice(
                        `${result.rows.filter((row) => !row.error).length} filas procesadas · ${result.rows.filter((row) => row.error).length} rechazadas · ${result.rows.reduce((sum, row) => sum + row.newCategories, 0)} categorías nuevas. Reglas y códigos se validaron otra vez al confirmar.`,
                      );
                      await load();
                      await onSaved();
                    } catch (failure) {
                      setError(failure instanceof Error ? failure.message : 'No se pudo importar');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Confirmar {preview.rows.filter((row) => !row.error).length} filas válidas
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {mode === 'diagnostics' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Se revisan las asignaciones y niveles ERP de todos los SKU guardados, y las categorías
              finales activas. Los SKU inexistentes y las variantes ambiguas del archivo se validan
              además en «Categorías de SKU» antes de importar.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(issueLabels).map(([key, label]) => (
                <Button
                  key={key}
                  variant={issue === key ? 'dark' : 'outline'}
                  onClick={() => setIssue(issue === key ? '' : key)}
                >
                  {label} · {data?.diagnostics.filter((entry) => entry.kind === key).length ?? '…'}
                </Button>
              ))}
            </div>
            <TableExportButtons
              filename="diagnostico-categorias"
              sheetName="Diagnóstico"
              headers={['SKU', 'Categoría', 'Diagnóstico', 'Detalle']}
              rows={diagnostics.map((entry) => [
                entry.sku,
                entry.category,
                issueLabels[entry.kind],
                entry.detail,
              ])}
            />
            {!data ? (
              <p>Cargando diagnóstico…</p>
            ) : diagnostics.length ? (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Categoría</th>
                      <th className="p-2">Hallazgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.map((entry, index) => (
                      <tr key={`${entry.sku}:${entry.categoryId}:${index}`} className="border-t">
                        <td className="p-2">{entry.sku ?? 'Sin SKU asignados'}</td>
                        <td className="p-2">{entry.category}</td>
                        <td className="p-2">{entry.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StatePanel
                variant="empty"
                title="Sin inconsistencias"
                description="No hay hallazgos para el filtro seleccionado."
              />
            )}
          </>
        ) : null}
        {mode === 'attributes' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Un atributo definido en cualquier nivel se hereda por las plantillas y SKU de toda su
              rama. Su valor se captura en la ficha y en la tabla de productos. Darlo de baja
              conserva los valores guardados.
            </p>
            <div className="grid gap-2 text-sm">
              <Select
                label="Categoría"
                value={categoryId}
                disabled={busy || Boolean(draft)}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categories
                  .filter((entry) => entry.active)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.path}
                    </option>
                  ))}
              </Select>
            </div>
            {!draft ? (
              <Button
                disabled={busy || !data || !categoryId}
                onClick={() =>
                  setDraft({
                    categoryId,
                    label: '',
                    dataType: 'text',
                    unit: null,
                    required: false,
                    includeInTechnicalSheet: true,
                    active: true,
                  })
                }
              >
                Agregar atributo
              </Button>
            ) : (
              <form
                className="space-y-3 rounded border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveAttribute(draft);
                }}
              >
                <label className="grid gap-1 text-sm">
                  Nombre
                  <Input
                    required
                    maxLength={60}
                    value={draft.label}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  />
                </label>
                <div className="grid gap-1 text-sm">
                  <Select
                    label="Tipo"
                    value={draft.dataType}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft({ ...draft, dataType: event.target.value as 'text' | 'number' })
                    }
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                  </Select>
                </div>
                <label className="grid gap-1 text-sm">
                  Unidad
                  <Input
                    maxLength={12}
                    value={draft.unit ?? ''}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, unit: event.target.value || null })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                  />
                  Obligatorio para la completitud
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.includeInTechnicalSheet}
                    onChange={(event) =>
                      setDraft({ ...draft, includeInTechnicalSheet: event.target.checked })
                    }
                  />
                  Incluir en ficha técnica
                </label>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy}>
                    Guardar atributo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDraft(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Atributo / origen</th>
                    <th className="p-2">Alcance</th>
                    <th className="p-2">Reglas</th>
                    <th className="p-2">Modificado</th>
                    <th className="p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {attributes.map((attribute) => (
                    <tr key={attribute.id} className="border-t">
                      <td className="p-2">
                        <strong>{attribute.label}</strong>
                        <br />
                        {attribute.dataType === 'number' ? 'Número' : 'Texto'} {attribute.unit}
                        <br />
                        {attribute.categoryName}
                        {attribute.categoryId !== categoryId ? ' · Heredado' : ' · Propio'}
                      </td>
                      <td className="p-2">
                        {attribute.templateCount} plantillas
                        <br />
                        {attribute.filledCount}/{attribute.skuCount} SKU con valor
                      </td>
                      <td className="p-2">
                        {attribute.required ? 'Obligatorio' : 'Opcional'}
                        <br />
                        Ficha: {attribute.includeInTechnicalSheet ? 'Sí' : 'No'}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {attribute.updatedBy}
                        <br />
                        {formatWorkspaceDateTime(attribute.updatedAt)}
                      </td>
                      <td className="p-2">
                        {attribute.categoryId === categoryId ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || Boolean(draft)}
                              onClick={() =>
                                setDraft({
                                  id: attribute.id,
                                  categoryId: attribute.categoryId,
                                  label: attribute.label,
                                  dataType: attribute.dataType,
                                  unit: attribute.unit,
                                  required: attribute.required,
                                  includeInTechnicalSheet: attribute.includeInTechnicalSheet,
                                  active: true,
                                  expectedUpdatedAt: attribute.updatedAt,
                                })
                              }
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || Boolean(draft)}
                              onClick={() =>
                                void saveAttribute({
                                  id: attribute.id,
                                  categoryId: attribute.categoryId,
                                  label: attribute.label,
                                  dataType: attribute.dataType,
                                  unit: attribute.unit,
                                  required: attribute.required,
                                  includeInTechnicalSheet: attribute.includeInTechnicalSheet,
                                  active: false,
                                  expectedUpdatedAt: attribute.updatedAt,
                                })
                              }
                            >
                              Dar de baja
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCategoryId(attribute.categoryId)}
                          >
                            Ver categoría origen
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && attributes.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Sin atributos propios ni heredados.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </WorkspaceDrawer>
  );
}
