'use client';

import type { WorkspaceDto, WorkspaceRow } from '@cdr/contracts';
import { useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceDrawer } from '@/components/workspace-drawer';
import { downloadCsv } from '@/lib/tabular-export';

/** Local accounts are configured by the deployment; no identity-provider writes are simulated. */
export function AdministrationUsersView({ workspace }: { workspace: WorkspaceDto }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<WorkspaceRow | 'new' | null>(null);
  const accounts = workspace.rows.filter((row) => row.id.startsWith('user:'));
  const roles = [...new Set(accounts.map((row) => String(row.values.grant ?? '')))];
  const rows = accounts.filter(
    (row) =>
      (!query.trim() ||
        `Cuenta local ${String(row.values.actor ?? '')} ${String(row.values.grant ?? '')}`
          .toLocaleLowerCase('es')
          .includes(query.trim().toLocaleLowerCase('es'))) &&
      (!role || String(row.values.grant) === role) &&
      status !== 'inactive',
  );
  const account = selected && selected !== 'new' ? selected : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Usuarios locales', 'users'],
          ['Habilitados', 'active-users'],
          ['Inactivos', 'inactive-users'],
        ].map(([label, key]) => (
          <Card key={key} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <strong className="mt-1 block text-2xl">
              {workspace.metrics.find((metric) => metric.key === key)?.value ?? '—'}
            </strong>
            <p className="mt-1 text-xs text-muted-foreground">
              Cuentas configuradas en este entorno
            </p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="text-sm font-semibold">Usuarios</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  {
                    headers: ['Nombre', 'Correo', 'Rol', 'Estado'],
                    rows: rows.map((row) => [
                      'Cuenta local',
                      String(row.values.actor ?? ''),
                      String(row.values.grant ?? ''),
                      'Habilitada en este entorno',
                    ]),
                  },
                  'usuarios-locales-filtrados',
                )
              }
            >
              Exportar usuarios (CSV)
            </Button>
            <Button size="sm" onClick={() => setSelected('new')}>
              Nuevo usuario
            </Button>
          </div>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Buscar usuario
            <Input
              type="search"
              placeholder="Buscar por nombre o correo…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Select
            label="Filtrar por rol"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Todos los roles</option>
            {roles.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            label="Estado del usuario"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="active">Habilitados</option>
            <option value="inactive">Inactivos</option>
          </Select>
        </div>
        <div className="overflow-auto">
          <table aria-label="Usuarios locales" className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                {['Nombre', 'Correo', 'Rol', 'Estado', 'Acciones'].map((label) => (
                  <th key={label} className="border-b p-2.5">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <th scope="row" className="p-2.5 text-left font-medium">
                    Cuenta local
                  </th>
                  <td className="p-2.5">{String(row.values.actor ?? '')}</td>
                  <td className="p-2.5">{String(row.values.grant ?? '')}</td>
                  <td className="p-2.5">
                    <StatusBadge tone="success">Habilitada en este entorno</StatusBadge>
                  </td>
                  <td className="p-2.5">
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                      Ver usuario
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {accounts.length
                      ? 'No hay usuarios que coincidan con los filtros.'
                      : 'No hay un directorio de cuentas conectado.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            {rows.length} de {accounts.length} cuentas locales
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!query && !role && !status}
            onClick={() => {
              setQuery('');
              setRole('');
              setStatus('');
            }}
          >
            Limpiar filtros
          </Button>
        </div>
        <p className="border-t p-4 text-xs text-muted-foreground">
          Se muestran las cuentas locales configuradas y habilitadas en este entorno. Estos totales
          no representan un directorio corporativo. Las altas, bajas y cambios de rol dependen del
          proveedor de identidad pendiente.
        </p>
      </Card>
      {selected ? (
        <WorkspaceDrawer
          title={selected === 'new' ? 'Nuevo usuario' : 'Detalle de usuario'}
          onClose={() => setSelected(null)}
        >
          <p
            role="status"
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          >
            El mantenimiento de usuarios está pendiente de conectar al proveedor de identidad. Esta
            pantalla no crea cuentas, envía invitaciones ni modifica sus permisos.
          </p>
          <div className="space-y-4">
            <label className="grid gap-1 text-xs font-semibold">
              Nombre
              <Input
                value={account ? 'Cuenta local' : ''}
                disabled
                placeholder="Definido por el proveedor de identidad"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Correo
              <Input
                type="email"
                value={account ? String(account.values.actor ?? '') : ''}
                disabled
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Rol
              <Input value={account ? String(account.values.grant ?? '') : ''} disabled />
            </label>
            <label className="grid gap-1 text-xs font-semibold">
              Estado
              <Input value={account ? 'Habilitada en este entorno' : 'Sin crear'} disabled />
            </label>
            {account ? (
              <p className="break-all text-xs text-muted-foreground">Identificador: {account.id}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
              <Button
                disabled
                title="Requiere proveedor de identidad y contrato de administración de cuentas"
              >
                Guardar usuario
              </Button>
            </div>
          </div>
        </WorkspaceDrawer>
      ) : null}
    </div>
  );
}
