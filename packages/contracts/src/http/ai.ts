import { z } from 'zod';

import { uuidSchema } from './common';

export const AI_EXTRACTION_MAX_CANDIDATES = 200;
export const AI_EXTRACTION_MAX_KEY_CHARS = 120;
export const AI_EXTRACTION_MAX_VALUE_CHARS = 4_000;

export const aiCommercialChannelSchema = z.enum(['b2c', 'b2b']);
export type AiCommercialChannel = z.infer<typeof aiCommercialChannelSchema>;

/**
 * Deliberately exposes bounded business controls instead of an arbitrary prompt. The server
 * owns the instruction that prevents unsupported product claims.
 */
export const aiCommercialProposalRequestSchema = z
  .object({
    channel: aiCommercialChannelSchema.default('b2c'),
    maxOutputTokens: z.coerce.number().int().min(80).max(800).default(320),
  })
  .strict();
export type AiCommercialProposalRequest = z.infer<typeof aiCommercialProposalRequestSchema>;

export const aiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});

export const aiCommercialProposalResponseSchema = z.object({
  productId: uuidSchema,
  sku: z.string().min(1).max(64),
  channel: aiCommercialChannelSchema,
  model: z.string().min(1).max(200),
  proposal: z.string().min(1).max(20_000),
  usage: aiUsageSchema,
  persisted: z.literal(false),
  requiresHumanReview: z.literal(true),
});
export type AiCommercialProposalResponse = z.infer<typeof aiCommercialProposalResponseSchema>;

const expectedAttributeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(AI_EXTRACTION_MAX_KEY_CHARS)
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N}_.:-]*$/u,
    'Attribute keys may contain letters, numbers, dot, underscore, colon and hyphen',
  );

export const aiExtractionCandidatesRequestSchema = z
  .object({
    expectedAttributes: z.array(expectedAttributeKeySchema).max(100).default([]),
  })
  .strict();
export type AiExtractionCandidatesRequest = z.infer<typeof aiExtractionCandidatesRequestSchema>;

export const aiExtractionCandidateSchema = z.object({
  key: z.string().min(1).max(AI_EXTRACTION_MAX_KEY_CHARS),
  value: z.string().min(1).max(AI_EXTRACTION_MAX_VALUE_CHARS),
  confidence: z.number().min(0).max(1),
});

export const aiExtractionCandidatesResponseSchema = z.object({
  assetId: uuidSchema,
  productId: uuidSchema,
  sku: z.string().min(1).max(64),
  filename: z.string().min(1).max(180),
  model: z.string().min(1).max(200),
  candidates: z.array(aiExtractionCandidateSchema).max(AI_EXTRACTION_MAX_CANDIDATES),
  persisted: z.literal(false),
  requiresHumanReview: z.literal(true),
});
export type AiExtractionCandidatesResponse = z.infer<typeof aiExtractionCandidatesResponseSchema>;
