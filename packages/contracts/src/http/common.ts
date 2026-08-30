import { z } from 'zod';

/** Current — and only — API version. Breaking changes get `/api/v2`. */
export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;

export const uuidSchema = z.string().uuid();

/**
 * Canonical error envelope. Every non-2xx response from `apps/api` has this exact shape,
 * produced by a single Nest exception filter. The web client depends on it.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    correlationId: z.string(),
    timestamp: z.string().datetime(),
    path: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Cursor-less offset pagination: adequate for 45k SKU, revisit if that changes. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
