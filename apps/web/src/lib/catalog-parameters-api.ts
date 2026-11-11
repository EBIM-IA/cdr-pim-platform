import {
  catalogParameterSchema,
  type CatalogParameterDto,
  type SaveCatalogParameterInput,
} from '@cdr/contracts';
import { authenticatedBffFetch } from './bff-client';
export async function listCatalogParameters(
  kind: CatalogParameterDto['kind'],
  signal?: AbortSignal,
): Promise<CatalogParameterDto[]> {
  const response = await authenticatedBffFetch(
    `/api/catalog/admin/parameters?${new URLSearchParams({ kind })}`,
    { cache: 'no-store', ...(signal ? { signal } : {}) },
  );
  if (!response.ok) throw new Error('No se pudieron cargar los parámetros');
  return catalogParameterSchema.array().parse(await response.json());
}
export async function saveCatalogParameter(
  input: SaveCatalogParameterInput,
): Promise<CatalogParameterDto> {
  const response = await authenticatedBffFetch('/api/catalog/admin/parameters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No se pudo guardar el parámetro',
    );
  return catalogParameterSchema.parse(body);
}
