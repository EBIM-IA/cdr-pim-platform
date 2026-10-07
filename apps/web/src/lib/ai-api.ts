import {
  type AiCommercialProposalRequest,
  type AiCommercialProposalResponse,
  type AiExtractionCandidatesRequest,
  type AiExtractionCandidatesResponse,
  aiCommercialProposalRequestSchema,
  aiCommercialProposalResponseSchema,
  aiExtractionCandidatesRequestSchema,
  aiExtractionCandidatesResponseSchema,
  uuidSchema,
} from '@cdr/contracts';
import type { z } from 'zod';

import { authenticatedBffFetch } from '@/lib/bff-client';

export class AiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AiApiError';
  }
}

async function request<T>(
  path: string,
  input: unknown,
  inputSchema:
    typeof aiCommercialProposalRequestSchema | typeof aiExtractionCandidatesRequestSchema,
  outputSchema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new AiApiError('Los parámetros de IA no son válidos.', 400);
  }

  const response = await authenticatedBffFetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(parsedInput.data),
    cache: 'no-store',
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `La operación de IA respondió con estado ${response.status}.`;
    throw new AiApiError(message, response.status);
  }

  const parsedOutput = outputSchema.safeParse(body);
  if (!parsedOutput.success) {
    throw new AiApiError('La respuesta de IA no coincide con el contrato.', 502);
  }
  return parsedOutput.data;
}

function validatedId(value: string, label: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new AiApiError(`${label} no es válido.`, 400);
  return parsed.data;
}

export async function generateCommercialProposal(
  productId: string,
  input: Partial<AiCommercialProposalRequest> = {},
  signal?: AbortSignal,
): Promise<AiCommercialProposalResponse> {
  const id = validatedId(productId, 'El producto indicado');
  return request(
    `/api/operations/ai/products/${encodeURIComponent(id)}/commercial-proposal`,
    input,
    aiCommercialProposalRequestSchema,
    aiCommercialProposalResponseSchema,
    signal,
  );
}

export async function extractAssetCandidates(
  assetId: string,
  input: Partial<AiExtractionCandidatesRequest> = {},
  signal?: AbortSignal,
): Promise<AiExtractionCandidatesResponse> {
  const id = validatedId(assetId, 'El documento indicado');
  return request(
    `/api/operations/ai/assets/${encodeURIComponent(id)}/extraction-candidates`,
    input,
    aiExtractionCandidatesRequestSchema,
    aiExtractionCandidatesResponseSchema,
    signal,
  );
}
