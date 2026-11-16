import { z } from 'zod';
import { authCapabilitySchema } from './auth';

export const moduleCapabilitySchema = authCapabilitySchema.refine(
  (value) => value.startsWith('menu:'),
  'Debe ser un módulo del menú',
);
export const modulePolicySchema = z.object({
  role: z.enum(['ADMINISTRADOR', 'COMPRAS', 'VENTAS']),
  capability: moduleCapabilitySchema,
  visible: z.boolean(),
});
export type ModulePolicy = z.infer<typeof modulePolicySchema>;
export const modulePoliciesSchema = z.object({ policies: z.array(modulePolicySchema).max(60) });
