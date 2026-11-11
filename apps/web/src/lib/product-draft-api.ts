import {
  type ProductDraftDto,
  type SaveProductDraftInput,
  productDraftSchema,
} from '@cdr/contracts';

import { authenticatedBffFetch } from './bff-client';

async function request(
  productId: string,
  input?: SaveProductDraftInput,
  signal?: AbortSignal,
): Promise<ProductDraftDto> {
  const response = await authenticatedBffFetch(
    `/api/catalog/products/${encodeURIComponent(productId)}/draft`,
    {
      method: input ? 'PATCH' : 'GET',
      cache: 'no-store',
      signal,
      headers: {
        accept: 'application/json',
        ...(input ? { 'content-type': 'application/json' } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'No fue posible acceder al borrador.';
    throw new Error(message);
  }
  return productDraftSchema.parse(body);
}

export const fetchProductDraft = (productId: string, signal?: AbortSignal) =>
  request(productId, undefined, signal);
export const saveProductDraft = (productId: string, input: SaveProductDraftInput) =>
  request(productId, input);
