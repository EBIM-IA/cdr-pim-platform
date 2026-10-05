import { workspaceSchema, type WorkspaceDto, type WorkspaceSlug } from '@cdr/contracts';

import { authenticatedBffFetch } from '@/lib/bff-client';

export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WorkspaceApiError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La API respondió con estado ${response.status}.`;
    throw new WorkspaceApiError(message, response.status);
  }
  return body;
}

export async function fetchWorkspace(
  slug: WorkspaceSlug,
  signal?: AbortSignal,
): Promise<WorkspaceDto> {
  const response = await authenticatedBffFetch(`/api/workspaces/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const parsed = workspaceSchema.safeParse(await readJson(response));
  if (!parsed.success || parsed.data.slug !== slug) {
    throw new WorkspaceApiError('La respuesta del módulo no coincide con el contrato compartido.');
  }
  return parsed.data;
}
