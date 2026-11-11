import { z } from 'zod';
import { uuidSchema } from './common';
export const unifiedCodeRequestActionSchema = z.enum(['remove', 'move', 'correct']);
const requestFields = z.object({
  action: unifiedCodeRequestActionSchema,
  proposedCode: z.string().trim().min(1).max(100).nullable().default(null),
  reason: z.string().trim().min(1).max(4000),
});
function validateTarget(
  value: { action: string; proposedCode: string | null },
  context: z.RefinementCtx,
) {
  if (value.action !== 'remove' && !value.proposedCode)
    context.addIssue({
      code: 'custom',
      message: 'Indica el código unificador propuesto',
      path: ['proposedCode'],
    });
}
export const createUnifiedCodeRequestSchema = requestFields
  .extend({
    sku: z.string().trim().min(1).max(100),
    currentCode: z.string().trim().min(1).max(100).nullable(),
  })
  .superRefine(validateTarget);
export type CreateUnifiedCodeRequestInput = z.infer<typeof createUnifiedCodeRequestSchema>;
export const updateUnifiedCodeRequestSchema = requestFields
  .extend({ expectedVersion: z.number().int().positive() })
  .superRefine(validateTarget);
export type UpdateUnifiedCodeRequestInput = z.infer<typeof updateUnifiedCodeRequestSchema>;
export const unifiedCodeRequestSchema = requestFields.extend({
  id: uuidSchema,
  productId: uuidSchema,
  sku: z.string(),
  currentCode: z.string().nullable(),
  status: z.literal('pending_dispatch'),
  requestedBy: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UnifiedCodeRequestDto = z.infer<typeof unifiedCodeRequestSchema>;
