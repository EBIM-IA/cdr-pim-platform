import { z } from 'zod';
import { uuidSchema } from './common';
export const ecommerceTextSchema = z
  .object({
    titulo: z.string().trim().min(1).max(140),
    descripcion: z.string().trim().min(1).max(900),
  })
  .strict();
export const ecommerceVariantSchema = z
  .object({
    type: z.enum(['automotriz', 'industrial']),
    applicationId: uuidSchema.nullable().default(null),
  })
  .strict();
export const ecommerceMutationSchema = ecommerceVariantSchema
  .extend({
    version: z.number().int().nonnegative(),
    action: z.enum(['generate', 'approve', 'edit']),
    text: ecommerceTextSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'automotriz' && !value.applicationId)
      ctx.addIssue({
        code: 'custom',
        message: 'Selecciona una aplicación.',
        path: ['applicationId'],
      });
    if (value.type === 'industrial' && value.applicationId)
      ctx.addIssue({
        code: 'custom',
        message: 'La variante industrial no tiene aplicación.',
        path: ['applicationId'],
      });
    if (value.action !== 'edit' && value.text)
      ctx.addIssue({
        code: 'custom',
        message: 'Usa la acción de edición para cambiar el texto.',
        path: ['text'],
      });
    if (value.action === 'edit' && !value.text)
      ctx.addIssue({
        code: 'custom',
        message: 'Indica el título y la descripción.',
        path: ['text'],
      });
  });
export const ecommerceDescriptionSchema = ecommerceTextSchema.extend({
  productId: uuidSchema,
  variantKey: z.string(),
  status: z.enum(['pending', 'approved']),
  origin: z.enum(['ai', 'edited']),
  model: z.string().nullable(),
  version: z.number().int().positive(),
  stale: z.boolean(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
});
export const ecommerceDescriptionResultSchema = ecommerceDescriptionSchema.nullable();
export type EcommerceDescriptionDto = z.infer<typeof ecommerceDescriptionSchema>;
export type EcommerceMutationInput = z.infer<typeof ecommerceMutationSchema>;
export type EcommerceVariantInput = z.infer<typeof ecommerceVariantSchema>;
