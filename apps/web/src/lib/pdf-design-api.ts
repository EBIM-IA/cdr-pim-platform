import { pdfDesignSettingsSchema, type PdfDesignSettingsDto } from '@cdr/contracts';
import { authenticatedBffFetch } from '@/lib/bff-client';

async function request(
  input?: PdfDesignSettingsDto,
  signal?: AbortSignal,
): Promise<PdfDesignSettingsDto> {
  const response = await authenticatedBffFetch('/api/catalog/admin/pdf-design', {
    method: input ? 'PUT' : 'GET',
    cache: 'no-store',
    signal,
    headers: {
      accept: 'application/json',
      ...(input ? { 'content-type': 'application/json' } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No fue posible consultar el diseño de las fichas PDF.',
    );
  return pdfDesignSettingsSchema.parse(body);
}
export const fetchPdfDesignSettings = (signal?: AbortSignal) => request(undefined, signal);
export const savePdfDesignSettings = (input: PdfDesignSettingsDto, signal?: AbortSignal) =>
  request(input, signal);
