import { catalogHomeSettingsSchema, type CatalogHomeSettingsDto } from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
export async function catalogHomeSettings(
  input?: CatalogHomeSettingsDto,
  signal?: AbortSignal,
): Promise<CatalogHomeSettingsDto> {
  const response = await authenticatedBffFetch('/api/catalog/home', {
    method: input ? 'PATCH' : 'GET',
    cache: 'no-store',
    signal,
    ...(input
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }
      : {}),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No fue posible consultar la configuración del Inicio.',
    );
  return catalogHomeSettingsSchema.parse(body);
}
