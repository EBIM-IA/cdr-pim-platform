import {
  technicalSheetVisibilitySchema,
  technicalSheetVisibilityListSchema,
  type TechnicalSheetVisibilityDto,
} from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';
import type { z } from 'zod';

async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No se pudo consultar la visibilidad de la ficha técnica.',
    );
  const result = schema.safeParse(body);
  if (!result.success) throw new Error('La respuesta de visibilidad no es válida.');
  return result.data;
}

export async function getTechnicalSheetVisibility(
  productId: string,
  signal?: AbortSignal,
): Promise<TechnicalSheetVisibilityDto> {
  return parse(
    await authenticatedBffFetch(
      `/api/operations/assets/technical-sheet-visibility/${encodeURIComponent(productId)}`,
      { cache: 'no-store', signal },
    ),
    technicalSheetVisibilitySchema,
  );
}

export async function listTechnicalSheetVisibility(
  productIds: readonly string[],
  signal?: AbortSignal,
): Promise<TechnicalSheetVisibilityDto[]> {
  if (!productIds.length) return [];
  const batches: TechnicalSheetVisibilityDto[] = [];
  for (let offset = 0; offset < productIds.length; offset += 100) {
    const query = new URLSearchParams({
      productIds: productIds.slice(offset, offset + 100).join(','),
    });
    batches.push(
      ...(await parse(
        await authenticatedBffFetch(`/api/operations/assets/technical-sheet-visibility?${query}`, {
          cache: 'no-store',
          signal,
        }),
        technicalSheetVisibilityListSchema,
      )),
    );
  }
  return batches;
}

export async function updateTechnicalSheetVisibility(
  productId: string,
  visible: boolean,
  expectedVersion: number,
): Promise<TechnicalSheetVisibilityDto> {
  return parse(
    await authenticatedBffFetch(
      `/api/operations/assets/technical-sheet-visibility/${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visible, expectedVersion }),
      },
    ),
    technicalSheetVisibilitySchema,
  );
}
