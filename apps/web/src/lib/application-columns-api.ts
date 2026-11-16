import {
  applicationColumnSettingsSchema,
  updateApplicationColumnSettingsSchema,
  type UpdateApplicationColumnSettingsInput,
} from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
async function request(init?: RequestInit) {
  const response = await authenticatedBffFetch('/api/operations/applications/columns', {
    cache: 'no-store',
    ...init,
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No fue posible consultar las columnas de aplicaciones',
    );
  const parsed = applicationColumnSettingsSchema.safeParse(body);
  if (!parsed.success) throw new Error('La respuesta de columnas de aplicaciones no es válida.');
  return parsed.data;
}
export function getApplicationColumns(signal?: AbortSignal) {
  return request({ signal });
}
export function updateApplicationColumns(input: UpdateApplicationColumnSettingsInput) {
  return request({
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updateApplicationColumnSettingsSchema.parse(input)),
  });
}
