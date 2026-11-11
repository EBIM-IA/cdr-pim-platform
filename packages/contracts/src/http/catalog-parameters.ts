import { z } from 'zod';
import { uuidSchema } from './common';
export const catalogParameterKindSchema = z.enum([
  'unit',
  'material',
  'seal',
  'identifier',
  'brand',
  'application',
  'synonym',
]);
export const catalogParameterSchema = z.object({
  id: uuidSchema,
  kind: catalogParameterKindSchema,
  value: z.string(),
  description: z.string(),
  target: z.string().nullable(),
  logoDataUrl: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type CatalogParameterDto = z.infer<typeof catalogParameterSchema>;
export const catalogParameterQuerySchema = z.object({ kind: catalogParameterKindSchema });
export const saveCatalogParameterSchema = z
  .object({
    id: uuidSchema.optional(),
    kind: catalogParameterKindSchema,
    value: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(''),
    target: z.string().trim().min(1).max(200).nullable().default(null),
    logoDataUrl: z
      .string()
      .max(700_000)
      .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
      .nullable()
      .default(null),
    active: z.boolean().default(true),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((input, context) => {
    if ((input.id && input.expectedVersion === 0) || (!input.id && input.expectedVersion > 0))
      context.addIssue({ code: 'custom', message: 'La versión y el identificador no coinciden' });
    if (input.kind === 'synonym' && !input.target)
      context.addIssue({
        code: 'custom',
        message: 'Indica el término de destino del sinónimo',
        path: ['target'],
      });
    if (input.kind !== 'synonym' && input.target)
      context.addIssue({ code: 'custom', message: 'Solo los sinónimos tienen término de destino' });
    if (input.kind !== 'brand' && input.logoDataUrl)
      context.addIssue({ code: 'custom', message: 'Solo las marcas tienen logo' });
  });
export type SaveCatalogParameterInput = z.infer<typeof saveCatalogParameterSchema>;
