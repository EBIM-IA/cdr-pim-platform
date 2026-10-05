import {
  auditChangeListSchema,
  externalHomologSchema,
  groupApplicationSchema,
  homologSearchResultSchema,
  importBatchSchema,
  type AuditChangeListDto,
  type AuditChangeListQuery,
  type CreateExternalHomologInput,
  type CreateGroupApplicationInput,
  type ExternalHomologDto,
  type GroupApplicationDto,
  type HomologSearchResultDto,
  type ImportBatchDto,
  type PreviewImportInput,
  type UpdateExternalHomologInput,
  type UpdateGroupApplicationInput,
} from '@cdr/contracts';
import { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

export class OperationalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OperationalApiError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await authenticatedBffFetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación respondió con estado ${response.status}.`;
    throw new OperationalApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new OperationalApiError('La respuesta no coincide con el contrato.', 502);
  return parsed.data;
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const result = query.toString();
  return result ? `?${result}` : '';
}

export function listApplications(
  filters: {
    unifiedCode?: string;
    includeInactive?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<GroupApplicationDto[]> {
  return request(
    `/api/operations/applications${queryString(filters)}`,
    z.array(groupApplicationSchema),
    { signal },
  );
}

export function createApplication(
  input: CreateGroupApplicationInput,
): Promise<GroupApplicationDto> {
  return request('/api/operations/applications', groupApplicationSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateApplication(
  id: string,
  input: UpdateGroupApplicationInput,
): Promise<GroupApplicationDto> {
  return request(`/api/operations/applications/${encodeURIComponent(id)}`, groupApplicationSchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deactivateApplication(id: string): Promise<GroupApplicationDto> {
  return request(`/api/operations/applications/${encodeURIComponent(id)}`, groupApplicationSchema, {
    method: 'DELETE',
  });
}

export function listHomologs(
  filters: {
    unifiedCode?: string;
    includeInactive?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<ExternalHomologDto[]> {
  return request(
    `/api/operations/equivalences${queryString(filters)}`,
    z.array(externalHomologSchema),
    { signal },
  );
}

export function createHomolog(input: CreateExternalHomologInput): Promise<ExternalHomologDto> {
  return request('/api/operations/equivalences', externalHomologSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateHomolog(
  id: string,
  input: UpdateExternalHomologInput,
): Promise<ExternalHomologDto> {
  return request(`/api/operations/equivalences/${encodeURIComponent(id)}`, externalHomologSchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function searchEligibleHomologs(q: string): Promise<HomologSearchResultDto[]> {
  return request(
    `/api/operations/equivalences/search${queryString({ q })}`,
    z.array(homologSearchResultSchema),
  );
}

export function previewImport(input: PreviewImportInput): Promise<ImportBatchDto> {
  return request('/api/operations/imports/preview', importBatchSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmImport(id: string): Promise<ImportBatchDto> {
  return request(`/api/operations/imports/${encodeURIComponent(id)}/confirm`, importBatchSchema, {
    method: 'POST',
  });
}

export function getImport(id: string): Promise<ImportBatchDto> {
  return request(`/api/operations/imports/${encodeURIComponent(id)}`, importBatchSchema);
}

export function listAuditChanges(
  query: AuditChangeListQuery,
  signal?: AbortSignal,
): Promise<AuditChangeListDto> {
  return request(
    `/api/operations/audit${queryString(query as Record<string, string | number | undefined>)}`,
    auditChangeListSchema,
    { signal },
  );
}
