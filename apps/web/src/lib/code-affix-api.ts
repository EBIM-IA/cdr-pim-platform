import {
  type CodeAffixDto,
  type CodeAffixListQuery,
  type CreateCodeAffixInput,
  type ParseProductCodeInput,
  type ParsedProductCodeDto,
  type UpdateCodeAffixInput,
  type ValidateCodeAffixInput,
  codeAffixSchema,
  parsedProductCodeSchema,
} from '@cdr/contracts';
import { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

const PATH = '/api/operations/code-affixes';

export class CodeAffixApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CodeAffixApiError';
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await authenticatedBffFetch(`${PATH}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación respondió con estado ${response.status}.`;
    throw new CodeAffixApiError(message, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new CodeAffixApiError('La respuesta no coincide con el contrato.', 502);
  return parsed.data;
}

export function listCodeAffixes(
  filters: CodeAffixListQuery = { includeInactive: false },
  signal?: AbortSignal,
): Promise<CodeAffixDto[]> {
  const params = new URLSearchParams({ includeInactive: String(filters.includeInactive) });
  if (filters.q) params.set('q', filters.q);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  return request(`?${params.toString()}`, z.array(codeAffixSchema), { signal });
}

export function createCodeAffix(input: CreateCodeAffixInput): Promise<CodeAffixDto> {
  return request('', codeAffixSchema, { method: 'POST', body: JSON.stringify(input) });
}

export function updateCodeAffix(id: string, input: UpdateCodeAffixInput): Promise<CodeAffixDto> {
  return request(`/${encodeURIComponent(id)}`, codeAffixSchema, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deactivateCodeAffix(id: string): Promise<CodeAffixDto> {
  return request(`/${encodeURIComponent(id)}`, codeAffixSchema, { method: 'DELETE' });
}

export function validateCodeAffix(
  id: string,
  input: ValidateCodeAffixInput,
): Promise<CodeAffixDto> {
  return request(`/${encodeURIComponent(id)}/validation`, codeAffixSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function parseCode(input: ParseProductCodeInput): Promise<ParsedProductCodeDto> {
  return request('/parse', parsedProductCodeSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
