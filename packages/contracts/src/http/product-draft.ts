import { z } from 'zod';

import { uuidSchema } from './common';

export const productDraftEntrySchema = z.object({
  attributeKey: z.string().min(1).max(120),
  draft: z
    .string()
    .max(20_000)
    .refine(
      (value) => !value.includes('\u0000') && !/[\uD800-\uDFFF]/u.test(value),
      'Unicode no válido',
    ),
  expectedVersion: z.number().int().min(0),
});

export const saveProductDraftSchema = z
  .object({
    templateId: uuidSchema,
    expectedVersion: z.number().int().min(0),
    entries: z.array(productDraftEntrySchema).max(200),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.entries.map((entry) => entry.attributeKey)).size === input.entries.length,
    {
      message: 'Each draft attribute must be unique',
    },
  );
export type SaveProductDraftInput = z.infer<typeof saveProductDraftSchema>;

export const productDraftSchema = z.object({
  productId: uuidSchema,
  templateId: uuidSchema,
  version: z.number().int().min(0),
  entries: z.array(productDraftEntrySchema),
  updatedAt: z.string().datetime().nullable(),
});
export type ProductDraftDto = z.infer<typeof productDraftSchema>;
