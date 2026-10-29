import { z } from 'zod';

import { uuidSchema } from './common';

const productNameAffixSchema = z
  .string()
  .max(100)
  .refine(
    // PostgreSQL jsonb cannot store NUL or unpaired UTF-16 surrogates. Valid surrogate pairs
    // are whole Unicode code points under /u and remain supported (for example emoji).
    (value) => !value.includes('\u0000') && !/[\uD800-\uDFFF]/u.test(value),
    'El texto debe ser Unicode válido y no puede contener NUL.',
  );

export const productNameTokenSchema = z
  .object({
    field: z
      .string()
      .max(180)
      .regex(
        /^(?:category:(?:name|n1|n2|n3)|template:name|erp:[a-zA-Z0-9_]+|attribute:[a-zA-Z0-9_]+|application:(?:make|model|bodyStyle|fuel|traction|displacement|yearFrom|yearTo|area|subarea|engine))$/u,
      ),
    before: productNameAffixSchema.default(''),
    after: productNameAffixSchema.default(''),
    format: z.enum(['auto', 'original', 'lower', 'title', 'upper']).default('auto'),
  })
  .strict();
export const productNameConfigSchema = z
  .object({
    enabled: z.boolean(),
    mixedMode: z.enum(['applications', 'automotive', 'industrial']),
    maxApplications: z.number().int().min(1).max(10),
    moreApplications: z.boolean(),
    automotive: z.array(productNameTokenSchema).min(1).max(40),
    industrial: z.array(productNameTokenSchema).min(1).max(40),
  })
  .strict();
export type ProductNameToken = z.infer<typeof productNameTokenSchema>;
export type ProductNameConfig = z.infer<typeof productNameConfigSchema>;
export const productNameSettingsSchema = z.object({
  config: productNameConfigSchema,
  version: z.number().int().min(0),
});
export const updateProductNameSettingsSchema = productNameSettingsSchema.strict();
export type ProductNameSettingsDto = z.infer<typeof productNameSettingsSchema>;

export const salesApplicationSchema = z.object({
  id: uuidSchema,
  marcaVehiculo: z.string(),
  modelo: z.string(),
  tipo: z.string(),
  combustible: z.string(),
  traccion: z.string(),
  cilindraje: z.string(),
  anioDesde: z.number().nullable(),
  anioHasta: z.number().nullable(),
  area: z.string(),
  subarea: z.string(),
  motor: z.string(),
});
export const productSalesVariantSchema = z.object({
  productId: uuidSchema,
  codigoArticulo: z.string(),
  nombreAmigable: z.string(),
  tipo: z.enum(['automotriz', 'industrial']),
  marca: z.string(),
  codigoProveedor: z.string(),
  codigoUnificador: z.string(),
  aplicacion: salesApplicationSchema.nullable(),
  ficha: z.string().startsWith('/products/'),
});
export type ProductSalesVariantDto = z.infer<typeof productSalesVariantSchema>;
export const productExperienceSchema = z.object({
  nombreGeneral: z.string(),
  variants: z.array(productSalesVariantSchema),
  fields: z.array(z.object({ field: z.string(), label: z.string(), group: z.string() })),
});
export type ProductExperienceDto = z.infer<typeof productExperienceSchema>;
export const productVariantSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(300),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
export type ProductVariantSearchQuery = z.infer<typeof productVariantSearchQuerySchema>;
export const productVariantSearchSchema = z.object({
  items: z.array(productSalesVariantSchema),
  totalProducts: z.number().int().min(0),
  categories: z.array(z.object({ id: uuidSchema, name: z.string() })),
  brands: z.array(z.string()),
  truncated: z.boolean(),
});
export type ProductVariantSearchDto = z.infer<typeof productVariantSearchSchema>;
export const previewProductNameSchema = z
  .object({
    productId: uuidSchema,
    config: productNameConfigSchema,
  })
  .strict();
export type PreviewProductNameInput = z.infer<typeof previewProductNameSchema>;
