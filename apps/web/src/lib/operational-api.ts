import {
  auditChangeListSchema,
  externalHomologSchema,
  groupOemCodeSchema,
  groupApplicationSchema,
  homologSearchResultSchema,
  oemSearchResultSchema,
  importBatchSchema,
  type AuditChangeListDto,
  type AuditChangeListQuery,
  type CreateExternalHomologInput,
  type CreateGroupOemCodeInput,
  type CreateGroupApplicationInput,
  type ExternalHomologDto,
  type GroupApplicationDto,
  type GroupOemCodeDto,
  type HomologSearchResultDto,
  type OemSearchResultDto,
  type ImportBatchDto,
  type PreviewImportInput,
  type UpdateExternalHomologInput,
  type UpdateGroupOemCodeInput,
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

export function deactivateApplication(
  id: string,
  expectedUpdatedAt: string,
): Promise<GroupApplicationDto> {
  return request(
    `/api/operations/applications/${encodeURIComponent(id)}${queryString({ expectedUpdatedAt })}`,
    groupApplicationSchema,
    { method: 'DELETE' },
  );
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

export function deactivateHomolog(
  id: string,
  expectedUpdatedAt: string,
): Promise<ExternalHomologDto> {
  return request(
    `/api/operations/equivalences/${encodeURIComponent(id)}${queryString({ expectedUpdatedAt })}`,
    externalHomologSchema,
    { method: 'DELETE' },
  );
}

export function searchEligibleHomologs(q: string): Promise<HomologSearchResultDto[]> {
  return request(
    `/api/operations/equivalences/search${queryString({ q })}`,
    z.array(homologSearchResultSchema),
  );
}

export function listOemCodes(
  filters: { unifiedCode?: string; brand?: string; includeInactive?: boolean } = {},
  signal?: AbortSignal,
): Promise<GroupOemCodeDto[]> {
  return request(
    `/api/operations/equivalences/oem${queryString(filters)}`,
    z.array(groupOemCodeSchema),
    { signal },
  );
}

export function createOemCode(input: CreateGroupOemCodeInput): Promise<GroupOemCodeDto> {
  return request('/api/operations/equivalences/oem', groupOemCodeSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateOemCode(
  id: string,
  input: UpdateGroupOemCodeInput,
): Promise<GroupOemCodeDto> {
  return request(`/api/operations/equivalences/oem/${encodeURIComponent(id)}`, groupOemCodeSchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deactivateOemCode(id: string, expectedUpdatedAt: string): Promise<GroupOemCodeDto> {
  return request(
    `/api/operations/equivalences/oem/${encodeURIComponent(id)}${queryString({ expectedUpdatedAt })}`,
    groupOemCodeSchema,
    { method: 'DELETE' },
  );
}

export function searchEligibleOemCodes(q: string): Promise<OemSearchResultDto[]> {
  return request(
    `/api/operations/equivalences/oem/search${queryString({ q })}`,
    z.array(oemSearchResultSchema),
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

export async function downloadAuditChangesCsv(query: AuditChangeListQuery): Promise<void> {
  const response = await authenticatedBffFetch(
    `/api/operations/audit/export${queryString(
      query as Record<string, string | number | undefined>,
    )}`,
    {
      headers: { accept: 'text/csv' },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La exportación respondió con estado ${response.status}.`;
    throw new OperationalApiError(message, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'auditoria.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
