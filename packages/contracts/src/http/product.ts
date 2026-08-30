import { z } from 'zod';

import { paginatedSchema, uuidSchema } from './common';

/**
 * Lifecycle of a product record inside the PIM. Deliberately about *information*
 * completeness, not about ERP stock or commercial availability — those stay in AX.
 */
export const productStatusSchema = z.enum(['draft', 'in_review', 'published', 'archived']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productIdentifierTypeSchema = z.enum([
  'sku',
  'erp_item_id',
  'manufacturer_part_number',
  'ean',
  'upc',
  'internal_legacy',
]);
export type ProductIdentifierType = z.infer<typeof productIdentifierTypeSchema>;

export const productIdentifierSchema = z.object({
  type: productIdentifierTypeSchema,
  value: z.string().min(1).max(120),
});

/** Read model returned by `GET /api/v1/products/:id`. */
export const productSchema = z.object({
  id: uuidSchema,
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().nullable(),
  brand: z.string().nullable(),
  status: productStatusSchema,
  identifiers: z.array(productIdentifierSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductDto = z.infer<typeof productSchema>;

export const productListSchema = paginatedSchema(productSchema);
export type ProductListDto = z.infer<typeof productListSchema>;

export const createProductSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().max(20_000).optional(),
  brand: z.string().max(120).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;
