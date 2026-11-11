import { z } from 'zod';
const termSchema = z.object({
  query: z.string(),
  count: z.number().int().nonnegative(),
  withoutResults: z.number().int().nonnegative(),
  lastAt: z.string().datetime(),
});
export const searchReportSchema = z.object({
  total: z.number().int().nonnegative(),
  withResults: z.number().int().nonnegative(),
  withoutResults: z.number().int().nonnegative(),
  semantic: z.number().int().nonnegative(),
  terms: z.array(termSchema),
  unsuccessfulTerms: z.array(termSchema),
});
export type SearchReportDto = z.infer<typeof searchReportSchema>;
