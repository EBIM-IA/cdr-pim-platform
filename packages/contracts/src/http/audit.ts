import { z } from 'zod';

import { paginatedSchema, paginationQuerySchema, uuidSchema } from './common';

export const auditActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'published',
  'imported',
  'ai_generated',
]);
export type AuditActionDto = z.infer<typeof auditActionSchema>;

export const auditChangeSchema = z.object({
  id: uuidSchema,
  auditEntryId: uuidSchema,
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  sku: z.string().nullable(),
  action: auditActionSchema,
  field: z.string().min(1),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  /** Start of the interval in which `before` was the effective value, when known. */
  previousValueValidFrom: z.string().datetime().nullable(),
  actorId: z.string().nullable(),
  source: z.string().min(1),
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
});
export type AuditChangeDto = z.infer<typeof auditChangeSchema>;

export const auditChangeListSchema = paginatedSchema(auditChangeSchema);
export type AuditChangeListDto = z.infer<typeof auditChangeListSchema>;

const optionalFilter = (max: number) => z.string().trim().min(1).max(max).optional();

export const auditChangeListQuerySchema = paginationQuerySchema
  .extend({
    sku: optionalFilter(64),
    resourceType: optionalFilter(120),
    resourceId: optionalFilter(200),
    field: optionalFilter(200),
    source: optionalFilter(200),
    actorId: optionalFilter(120),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
    path: ['to'],
    message: 'must be greater than or equal to from',
  });
export type AuditChangeListQuery = z.infer<typeof auditChangeListQuerySchema>;
