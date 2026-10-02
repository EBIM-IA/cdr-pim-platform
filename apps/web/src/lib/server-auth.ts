import 'server-only';

import { API_PREFIX } from '@cdr/contracts';
import { cookies } from 'next/headers';

import { authCookieName, authMeResponseSchema, type AuthActor } from '@/lib/auth';
import { env } from '@/lib/env';
import { upstreamTimeoutSignal } from '@/lib/http-security';

function authApiUrl(path: string): string {
  return `${env.API_BASE_URL}${API_PREFIX}${path}`;
}

export async function getAccessToken(): Promise<string | null> {
  const cookieName = authCookieName(env.NODE_ENV === 'production');
  return (await cookies()).get(cookieName)?.value ?? null;
}

export async function fetchCurrentActor(accessToken: string): Promise<AuthActor | null> {
  try {
    const response = await fetch(authApiUrl('/auth/me'), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: upstreamTimeoutSignal(),
    });
    if (!response.ok) return null;

    const parsed = authMeResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.actor : null;
  } catch {
    return null;
  }
}

export async function getCurrentActor(): Promise<AuthActor | null> {
  const accessToken = await getAccessToken();
  return accessToken ? fetchCurrentActor(accessToken) : null;
}
