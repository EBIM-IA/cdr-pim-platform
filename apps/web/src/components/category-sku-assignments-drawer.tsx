'use client';
import type {
  CategorySkuAssignmentExportDto,
  CategorySkuAssignmentPreviewDto,
} from '@cdr/contracts';
import { useEffect, useState } from 'react';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { TableExportButtons } from '@/components/table-export-buttons';
import { Button } from '@/components/ui/button';
import {
  exportAdminCategoryAssignments,
  previewAdminCategoryAssignments,
  confirmAdminCategoryAssignments,
} from '@/lib/catalog-admin-api';
import { parseImportSource } from '@/lib/import-mapping';

export function CategorySkuAssignmentsDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [records, setRecords] = useState<CategorySkuAssignmentExportDto>([]);
  const [preview, setPreview] = useState<CategorySkuAssignmentPreviewDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void exportAdminCategoryAssignments()
      .then((rows) => {
        if (!cancelled) setRecords(rows);
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : 'No se pudieron cargar las categorías de SKU',
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const rejected = preview?.rows.filter((row) => row.error).length ?? 0;
  return (
    <WorkspaceDrawer
      title="Categoría de cada SKU"
      busy={busy}
      unsavedChanges={Boolean(preview)}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Exporta las asignaciones actuales, edita el código PIM de la categoría final y vuelve a
          cargar el CSV. Conserva el SKU y usa una variante activa de la categoría destino. Si solo
          hay una variante puedes dejar plantilla_variante vacía.
        </p>
        <TableExportButtons
          filename="categorias-sku"
          sheetName="Categorías SKU"
          headers={[
            'codigo_articulo',
            'categoria_codigo_pim',
            'plantilla_variante',
            'ruta_categoria',
          ]}
          rows={records.map((row) => [
            row.sku,
            row.categorySlug ?? '',
            row.variantKey ?? '',
            row.categoryPath ?? '',
          ])}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          El código PIM aparece en el árbol de categorías. La importación admite hasta 1.000 filas
          por CSV y categorías ya definidas; no crea SKU ni categorías ERP.
        </p>
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
        <label className="grid gap-2 rounded border p-4 text-sm font-semibold">
          Importar categorías de SKU · CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPreview(null);
              setError(null);
              setNotice(null);
              setBusy(true);
              try {
                if (file.size > 2_000_000) throw new Error('El CSV debe pesar como máximo 2 MB');
                const raw = parseImportSource(await file.text(), 'csv');
                if (!raw.length || raw.length > 1000)
                  throw new Error('Carga entre 1 y 1.000 filas por archivo');
                if (
                  !Object.hasOwn(raw[0]!, 'codigo_articulo') ||
                  !Object.hasOwn(raw[0]!, 'categoria_codigo_pim')
                )
                  throw new Error('El CSV debe incluir codigo_articulo y categoria_codigo_pim');
                const rows = raw.map((row) => ({
                  sku: String(row.codigo_articulo ?? '').trim(),
                  categorySlug: String(row.categoria_codigo_pim ?? '').trim(),
                  ...(String(row.plantilla_variante ?? '').trim()
                    ? { variantKey: String(row.plantilla_variante).trim() }
                    : {}),
                }));
                setPreview(await previewAdminCategoryAssignments({ rows }));
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : 'No se pudo validar el archivo',
                );
              } finally {
                setBusy(false);
                event.target.value = '';
              }
            }}
          />
        </label>
        {preview ? (
          <>
            <p className="text-sm font-semibold">
              Vista previa: {preview.rows.length - rejected} filas válidas · {rejected} rechazadas
            </p>
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Categoría PIM</th>
                    <th className="p-2">Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={`${row.sku}-${index}`} className="border-t">
                      <td className="p-2">{row.sku}</td>
                      <td className="p-2">{row.categorySlug}</td>
                      <td className="p-2">
                        {row.error ??
                          (row.expectedTemplateId === row.targetTemplateId
                            ? 'Sin cambio'
                            : 'Cambiar categoría / plantilla')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Corrige todas las filas rechazadas para confirmar. Se conservan los valores
              existentes, incluso los que no pertenecen a la plantilla destino. Cada cambio queda
              auditado.
            </p>
            <Button
              disabled={busy || rejected > 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await confirmAdminCategoryAssignments({
                    rows: preview.rows.map((row) => ({
                      sku: row.sku,
                      categorySlug: row.categorySlug,
                      ...(row.variantKey ? { variantKey: row.variantKey } : {}),
                      expectedTemplateId: row.expectedTemplateId,
                      targetTemplateId: row.targetTemplateId!,
                    })),
                  });
                  setNotice(`${result.changed} SKU actualizados y auditados.`);
                  setPreview(null);
                  await onSaved();
                  setRecords(await exportAdminCategoryAssignments());
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'No se pudieron confirmar las asignaciones',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Guardando…' : 'Confirmar asignaciones'}
            </Button>
          </>
        ) : null}
      </div>
    </WorkspaceDrawer>
  );
}
