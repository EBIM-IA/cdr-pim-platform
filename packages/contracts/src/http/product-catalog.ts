import { z } from 'zod';

import { uuidSchema } from './common';

export const PRODUCT_CATALOG_MAX_BYTES = 50 * 1024 * 1024;
export const PRODUCT_CATALOG_SHARE_TERMS = ['1d', '3d', '7d', '1m', '3m', '6m', 'never'] as const;
export const productCatalogShareTermSchema = z.enum(PRODUCT_CATALOG_SHARE_TERMS);
export type ProductCatalogShareTerm = z.infer<typeof productCatalogShareTermSchema>;

export const productCatalogDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number(value.slice(0, 4)) >= 1 &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Indica una fecha válida.');

const metadataShape = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  validFrom: productCatalogDateSchema,
  validUntil: z.preprocess(
    (value) => (value === '' ? null : value),
    productCatalogDateSchema.nullable(),
  ),
};
const validRange = (value: { validFrom: string; validUntil: string | null }) =>
  !value.validUntil || value.validUntil >= value.validFrom;
export const productCatalogCreateSchema = z.object(metadataShape).refine(validRange, {
  message: 'La fecha de fin no puede ser anterior a la de inicio.',
  path: ['validUntil'],
});
export type ProductCatalogCreateInput = z.infer<typeof productCatalogCreateSchema>;
export const productCatalogUpdateSchema = z
  .object({ ...metadataShape, expectedUpdatedAt: z.string().datetime() })
  .refine(validRange, {
    message: 'La fecha de fin no puede ser anterior a la de inicio.',
    path: ['validUntil'],
  });
export type ProductCatalogUpdateInput = z.infer<typeof productCatalogUpdateSchema>;
export const productCatalogVersionSchema = z.object({ expectedUpdatedAt: z.string().datetime() });
export type ProductCatalogVersionInput = z.infer<typeof productCatalogVersionSchema>;
export const productCatalogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  q: z.string().trim().max(300).optional(),
  includeDeleted: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    z.boolean().default(false),
  ),
});
export type ProductCatalogListQuery = z.infer<typeof productCatalogListQuerySchema>;

export const productCatalogStatusSchema = z.enum([
  'Vigente',
  'Por vencer',
  'Programado',
  'Vencido',
  'Eliminado',
]);
export const productCatalogSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1),
  title: z.string(),
  description: z.string(),
  validFrom: productCatalogDateSchema,
  validUntil: productCatalogDateSchema.nullable(),
  status: productCatalogStatusSchema,
  fileName: z.string(),
  fileSize: z.number().int().positive().max(PRODUCT_CATALOG_MAX_BYTES),
  activeLinks: z.number().int().nonnegative(),
  totalLinks: z.number().int().nonnegative(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedBy: z.string(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  deletedBy: z.string().nullable(),
});
export type ProductCatalogDto = z.infer<typeof productCatalogSchema>;
export const productCatalogListSchema = z.object({
  items: z.array(productCatalogSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  metrics: z.object({
    catalogs: z.number().int().nonnegative(),
    current: z.number().int().nonnegative(),
    expiring: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    activeLinks: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
  }),
});
export type ProductCatalogListDto = z.infer<typeof productCatalogListSchema>;

export const productCatalogShareSchema = z.object({
  id: uuidSchema,
  term: productCatalogShareTermSchema,
  note: z.string().max(80),
  expiresAt: z.string().datetime().nullable(),
  status: z.enum(['Activo', 'Vencido', 'Revocado', 'Catálogo no vigente']),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revokedBy: z.string().nullable(),
  revokedAt: z.string().datetime().nullable(),
  views: z.number().int().nonnegative(),
  lastViewedAt: z.string().datetime().nullable(),
});
export type ProductCatalogShareDto = z.infer<typeof productCatalogShareSchema>;
export const productCatalogAuditSchema = z.object({
  id: uuidSchema,
  action: z.string(),
  actorId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  changes: z.record(
    z.string(),
    z.object({ before: z.unknown().optional(), after: z.unknown().optional() }),
  ),
});
export const productCatalogDetailSchema = z.object({
  catalog: productCatalogSchema,
  shares: z.array(productCatalogShareSchema),
  audit: z.array(productCatalogAuditSchema),
});
export type ProductCatalogDetailDto = z.infer<typeof productCatalogDetailSchema>;
export const productCatalogShareCreateSchema = z.object({
  term: productCatalogShareTermSchema,
  note: z.string().trim().max(80).default(''),
  expectedUpdatedAt: z.string().datetime(),
});
export type ProductCatalogShareCreateInput = z.infer<typeof productCatalogShareCreateSchema>;
export const productCatalogTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const productCatalogSharedRequestSchema = z
  .object({ token: productCatalogTokenSchema })
  .strict();
export const productCatalogGeneratedShareSchema = z.object({
  share: productCatalogShareSchema,
  token: productCatalogTokenSchema,
});
export type ProductCatalogGeneratedShareDto = z.infer<typeof productCatalogGeneratedShareSchema>;
export const productCatalogSharedViewSchema = z.object({
  title: z.string(),
  description: z.string(),
  fileName: z.string(),
  fileSize: z.number().int().positive().max(PRODUCT_CATALOG_MAX_BYTES),
  validFrom: productCatalogDateSchema,
  validUntil: productCatalogDateSchema.nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type ProductCatalogSharedViewDto = z.infer<typeof productCatalogSharedViewSchema>;
