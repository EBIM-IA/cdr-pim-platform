import 'server-only';

import { API_PREFIX } from '@cdr/contracts';
import { cookies } from 'next/headers';

import { AUTH_COOKIE_NAME, authMeResponseSchema, type AuthActor } from '@/lib/auth';

function authApiUrl(path: string): string {
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
  return `${baseUrl}${API_PREFIX}${path}`;
}

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function fetchCurrentActor(accessToken: string): Promise<AuthActor | null> {
  try {
    const response = await fetch(authApiUrl('/auth/me'), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
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
