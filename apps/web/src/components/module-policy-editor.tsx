'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { modulePoliciesSchema, type AuthCapability } from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ModulePolicyEditor({
  matrix,
  modules,
  canManage,
}: {
  matrix: { role: string; capabilities: string[] }[];
  modules: readonly { label: string; capability: AuthCapability }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [grants, setGrants] = useState(matrix);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const roles = ['ADMINISTRADOR', 'COMPRAS', 'VENTAS'];
  async function save(role: string, capability: AuthCapability, visible: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const response = await authenticatedBffFetch('/api/identity/module-policies', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, capability, visible }),
      });
      if (!response.ok) throw new Error('No se pudo guardar la política. Vuelve a intentarlo.');
      modulePoliciesSchema.parse(await response.json());
      setGrants((current) =>
        current.map((entry) =>
          entry.role === role
            ? {
                ...entry,
                capabilities: visible
                  ? [...new Set([...entry.capabilities, capability])]
                  : entry.capabilities.filter((value) => value !== capability),
              }
            : entry,
        ),
      );
      setMessage(
        'Permiso actualizado. El cambio queda auditado y se aplica desde la siguiente solicitud.',
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (busy || !canManage) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await authenticatedBffFetch('/api/identity/module-policies/reset', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(
          'No se pudo completar el restablecimiento. Actualiza la pantalla para revisar los permisos vigentes antes de reintentar.',
        );
      const { policies } = modulePoliciesSchema.parse(await response.json());
      setGrants((current) =>
        current.map((entry) => {
          const capabilities = new Set(entry.capabilities);
          for (const policy of policies.filter((policy) => policy.role === entry.role)) {
            if (policy.visible) capabilities.add(policy.capability);
            else capabilities.delete(policy.capability);
          }
          return { ...entry, capabilities: [...capabilities] };
        }),
      );
      setMessage(
        'Módulos por defecto restablecidos. Los permisos para modificar datos se conservan.',
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo completar el restablecimiento.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b p-4 text-sm font-semibold">Módulos visibles por perfil</h2>
      <div className="p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          Activa o desactiva pantallas por perfil. Los permisos para modificar datos y los roles de
          identidad conservan su propia autorización.
        </p>
        {message ? (
          <p role="status" className="mb-3 rounded border p-3 text-sm">
            {message}
          </p>
        ) : null}
        <div className="overflow-auto">
          <table
            aria-label="Módulos visibles por perfil"
            className="w-full min-w-[650px] text-left text-xs"
          >
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3">Módulo</th>
                {roles.map((role) => (
                  <th key={role} className="p-3">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(({ label, capability }) => (
                <tr key={capability} className="border-t">
                  <th scope="row" className="p-3 font-medium">
                    {label}
                  </th>
                  {roles.map((role) => (
                    <td key={role} className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`${label} para ${role}`}
                        checked={
                          grants
                            .find((entry) => entry.role === role)
                            ?.capabilities.includes(capability) ?? false
                        }
                        disabled={
                          !canManage ||
                          busy ||
                          (role === 'ADMINISTRADOR' && capability === 'menu:administration:view')
                        }
                        onChange={(event) => void save(role, capability, event.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="mt-5 border-t pt-4" aria-label="Fichas técnicas PDF por perfil">
          <h3 className="font-semibold">Fichas técnicas PDF</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Permite generar y descargar varias fichas en un ZIP desde Productos. La ficha individual
            sigue disponible para todos los perfiles.
          </p>
          <div className="mt-3 flex flex-wrap gap-5">
            {roles.map((role) => (
              <label key={role} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Fichas técnicas PDF para ${role}`}
                  checked={
                    grants
                      .find((entry) => entry.role === role)
                      ?.capabilities.includes('technical-sheets:bulk') ?? false
                  }
                  disabled={!canManage || busy || role === 'ADMINISTRADOR'}
                  onChange={(event) =>
                    void save(role, 'technical-sheets:bulk', event.target.checked)
                  }
                />
                {role}
              </label>
            ))}
          </div>
        </section>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage || busy}
            onClick={() => void reset()}
          >
            Volver a los módulos por defecto
          </Button>
        </div>
      </div>
    </Card>
  );
}
