import { z } from 'zod';

import { uuidSchema } from './common';

export const codeAffixKindSchema = z.enum(['prefix', 'series', 'suffix', 'pattern']);
export type CodeAffixKind = z.infer<typeof codeAffixKindSchema>;

export const codeAffixSourceSchema = z.enum([
  'manual',
  'manufacturer',
  'standard',
  'import',
  'ai_suggestion',
]);
export type CodeAffixSource = z.infer<typeof codeAffixSourceSchema>;

export const codeAffixStatusSchema = z.enum([
  'draft',
  'pending_validation',
  'validated',
  'rejected',
]);
export type CodeAffixStatus = z.infer<typeof codeAffixStatusSchema>;

export const codeAffixBoreRuleSchema = z.enum(['none', 'iso_15']);
export type CodeAffixBoreRule = z.infer<typeof codeAffixBoreRuleSchema>;

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const codeAffixSchema = z.object({
  id: uuidSchema,
  kind: codeAffixKindSchema,
  token: z.string().min(1).max(200),
  meaning: z.string().min(1).max(1_000),
  attribute: z.string().min(1).max(200).nullable(),
  impliedValue: z.string().min(1).max(500).nullable(),
  brand: z.string().min(1).max(120).nullable(),
  family: z.string().min(1).max(120).nullable(),
  source: codeAffixSourceSchema,
  confidence: z.number().min(0).max(1).multipleOf(0.001).nullable(),
  status: codeAffixStatusSchema,
  evidence: z.string().min(1).max(2_000).nullable(),
  boreRule: codeAffixBoreRuleSchema,
  priority: z.number().int().min(0).max(1_000),
  active: z.boolean(),
  createdBy: z.string().min(1),
  validatedBy: z.string().min(1).nullable(),
  validatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CodeAffixDto = z.infer<typeof codeAffixSchema>;

export const codeAffixListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  kind: codeAffixKindSchema.optional(),
  status: codeAffixStatusSchema.optional(),
  source: codeAffixSourceSchema.optional(),
  includeInactive: z
    .preprocess((value) => value === true || value === 'true', z.boolean())
    .default(false),
});
export type CodeAffixListQuery = z.infer<typeof codeAffixListQuerySchema>;

const editableCodeAffixFields = z.object({
  kind: codeAffixKindSchema,
  token: z.string().trim().min(1).max(200),
  meaning: z.string().trim().min(1).max(1_000),
  attribute: nullableText(200).optional(),
  impliedValue: nullableText(500).optional(),
  brand: nullableText(120).optional(),
  family: nullableText(120).optional(),
  source: codeAffixSourceSchema,
  confidence: z.number().min(0).max(1).multipleOf(0.001).nullable().optional(),
  evidence: nullableText(2_000).optional(),
  boreRule: codeAffixBoreRuleSchema.default('none'),
  priority: z.number().int().min(0).max(1_000).default(0),
});

export const createCodeAffixSchema = editableCodeAffixFields;
export type CreateCodeAffixInput = z.infer<typeof createCodeAffixSchema>;

export const updateCodeAffixSchema = editableCodeAffixFields
  .partial()
  .extend({ expectedUpdatedAt: z.string().datetime() })
  .refine(
    (value) =>
      Object.keys(value).some(
        (key) => key !== 'expectedUpdatedAt' && value[key as keyof typeof value] !== undefined,
      ),
    { message: 'At least one code-affix field must be changed' },
  );
export type UpdateCodeAffixInput = z.infer<typeof updateCodeAffixSchema>;

export const validateCodeAffixSchema = z.object({
  decision: z.enum(['validated', 'rejected']),
  expectedUpdatedAt: z.string().datetime(),
});
export type ValidateCodeAffixInput = z.infer<typeof validateCodeAffixSchema>;

export const parseProductCodeSchema = z.object({
  code: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(120).optional(),
  family: z.string().trim().min(1).max(120).optional(),
});
export type ParseProductCodeInput = z.infer<typeof parseProductCodeSchema>;

export const parsedCodeSegmentSchema = z.object({
  kind: z.enum(['prefix', 'series', 'suffix', 'pattern', 'dimension', 'bore', 'number', 'unknown']),
  text: z.string(),
  ruleId: uuidSchema.nullable(),
  meaning: z.string().nullable(),
  attribute: z.string().nullable(),
  impliedValue: z.string().nullable(),
  source: codeAffixSourceSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string().nullable(),
  boreMillimeters: z.number().positive().nullable(),
});
export type ParsedCodeSegmentDto = z.infer<typeof parsedCodeSegmentSchema>;

export const parsedProductCodeSchema = z.object({
  code: z.string(),
  normalizedCode: z.string(),
  segments: z.array(parsedCodeSegmentSchema),
});
export type ParsedProductCodeDto = z.infer<typeof parsedProductCodeSchema>;
