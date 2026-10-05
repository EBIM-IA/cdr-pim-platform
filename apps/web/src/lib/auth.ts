import {
  authenticatedActorSchema,
  authMeResponseSchema,
  loginRequestSchema as apiLoginRequestSchema,
  loginResponseSchema,
  type AuthenticatedActorDto,
} from '@cdr/contracts';
import { z } from 'zod';

export const LOCAL_AUTH_COOKIE_NAME = 'cdr_pim_session';
export const PRODUCTION_AUTH_COOKIE_NAME = '__Host-cdr_pim_session';

export function authCookieName(production: boolean): string {
  return production ? PRODUCTION_AUTH_COOKIE_NAME : LOCAL_AUTH_COOKIE_NAME;
}

export const authActorSchema = authenticatedActorSchema;
export { authMeResponseSchema, loginResponseSchema };
export type AuthActor = AuthenticatedActorDto;

export const loginRequestSchema = apiLoginRequestSchema.extend({
  returnTo: z.string().optional(),
});

const LOCAL_ORIGIN = 'https://cdr.local';
const MAX_SESSION_SECONDS = 60 * 60 * 24 * 7;

/**
 * Accepts only an application-local path. Parsing against a fixed origin also rejects
 * backslash variants that browsers can otherwise normalize into protocol-relative URLs.
 */
export function safeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return fallback;
  const hasControlCharacter = [...value].some((character) => character.charCodeAt(0) < 32);
  if (!value.startsWith('/') || value.startsWith('//') || hasControlCharacter) {
    return fallback;
  }

  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    if (url.pathname === '/login' || url.pathname.startsWith('/api/auth/')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function hasExpectedOrigin(originHeader: string | null, expectedOrigin: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * The client address to forward to the API's login throttle.
 *
 * In QAS/PRD the web task is reachable only from the ALB, which APPENDS the address it saw
 * to X-Forwarded-For. Anything to the left of that last entry was written by the client and
 * is ignored. The API trusts exactly one hop (TRUST_PROXY_HOPS=1) — this BFF — so the value
 * forwarded here becomes its `request.ip`; without it every login would share the web
 * task's address and five failed attempts would lock everybody out. A local API trusts no
 * hop and ignores the header.
 */
export function clientAddressFromForwardedFor(header: string | null): string | null {
  const last = header?.split(',').at(-1)?.trim();
  if (!last || last.length > 45) return null;
  // IPv4 or IPv6 literal only: never forward arbitrary text into another service's header.
  return /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:.]*:[0-9a-f:.]*)$/iu.test(last) ? last : null;
}

export function durationToSeconds(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/u.exec(duration);
  if (!match) return 1;

  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1 / 1_000,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
    w: 60 * 60 * 24 * 7,
    y: 60 * 60 * 24 * 365,
  };
  return Math.max(1, Math.floor(amount * (factors[unit ?? ''] ?? 0)));
}

export function sessionCookieOptions(expiresIn: string, production: boolean) {
  const maxAge = Math.min(durationToSeconds(expiresIn), MAX_SESSION_SECONDS);
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: production,
    path: '/',
    maxAge,
    priority: 'high' as const,
  };
}

export function actorInitials(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  const segments = localPart.split(/[._-]+/u).filter(Boolean);
  const initials = segments
    .slice(0, 2)
    .map((segment) => segment.charAt(0))
    .join('');
  return (initials || localPart.slice(0, 2) || 'US').toUpperCase();
}

export function actorRoleLabel(roles: readonly string[]): string {
  return roles.length > 0 ? roles.join(' · ') : 'Sin rol asignado';
}

/**
 * Keeps authentication failures understandable without rendering arbitrary text returned by an
 * upstream service. In particular, a 401 is a credential failure, not a technical API message.
 */
export function loginFailureMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa el correo y la contraseña ingresados.';
    case 401:
      return 'El correo o la contraseña son incorrectos.';
    case 403:
      return 'No pudimos validar esta solicitud. Recarga la página e inténtalo nuevamente.';
    case 429:
      return 'Hay demasiados intentos de acceso. Espera un momento e inténtalo nuevamente.';
    default:
      return status >= 500
        ? 'El servicio de autenticación no está disponible. Inténtalo nuevamente.'
        : 'No fue posible iniciar sesión con esas credenciales.';
  }
}
