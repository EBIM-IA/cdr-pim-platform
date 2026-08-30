import { z } from 'zod';

export const healthStatusSchema = z.enum(['up', 'down']);

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number(),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/**
 * Readiness is what the ALB target group and ECS use to decide whether to route traffic.
 * It MUST check the dependencies the service cannot work without — today: PostgreSQL.
 */
export const readinessResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.array(
    z.object({
      name: z.string(),
      status: healthStatusSchema,
      latencyMs: z.number().optional(),
      detail: z.string().optional(),
    }),
  ),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
