import {
  unifiedCodeRequestSchema,
  type CreateUnifiedCodeRequestInput,
  type UpdateUnifiedCodeRequestInput,
} from '@cdr/contracts';
import { authenticatedBffFetch } from './bff-client';
async function body(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : 'No se pudo procesar la solicitud',
    );
  return payload;
}
export async function listUnifiedCodeRequests() {
  return unifiedCodeRequestSchema
    .array()
    .parse(
      await body(
        await authenticatedBffFetch('/api/equivalences/code-requests', { cache: 'no-store' }),
      ),
    );
}
export async function createUnifiedCodeRequest(input: CreateUnifiedCodeRequestInput) {
  return unifiedCodeRequestSchema.parse(
    await body(
      await authenticatedBffFetch('/api/equivalences/code-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    ),
  );
}
export async function updateUnifiedCodeRequest(id: string, input: UpdateUnifiedCodeRequestInput) {
  return unifiedCodeRequestSchema.parse(
    await body(
      await authenticatedBffFetch(`/api/equivalences/code-requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    ),
  );
}
