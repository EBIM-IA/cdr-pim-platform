import { z } from 'zod';

/**
 * Business roles agreed with Casa del Rulimán.
 *
 * The three legacy values remain accepted while existing local environments and already
 * issued development tokens are migrated. They map to the equivalent business role in
 * the API's capability policy and must not be used for new identity-provider mappings.
 */
export const authRoleSchema = z.enum([
  'ADMINISTRADOR',
  'COMPRAS',
  'VENTAS',
  'ADMIN',
  'EDITOR',
  'VIEWER',
]);
export type AuthRole = z.infer<typeof authRoleSchema>;

/** Stable capabilities used by both route guards and menu visibility. */
export const authCapabilitySchema = z.enum([
  'identity:self:read',
  'menu:home:view',
  'menu:products:view',
  'menu:categories:view',
  'menu:templates:view',
  'menu:applications:view',
  'menu:equivalences:view',
  'menu:documents:view',
  'menu:imports:view',
  'menu:ai-quality:view',
  'menu:publication:view',
  'menu:integrations:view',
  'menu:reports:view',
  'menu:administration:view',
  'catalog:read',
  'catalog:write',
  'attributes:read',
  'attributes:write',
  'attributes:sensitive:read',
  'applications:read',
  'applications:write',
  'equivalences:read',
  'equivalences:write',
  'imports:execute',
  'ai-quality:execute',
  'ai-document:extract',
  'publication:execute',
  'integrations:manage',
  'reports:read',
  'audit:read',
  'administration:manage',
  'operations:manage',
]);
export type AuthCapability = z.infer<typeof authCapabilitySchema>;

export const authenticatedActorSchema = z.object({
  id: z.string().min(1).max(120),
  email: z.string().email(),
  roles: z.array(authRoleSchema).min(1),
  /** Derived server-side from roles; clients use it to hide inaccessible UI actions. */
  capabilities: z.array(authCapabilitySchema).default([]),
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
