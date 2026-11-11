'use client';
import type {
  AdminTemplateDto,
  DynamicAttributeDataType,
  TemplateInheritancePreviewDto,
} from '@cdr/contracts';
import { useState } from 'react';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addAdminTemplateAttribute,
  previewAdminTemplateInheritance,
} from '@/lib/catalog-admin-api';

export function AddTemplateAttributeDrawer({
  template,
  onClose,
  onSaved,
}: {
  template: AdminTemplateDto;
  onClose: () => void;
  onSaved: (template: AdminTemplateDto) => void;
}) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [dataType, setDataType] = useState<DynamicAttributeDataType>('text');
  const [unit, setUnit] = useState('');
  const [allowedValues, setAllowedValues] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <WorkspaceDrawer
      title="Añadir atributo"
      busy={saving}
      unsavedChanges={Boolean(key || label)}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const updated = await addAdminTemplateAttribute(template.id, {
              key,
              label,
              dataType,
              unit: unit || null,
              allowedValues: allowedValues
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              expectedUpdatedAt: template.updatedAt,
            });
            onSaved(updated);
            onClose();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo añadir el atributo');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="text-sm text-muted-foreground">
          {template.name} · El atributo nuevo comienza visible solo para ADMINISTRADOR. Configura
          sus permisos y reglas después de crearlo.
        </p>
        {error ? (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <fieldset disabled={saving} className="space-y-4">
          <label className="grid gap-1.5 text-sm">
            Nombre
            <Input
              required
              maxLength={200}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Clave técnica única
            <Input
              required
              pattern="[a-z][a-z0-9_]*"
              maxLength={100}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="diametro_especial"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Tipo
            <select
              className="h-11 rounded-md border px-3"
              value={dataType}
              onChange={(event) => setDataType(event.target.value as DynamicAttributeDataType)}
            >
              {Object.entries({
                text: 'Texto',
                number: 'Número',
                boolean: 'Sí / no',
                date: 'Fecha',
                enum: 'Lista',
                measurement: 'Medida',
              }).map(([value, name]) => (
                <option value={value} key={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            Unidad
            <Input
              maxLength={50}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="mm"
            />
          </label>
          {dataType === 'enum' ? (
            <label className="grid gap-1.5 text-sm">
              Valores permitidos, separados por coma
              <Input
                required
                value={allowedValues}
                onChange={(event) => setAllowedValues(event.target.value)}
              />
            </label>
          ) : null}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir atributo'}
          </Button>
        </div>
      </form>
    </WorkspaceDrawer>
  );
}

export function TemplateInheritanceSimulator({ templateId }: { templateId: string }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<TemplateInheritancePreviewDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 border-t pt-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          setResult(null);
          try {
            setResult(await previewAdminTemplateInheritance(templateId, code));
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo simular la herencia');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid flex-1 gap-1.5 text-xs">
          Código unificador existente
          <Input
            required
            maxLength={200}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setResult(null);
            }}
            placeholder="Ingresa el código unificador"
          />
        </label>
        <Button disabled={busy} type="submit">
          {busy ? 'Consultando…' : 'Simular herencia'}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 text-sm">
          <p className="mb-2 text-xs text-muted-foreground">
            {result.sourceSkus.length
              ? `SKU del grupo en esta plantilla: ${result.sourceSkus.join(', ')}`
              : 'Sin SKU del mismo código unificador en esta plantilla. No hay valores para heredar.'}
          </p>
          <div className="max-h-80 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="p-2">Atributo</th>
                  <th className="p-2">Valor heredado</th>
                  <th className="p-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {result.attributes.map((attribute) => (
                  <tr className="border-t" key={attribute.key}>
                    <td className="p-2">{attribute.label}</td>
                    <td className="p-2">
                      {attribute.value === null ? '—' : String(attribute.value)}
                    </td>
                    <td className="p-2">
                      {attribute.conflict
                        ? 'Conflicto: valores distintos en el grupo'
                        : attribute.value !== null
                          ? 'Se hereda'
                          : attribute.required
                            ? 'Pendiente obligatorio'
                            : 'Queda vacío'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            La simulación consulta datos vigentes y no crea productos ni modifica AX.
          </p>
        </div>
      ) : null}
    </div>
  );
}
