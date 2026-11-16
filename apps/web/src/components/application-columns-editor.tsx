'use client';
import { useEffect, useState } from 'react';
import type { ApplicationColumnSettingsDto } from '@cdr/contracts';
import { updateApplicationColumns } from '@/lib/application-columns-api';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function ApplicationColumnsEditor({
  open,
  settings,
  onClose,
  onSaved,
}: {
  open: boolean;
  settings: ApplicationColumnSettingsDto;
  onClose: () => void;
  onSaved: (settings: ApplicationColumnSettingsDto) => void;
}) {
  const [columns, setColumns] = useState(settings.columns),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setColumns(settings.columns.map((column) => ({ ...column, aliases: [...column.aliases] })));
      setError(null);
    }
  }, [open, settings]);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateApplicationColumns({
        columns: columns.map((column) => ({
          ...column,
          aliases: column.aliases.filter((alias) => alias.trim()),
        })),
        expectedVersion: settings.version,
      });
      onSaved(updated);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron guardar las columnas');
    } finally {
      setSaving(false);
    }
  };
  if (!open) return null;
  return (
    <WorkspaceDrawer
      busy={saving}
      onClose={onClose}
      title="Columnas de la plantilla de aplicaciones"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Incorpora los campos adicionales entregados por el cliente. Las columnas base se conservan.
        La lista inicial está vacía.
      </p>
      <div className="grid gap-4">
        {columns.map((column, index) => (
          <fieldset key={index} className="grid gap-2 rounded border p-3">
            <legend className="text-sm font-semibold">Columna {index + 1}</legend>
            {(['label', 'key', 'header'] as const).map((field) => (
              <label key={field} className="grid gap-1 text-xs">
                {
                  {
                    label: 'Nombre visible',
                    key: 'Clave del campo',
                    header: 'Encabezado de importación',
                  }[field]
                }
                <Input
                  disabled={saving}
                  value={column[field]}
                  onChange={(event) =>
                    setColumns((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, [field]: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs">
              Otros encabezados aceptados, separados por coma
              <Input
                disabled={saving}
                value={column.aliases.join(', ')}
                onChange={(event) =>
                  setColumns((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            aliases: event.target.value.split(',').map((alias) => alias.trim()),
                          }
                        : item,
                    ),
                  )
                }
              />
            </label>
            <label className="text-xs">
              <input
                type="checkbox"
                checked={column.required}
                disabled={saving}
                onChange={(event) =>
                  setColumns((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, required: event.target.checked } : item,
                    ),
                  )
                }
              />{' '}
              Obligatorio
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setColumns((current) => current.filter((_, i) => i !== index))}
            >
              Quitar columna
            </Button>
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          disabled={saving || columns.length >= 60}
          onClick={() =>
            setColumns((current) => [
              ...current,
              {
                key: `campo_${current.length + 1}`,
                label: 'Nueva columna',
                header: `campo_${current.length + 1}`,
                required: false,
                aliases: [],
              },
            ])
          }
        >
          Agregar columna
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'Guardando…' : 'Guardar columnas'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </WorkspaceDrawer>
  );
}
