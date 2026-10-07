import { type SemanticSearchResponse, semanticSearchResponseSchema } from '@cdr/contracts';

import { authenticatedBffFetch } from '@/lib/bff-client';

const SEMANTIC_SEARCH_PATH = '/api/operations/search/semantic';

export class SearchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SearchApiError';
  }
}

export async function semanticSearch(
  query: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<SemanticSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await authenticatedBffFetch(`${SEMANTIC_SEARCH_PATH}?${params.toString()}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La búsqueda semántica respondió con estado ${response.status}.`;
    throw new SearchApiError(message, response.status);
  }
  const parsed = semanticSearchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SearchApiError('La respuesta semántica no coincide con el contrato.', 502);
  }
  return parsed.data;
}
