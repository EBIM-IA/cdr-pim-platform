import {
  qualityProductChangesSchema,
  qualityCompletenessSchema,
  qualitySourcePrioritySchema,
  type QualitySourcePriorityInput,
  qualityReviewListSchema,
  qualityReviewSchema,
  qualityDecisionSchema,
  qualityDetectResultSchema,
  qualityConflictSchema,
  type QualityDecisionInput,
  type QualityConflictInput,
  type QualityReviewQuery,
} from '@cdr/contracts';
import { z } from 'zod';
import { authenticatedBffFetch } from '@/lib/bff-client';
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  input?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await authenticatedBffFetch(`/api/operations/quality${path}`, {
    method: input === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    signal,
    headers: {
      accept: 'application/json',
      ...(input === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'No fue posible completar la revisión.',
    );
  return schema.parse(body);
}
export function listQualityReviews(query: Partial<QualityReviewQuery> = {}, signal?: AbortSignal) {
  const params = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  return request(`/reviews?${params}`, qualityReviewListSchema, undefined, signal);
}
export function decideQualityReview(id: string, input: QualityDecisionInput) {
  return request(
    `/reviews/${encodeURIComponent(id)}/decision`,
    qualityReviewSchema,
    qualityDecisionSchema.parse(input),
  );
}
export function detectQualityDuplicates() {
  return request('/duplicates/detect', qualityDetectResultSchema, {});
}
export function createQualityConflict(input: QualityConflictInput) {
  return request('/conflicts', qualityReviewSchema, qualityConflictSchema.parse(input));
}

export function updateQualitySourcePriority(input: QualitySourcePriorityInput) {
  return request(
    '/source-priority',
    z.object({ updated: z.literal(true) }),
    qualitySourcePrioritySchema.parse(input),
  );
}

export function getQualityCompleteness(signal?: AbortSignal) {
  return request('/completeness', qualityCompletenessSchema, undefined, signal);
}

export function listQualityProductChanges(page = 1, signal?: AbortSignal) {
  return request(
    `/product-changes?page=${page}&pageSize=20`,
    qualityProductChangesSchema,
    undefined,
    signal,
  );
}
