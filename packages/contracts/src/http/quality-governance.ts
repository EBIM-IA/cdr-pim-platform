import { z } from 'zod';
import { uuidSchema } from './common';

const value = z.union([z.string().max(20_000), z.number().finite(), z.boolean(), z.null()]);
export const qualityCandidateSchema = z.object({
  source: z.enum(['fabricante', 'archivo', 'tecdoc', 'manual', 'ai']),
  value,
  evidence: z.string().max(2000),
  confidence: z.number().min(0).max(1).nullable(),
});
export const qualityReviewSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['attribute', 'commercial', 'duplicate']),
  productId: uuidSchema,
  sku: z.string(),
  attributeKey: z.string().nullable(),
  currentValue: value,
  attributeVersion: z.number().int().nonnegative(),
  candidates: z.array(qualityCandidateSchema).max(200),
  proposedIndex: z.number().int().nonnegative().nullable(),
  chosenIndex: z.number().int().nonnegative().nullable(),
  chosenValue: value,
  override: z.boolean(),
  assetId: uuidSchema.nullable(),
  model: z.string().nullable(),
  channel: z.enum(['b2c', 'b2b']).nullable(),
  productB: z
    .object({ id: uuidSchema, sku: z.string(), name: z.string(), brand: z.string().nullable() })
    .nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'changes_requested']),
  duplicateDecision: z.enum(['equivalent', 'distinct', 'escalate']).nullable(),
  reason: z.string().max(2000).nullable(),
  requestedBy: z.string(),
  decidedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive(),
});
export type QualityReviewDto = z.infer<typeof qualityReviewSchema>;
export const qualityReviewListSchema = z.object({
  items: z.array(qualityReviewSchema),
  total: z.number().int().nonnegative(),
});
export const qualityReviewQuerySchema = z.object({
  kind: z.enum(['attribute', 'commercial', 'duplicate']).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'changes_requested']).optional(),
  productId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type QualityReviewQuery = z.infer<typeof qualityReviewQuerySchema>;
export const qualityDecisionSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(['approve', 'reject', 'request_changes']),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((text) => !text.includes('\u0000')),
    chosenIndex: z.number().int().nonnegative().optional(),
    value: value.optional(),
    duplicateDecision: z.enum(['equivalent', 'distinct', 'escalate']).optional(),
  })
  .strict();
export type QualityDecisionInput = z.infer<typeof qualityDecisionSchema>;
export const qualityConflictSchema = z
  .object({
    productId: uuidSchema,
    attributeKey: z.string().trim().min(1).max(120),
    candidates: z.array(qualityCandidateSchema).min(2).max(20),
  })
  .strict();
export type QualityConflictInput = z.infer<typeof qualityConflictSchema>;
export const qualityDetectResultSchema = z.object({
  created: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
});
export const qualitySourcePrioritySchema = z
  .object({
    categoryId: uuidSchema,
    expectedUpdatedAt: z.iso.datetime(),
    priority: z
      .object({
        fabricante: z.number().int().min(1).max(4).optional(),
        archivo: z.number().int().min(1).max(4).optional(),
        tecdoc: z.number().int().min(1).max(4).optional(),
        manual: z.number().int().min(1).max(4).optional(),
      })
      .strict()
      .refine((priority) => {
        const ranks = Object.values(priority);
        return ranks.length > 0 && new Set(ranks).size === ranks.length;
      }, 'Las fuentes necesitan prioridades distintas.'),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type QualitySourcePriorityInput = z.infer<typeof qualitySourcePrioritySchema>;
export const qualityCompletenessSchema = z.array(
  z.object({
    kind: z.enum(['template', 'line']),
    key: z.string(),
    label: z.string(),
    categoryId: uuidSchema.nullable(),
    productCount: z.number().int().nonnegative(),
    average: z.number().int().min(0).max(100),
  }),
);
export type QualityCompletenessDto = z.infer<typeof qualityCompletenessSchema>;
export const qualityProductChangesSchema = z.object({
  items: z.array(
    z.object({
      productId: uuidSchema,
      sku: z.string(),
      name: z.string(),
      status: z.literal('in_review'),
      updatedAt: z.iso.datetime(),
      origin: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type QualityProductChangesDto = z.infer<typeof qualityProductChangesSchema>;
