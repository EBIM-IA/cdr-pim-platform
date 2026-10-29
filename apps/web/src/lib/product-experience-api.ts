import {
  productExperienceSchema,
  productNameSettingsSchema,
  productVariantSearchSchema,
  type ProductExperienceDto,
  type ProductNameConfig,
  type ProductNameSettingsDto,
  type ProductVariantSearchDto,
} from '@cdr/contracts';
import type { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await authenticatedBffFetch(`/api/product-experience${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No fue posible consultar los nombres del producto.',
    );
  return schema.parse(body);
}
export const fetchProductExperience = (
  id: string,
  signal?: AbortSignal,
): Promise<ProductExperienceDto> =>
  request(`/${encodeURIComponent(id)}`, productExperienceSchema, { signal });
export const fetchProductNameSettings = (signal?: AbortSignal): Promise<ProductNameSettingsDto> =>
  request('/settings', productNameSettingsSchema, { signal });
export const saveProductNameSettings = (
  input: ProductNameSettingsDto,
): Promise<ProductNameSettingsDto> =>
  request('/settings', productNameSettingsSchema, { method: 'PATCH', body: JSON.stringify(input) });
export const previewProductName = (
  productId: string,
  config: ProductNameConfig,
  signal?: AbortSignal,
): Promise<ProductExperienceDto> =>
  request('/preview', productExperienceSchema, {
    method: 'POST',
    body: JSON.stringify({ productId, config }),
    signal,
  });
export const searchProductVariants = (
  query: string,
  signal?: AbortSignal,
): Promise<ProductVariantSearchDto> =>
  request(`/search?${new URLSearchParams({ q: query, limit: '12' })}`, productVariantSearchSchema, {
    signal,
  });
