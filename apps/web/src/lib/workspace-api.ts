import {
  workspaceSchema,
  type WorkspaceDto,
  type WorkspaceQuery,
  type WorkspaceSlug,
} from '@cdr/contracts';

import { authenticatedBffFetch } from '@/lib/bff-client';

import { workspaceQueryParams } from '@/lib/workspace-query';

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
  query: WorkspaceQuery = {},
): Promise<WorkspaceDto> {
  const params = workspaceQueryParams(query);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await authenticatedBffFetch(
    `/api/workspaces/${encodeURIComponent(slug)}${suffix}`,
    {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal,
    },
  );
  const parsed = workspaceSchema.safeParse(await readJson(response));
  if (!parsed.success || parsed.data.slug !== slug) {
    throw new WorkspaceApiError('La respuesta del módulo no coincide con el contrato compartido.');
  }
  return parsed.data;
}
