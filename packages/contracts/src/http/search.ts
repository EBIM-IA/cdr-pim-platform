import { z } from 'zod';

import { uuidSchema } from './common';

export const semanticSearchQuerySchema = z.object({
  q: z.string().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SemanticSearchQuery = z.infer<typeof semanticSearchQuerySchema>;

export const semanticSearchHitSchema = z.object({
  productId: uuidSchema,
  sku: z.string(),
  name: z.string(),
  /** Cosine similarity in [0,1]; 1 means identical direction. */
  score: z.number().min(0).max(1),
});

export const semanticSearchResponseSchema = z.object({
  query: z.string(),
  model: z.string(),
  dimensions: z.number().int(),
  hits: z.array(semanticSearchHitSchema),
});
export type SemanticSearchResponse = z.infer<typeof semanticSearchResponseSchema>;
