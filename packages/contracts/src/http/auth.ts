import { z } from 'zod';

/** Roles currently understood by both the API and the web application. */
export const authRoleSchema = z.enum(['ADMIN', 'EDITOR', 'VIEWER']);
export type AuthRole = z.infer<typeof authRoleSchema>;

export const authenticatedActorSchema = z.object({
  id: z.string().min(1).max(120),
  email: z.string().email(),
  roles: z.array(authRoleSchema).min(1),
});
export type AuthenticatedActorDto = z.infer<typeof authenticatedActorSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1_024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  actor: authenticatedActorSchema,
  accessToken: z.string().min(1),
  /** Same duration notation accepted by the API configuration, for example `15m`. */
  expiresIn: z.string().regex(/^\d+(ms|s|m|h|d|w|y)$/),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const authMeResponseSchema = z.object({
  actor: authenticatedActorSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
