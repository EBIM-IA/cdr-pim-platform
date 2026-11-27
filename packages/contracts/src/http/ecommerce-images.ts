import { z } from 'zod';

import { uuidSchema } from './common';

export const ECOMMERCE_IMAGE_LOOKUP_LIMIT = 100;

export const ecommerceImageModeSchema = z.enum(['resolved', 'own']);
export type EcommerceImageMode = z.infer<typeof ecommerceImageModeSchema>;

const skuSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((sku) => sku.trim().length > 0);
const remoteAssetIdSchema = z.string().min(1).max(180);
const checksumSha256Schema = z.string().regex(/^[a-f\d]{64}$/i);
const filenameSchema = z.string().min(1).max(260);

export const ecommerceImageStatusSchema = z.object({ configured: z.boolean() });
export type EcommerceImageStatusDto = z.infer<typeof ecommerceImageStatusSchema>;

const ecommerceImageTargetSchema = z
  .object({ productId: uuidSchema, ecommerceSku: skuSchema.optional() })
  .strict();
export type EcommerceImageTarget = z.infer<typeof ecommerceImageTargetSchema>;

export const ecommerceImageLookupRequestSchema = z
  .object({
    targets: z
      .array(ecommerceImageTargetSchema)
      .min(1)
      .max(ECOMMERCE_IMAGE_LOOKUP_LIMIT)
      .refine(
        (targets) => new Set(targets.map(({ productId }) => productId)).size === targets.length,
      ),
    mode: ecommerceImageModeSchema.default('resolved'),
  })
  .strict();
export type EcommerceImageLookupRequest = z.infer<typeof ecommerceImageLookupRequestSchema>;

const ecommerceImageSchema = z.object({
  assetId: remoteAssetIdSchema,
  position: z.number().int().nonnegative(),
  cover: z.boolean(),
  filename: filenameSchema,
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  checksumSha256: checksumSha256Schema,
  canImport: z.boolean(),
});
export type EcommerceImageDto = z.infer<typeof ecommerceImageSchema>;

const ecommerceImageErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(1_000),
  correlationId: z.string().min(1).max(128).optional(),
});
export type EcommerceImageErrorDto = z.infer<typeof ecommerceImageErrorSchema>;

const ecommerceImageIdentity = {
  productId: uuidSchema,
  pimSku: skuSchema.nullable(),
  ecommerceSku: skuSchema.nullable(),
};

const ecommerceImageLookupItemSchema = z.discriminatedUnion('status', [
  z.object({
    ...ecommerceImageIdentity,
    status: z.literal('found'),
    images: z.array(ecommerceImageSchema),
  }),
  z.object({
    ...ecommerceImageIdentity,
    status: z.literal('error'),
    error: ecommerceImageErrorSchema,
  }),
]);
export type EcommerceImageLookupItemDto = z.infer<typeof ecommerceImageLookupItemSchema>;

export const ecommerceImageLookupResponseSchema = z.object({
  items: z.array(ecommerceImageLookupItemSchema).max(ECOMMERCE_IMAGE_LOOKUP_LIMIT),
});
export type EcommerceImageLookupResponseDto = z.infer<typeof ecommerceImageLookupResponseSchema>;

export const ecommerceImageImportRequestSchema = z
  .object({
    target: ecommerceImageTargetSchema,
    mode: ecommerceImageModeSchema.default('resolved'),
    assets: z
      .array(
        z.object({ assetId: remoteAssetIdSchema, checksumSha256: checksumSha256Schema }).strict(),
      )
      .length(1),
  })
  .strict();
export type EcommerceImageImportRequest = z.infer<typeof ecommerceImageImportRequestSchema>;

const ecommerceImageImportItemSchema = z.discriminatedUnion('status', [
  z.object({
    assetId: remoteAssetIdSchema,
    filename: filenameSchema,
    status: z.enum(['imported', 'existing']),
    productAssetId: uuidSchema,
  }),
  z.object({
    assetId: remoteAssetIdSchema,
    filename: filenameSchema.nullable(),
    status: z.literal('error'),
    error: ecommerceImageErrorSchema,
  }),
]);
export type EcommerceImageImportItemDto = z.infer<typeof ecommerceImageImportItemSchema>;

export const ecommerceImageImportResponseSchema = z.object({
  ...ecommerceImageIdentity,
  items: z.array(ecommerceImageImportItemSchema).length(1),
});
export type EcommerceImageImportResponseDto = z.infer<typeof ecommerceImageImportResponseSchema>;

export const ecommerceImageHistorySchema = z.object({
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        pimSku: skuSchema,
        ecommerceSku: skuSchema,
        assetId: uuidSchema,
        filename: filenameSchema,
        importedAt: z.iso.datetime(),
        active: z.boolean(),
      }),
    )
    .max(100),
});
export type EcommerceImageHistoryDto = z.infer<typeof ecommerceImageHistorySchema>;
