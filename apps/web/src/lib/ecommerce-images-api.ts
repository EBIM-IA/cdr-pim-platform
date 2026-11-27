import {
  ecommerceImageHistorySchema,
  ecommerceImageImportResponseSchema,
  ecommerceImageLookupResponseSchema,
  ecommerceImageStatusSchema,
  type EcommerceImageImportRequest,
  type EcommerceImageLookupRequest,
} from '@cdr/contracts';
import type { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

async function request<T>(
  path: 'status' | 'lookup' | 'import' | 'history',
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  input?: EcommerceImageImportRequest | EcommerceImageLookupRequest,
): Promise<T> {
  const response = await authenticatedBffFetch(`/api/operations/assets/ecommerce/${path}`, {
    cache: 'no-store',
    signal,
    headers: { accept: 'application/json', ...(input && { 'content-type': 'application/json' }) },
    ...(input && { method: 'POST', body: JSON.stringify(input) }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'La operación con las imágenes no pudo completarse.';
    const reference =
      body &&
      typeof body === 'object' &&
      'correlationId' in body &&
      typeof body.correlationId === 'string'
        ? ` Referencia ${body.correlationId}.`
        : '';
    throw new Error(`${message}${reference}`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error('El servicio devolvió una respuesta de imágenes inválida.');
  return parsed.data;
}

export function fetchEcommerceImageStatus(signal?: AbortSignal) {
  return request('status', ecommerceImageStatusSchema, signal);
}

export function lookupEcommerceImages(input: EcommerceImageLookupRequest, signal?: AbortSignal) {
  return request('lookup', ecommerceImageLookupResponseSchema, signal, input);
}

export function importEcommerceImage(input: EcommerceImageImportRequest, signal?: AbortSignal) {
  return request('import', ecommerceImageImportResponseSchema, signal, input);
}

export function fetchEcommerceImageHistory(signal?: AbortSignal) {
  return request('history', ecommerceImageHistorySchema, signal);
}
