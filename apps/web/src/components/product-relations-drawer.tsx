'use client';

import {
  createGroupApplicationSchema,
  updateGroupApplicationSchema,
  createExternalHomologSchema,
  updateExternalHomologSchema,
  createGroupOemCodeSchema,
  updateGroupOemCodeSchema,
  type GroupApplicationDto,
  type ExternalHomologDto,
  type GroupOemCodeDto,
} from '@cdr/contracts';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import {
  createApplication,
  updateApplication,
  deactivateApplication,
  createHomolog,
  updateHomolog,
  deactivateHomolog,
  createOemCode,
  updateOemCode,
  deactivateOemCode,
} from '@/lib/operational-api';

type Kind = 'applications' | 'homologs' | 'oem';
const titles: Record<Kind, string> = {
  applications: 'Gestionar aplicaciones',
  homologs: 'Gestionar homólogos',
  oem: 'Gestionar OEM',
};
const applicationFields = [
  ['make', 'Marca / industria'],
  ['model', 'Modelo / equipo'],
  ['bodyStyle', 'Tipo / carrocería'],
  ['fuel', 'Combustible'],
  ['traction', 'Tracción'],
  ['displacement', 'Cilindraje'],
  ['yearFrom', 'Año desde'],
  ['yearTo', 'Año hasta'],
  ['area', 'Área'],
  ['subarea', 'Subárea'],
  ['engine', 'Motor'],
  ['notes', 'Observaciones'],
] as const;

export function ProductRelationsDrawer({
  kind,
  unifiedCode,
  applications,
  homologs,
  oemCodes,
  onClose,
  onSaved,
}: {
  kind: Kind;
  unifiedCode: string;
  applications: readonly GroupApplicationDto[];
  homologs: readonly ExternalHomologDto[];
  oemCodes: readonly GroupOemCodeDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [values, setValues] = useState<Record<string, string>>({
    vehicleType: 'AUTOMOTRIZ',
    approvalStatus: 'pending',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = kind === 'applications' ? applications : kind === 'homologs' ? homologs : oemCodes;
  const current = rows.find((row) => row.id === selected);
  const setField = (key: string, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const choose = (id: string) => {
    setSelected(id);
    setError(null);
    const row = rows.find((entry) => entry.id === id);
    setValues(
      row
        ? Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value),
            ]),
          )
        : { vehicleType: 'AUTOMOTRIZ', approvalStatus: 'pending' },
    );
  };
  const save = async (deactivate = false) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (deactivate && current) {
        if (kind === 'applications') await deactivateApplication(current.id, current.updatedAt);
        else if (kind === 'homologs') await deactivateHomolog(current.id, current.updatedAt);
        else await deactivateOemCode(current.id, current.updatedAt);
      } else if (kind === 'applications') {
        const fields = {
          vehicleType: values.vehicleType,
          ...Object.fromEntries(
            applicationFields.map(([key]) => [
              key,
              key === 'yearFrom' || key === 'yearTo'
                ? values[key]?.trim()
                  ? Number(values[key])
                  : current
                    ? null
                    : undefined
                : (values[key] ?? ''),
            ]),
          ),
        };
        if (current)
          await updateApplication(
            current.id,
            updateGroupApplicationSchema.parse({ ...fields, expectedUpdatedAt: current.updatedAt }),
          );
        else
          await createApplication(createGroupApplicationSchema.parse({ ...fields, unifiedCode }));
      } else if (kind === 'homologs') {
        const fields = {
          externalCode: values.externalCode,
          externalBrand: values.externalBrand,
          approvalStatus: values.approvalStatus,
        };
        if (current)
          await updateHomolog(
            current.id,
            updateExternalHomologSchema.parse({ ...fields, expectedUpdatedAt: current.updatedAt }),
          );
        else await createHomolog(createExternalHomologSchema.parse({ ...fields, unifiedCode }));
      } else {
        const fields = {
          oemCode: values.oemCode,
          brands: (values.brands ?? '')
            .split(',')
            .map((brand) => brand.trim())
            .filter(Boolean),
          approvalStatus: values.approvalStatus,
        };
        if (current)
          await updateOemCode(
            current.id,
            updateGroupOemCodeSchema.parse({ ...fields, expectedUpdatedAt: current.updatedAt }),
          );
        else await createOemCode(createGroupOemCodeSchema.parse({ ...fields, unifiedCode }));
      }
      onSaved();
      onClose();
    } catch (cause) {
      const issues =
        typeof cause === 'object' &&
        cause !== null &&
        'issues' in cause &&
        Array.isArray(cause.issues)
          ? cause.issues
          : [];
      setError(
        issues.length
          ? 'Revisa los campos obligatorios, los valores permitidos y el rango de años.'
          : cause instanceof Error
            ? cause.message
            : 'No fue posible guardar la relación.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <WorkspaceDrawer title={titles[kind]} busy={saving} onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">
        Código unificador {unifiedCode}. Los cambios se comparten con todos sus SKU.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Select
          label="Registro"
          value={selected}
          onChange={(event) => choose(event.target.value)}
          disabled={saving}
        >
          <option value="">Agregar nuevo</option>
          {rows
            .filter((row) => row.active)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {'make' in row
                  ? [row.make, row.model, row.yearFrom, row.yearTo].filter(Boolean).join(' · ')
                  : 'externalCode' in row
                    ? `${row.externalCode} · ${row.externalBrand}`
                    : `${row.oemCode} · ${row.brands.join(', ')}`}
              </option>
            ))}
        </Select>
        {kind === 'applications' ? (
          <>
            <Select
              label="Tipo de aplicación"
              value={values.vehicleType ?? 'AUTOMOTRIZ'}
              onChange={(event) => setField('vehicleType', event.target.value)}
              disabled={saving}
            >
              <option value="AUTOMOTRIZ">Automotriz</option>
              <option value="INDUSTRIAL">Industrial</option>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              {applicationFields.map(([key, label]) => (
                <label key={key} className="grid gap-1 text-xs font-semibold">
                  {label}
                  <Input
                    value={values[key] ?? ''}
                    onChange={(event) => setField(key, event.target.value)}
                    disabled={saving}
                    required={key === 'make' || key === 'model'}
                    type={key === 'yearFrom' || key === 'yearTo' ? 'number' : 'text'}
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="grid gap-1 text-xs font-semibold">
              {kind === 'oem' ? 'Código OEM' : 'Código homólogo'}
              <Input
                required
                value={values[kind === 'oem' ? 'oemCode' : 'externalCode'] ?? ''}
                onChange={(event) =>
                  setField(kind === 'oem' ? 'oemCode' : 'externalCode', event.target.value)
                }
                disabled={saving}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              {kind === 'oem' ? 'Marcas (separadas por coma)' : 'Marca homólogo'}
              <Input
                required
                value={values[kind === 'oem' ? 'brands' : 'externalBrand'] ?? ''}
                onChange={(event) =>
                  setField(kind === 'oem' ? 'brands' : 'externalBrand', event.target.value)
                }
                disabled={saving}
              />
            </label>
            <Select
              label="Estado de aprobación"
              value={values.approvalStatus ?? 'pending'}
              onChange={(event) => setField('approvalStatus', event.target.value)}
              disabled={saving}
            >
              <option value="pending">Pendiente</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
            </Select>
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : current ? 'Guardar cambios' : 'Agregar'}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void save(true)}
            >
              Desactivar registro
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </WorkspaceDrawer>
  );
}
