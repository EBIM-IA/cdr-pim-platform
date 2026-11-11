import {
  ecommerceDescriptionResultSchema,
  ecommerceDescriptionSchema,
  type EcommerceMutationInput,
  type EcommerceVariantInput,
  type EcommerceDescriptionDto,
} from '@cdr/contracts';
import { authenticatedBffFetch } from './bff-client';
export async function fetchEcommerceDescription(
  productId: string,
  variant: EcommerceVariantInput,
  signal?: AbortSignal,
): Promise<EcommerceDescriptionDto | null> {
  const query = new URLSearchParams({ type: variant.type });
  if (variant.applicationId) query.set('applicationId', variant.applicationId);
  const response = await authenticatedBffFetch(
    `/api/operations/ecommerce/${encodeURIComponent(productId)}?${query}`,
    { signal, cache: 'no-store' },
  );
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No se pudo consultar la descripción.',
    );
  return ecommerceDescriptionResultSchema.parse(body);
}
export async function saveEcommerceDescription(
  productId: string,
  input: EcommerceMutationInput,
): Promise<EcommerceDescriptionDto> {
  const response = await authenticatedBffFetch(
    `/api/operations/ecommerce/${encodeURIComponent(productId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No se pudo guardar la descripción.',
    );
  return ecommerceDescriptionSchema.parse(body);
}
