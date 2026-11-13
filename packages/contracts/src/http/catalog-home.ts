import { z } from 'zod';
const image = z
  .string()
  .max(700_000)
  .regex(
    /^(?:data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}|\/home\/(?:marcas|categorias)\/[a-z0-9-]+\.(?:png|jpg|svg))$/,
  )
  .nullable();
const validText = (value: string) => !value.includes('\u0000') && !/[\uD800-\uDFFF]/u.test(value);
const entry = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(validText, 'El texto debe ser Unicode válido sin NUL.'),
    visible: z.boolean(),
    image: image,
    text: z.string().trim().max(90).refine(validText, 'El texto debe ser Unicode válido sin NUL.'),
  })
  .strict();
export const catalogHomeConfigSchema = z
  .object({ brands: z.array(entry).max(250), categories: z.array(entry).max(250) })
  .strict()
  .superRefine((config, ctx) => {
    if (JSON.stringify(config).length > 3_500_000)
      ctx.addIssue({
        code: 'custom',
        message:
          'Las imágenes del Inicio superan el tamaño permitido. Reduce su tamaño antes de guardar.',
      });
    for (const kind of ['brands', 'categories'] as const)
      if (
        new Set(config[kind].map((entry) => entry.key.toLocaleUpperCase('es'))).size !==
        config[kind].length
      )
        ctx.addIssue({
          code: 'custom',
          message: 'No se permiten entradas repetidas',
          path: [kind],
        });
  });
export const catalogHomeSettingsSchema = z
  .object({ config: catalogHomeConfigSchema, version: z.number().int().min(0) })
  .strict();
export type CatalogHomeConfig = z.infer<typeof catalogHomeConfigSchema>;
export type CatalogHomeSettingsDto = z.infer<typeof catalogHomeSettingsSchema>;
