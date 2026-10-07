import { z } from 'zod';

import { uuidSchema } from './common';

/** Limits enforced by both the HTTP boundary and the asset application service. */
export const PRODUCT_ASSET_MAX_BYTES = 20 * 1024 * 1024;
export const PRODUCT_ASSET_ZIP_MAX_BYTES = 100 * 1024 * 1024;
export const PRODUCT_ASSET_ZIP_MAX_FILES = 250;

export const productAssetTypeSchema = z.enum(['FT', 'MSDS', 'CERT', 'PLANO', 'FOTO']);
export type ProductAssetType = z.infer<typeof productAssetTypeSchema>;

export const productAssetKindSchema = z.enum(['image', 'document']);
export type ProductAssetKind = z.infer<typeof productAssetKindSchema>;

export const productAssetSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  sku: z.string().min(1).max(64),
  kind: productAssetKindSchema,
  type: productAssetTypeSchema,
  filename: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive().max(PRODUCT_ASSET_MAX_BYTES),
  checksum: z.string().min(1).max(128),
  position: z.number().int().positive().nullable(),
  source: z.enum(['manual', 'bulk']),
  uploadedBy: z.string().min(1).max(200),
  uploadedAt: z.string().datetime(),
  replacesAssetId: uuidSchema.nullable(),
});
export type ProductAssetDto = z.infer<typeof productAssetSchema>;

export const productAssetListSchema = z.array(productAssetSchema);
export type ProductAssetListDto = z.infer<typeof productAssetListSchema>;

export const productAssetSelectorSchema = z
  .object({
    productId: uuidSchema.optional(),
    sku: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((value, context) => {
    if (Number(Boolean(value.productId)) + Number(Boolean(value.sku)) !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of productId or sku',
        path: ['productId'],
      });
    }
  });
export type ProductAssetSelector = z.infer<typeof productAssetSelectorSchema>;

export const productAssetUploadMetadataSchema = productAssetSelectorSchema.and(
  z.object({ type: productAssetTypeSchema }),
);
export type ProductAssetUploadMetadata = z.infer<typeof productAssetUploadMetadataSchema>;

export const productAssetBulkModeSchema = z.enum(['validate', 'commit']);
export type ProductAssetBulkMode = z.infer<typeof productAssetBulkModeSchema>;

export const productAssetBulkItemSchema = z.object({
  filename: z.string().min(1).max(260),
  sku: z.string().min(1).max(64).nullable(),
  type: productAssetTypeSchema.nullable(),
  status: z.enum(['ready', 'will_replace', 'uploaded', 'replaced', 'error', 'ignored']),
  message: z.string().max(1_000).nullable(),
  asset: productAssetSchema.nullable(),
});
export type ProductAssetBulkItemDto = z.infer<typeof productAssetBulkItemSchema>;

export const productAssetBulkResultSchema = z.object({
  mode: productAssetBulkModeSchema,
  archiveName: z.string().min(1).max(180),
  total: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  affectedSkus: z.number().int().nonnegative(),
  items: z.array(productAssetBulkItemSchema).max(PRODUCT_ASSET_ZIP_MAX_FILES),
});
export type ProductAssetBulkResultDto = z.infer<typeof productAssetBulkResultSchema>;

export const deleteProductAssetResultSchema = z.object({
  id: uuidSchema,
  deleted: z.literal(true),
});
export type DeleteProductAssetResultDto = z.infer<typeof deleteProductAssetResultSchema>;
