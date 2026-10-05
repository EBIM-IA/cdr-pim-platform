export class SessionExpiredError extends Error {
  constructor() {
    super('Tu sesión expiró. Inicia sesión nuevamente.');
    this.name = 'SessionExpiredError';
  }
}

export class LogoutError extends Error {
  constructor() {
    super('No fue posible cerrar la sesión. Inténtalo nuevamente.');
    this.name = 'LogoutError';
  }
}

interface BrowserLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

interface BffClientDependencies {
  readonly fetcher?: typeof fetch;
  readonly location?: BrowserLocation;
  readonly redirect?: (path: string) => void;
}

export function returnPathFromLocation(location: BrowserLocation): string {
  return `${location.pathname || '/'}${location.search}${location.hash}`;
}

export function expiredSessionLoginPath(returnTo: string): string {
  const query = new URLSearchParams({ returnTo });
  return `/login?${query.toString()}`;
}

/**
 * Clears the HttpOnly session through a same-origin fetch. A plain HTML form navigation can
 * omit the Origin header in some browser configurations, which the CSRF-protected route must
 * reject. Fetch supplies the browser-controlled origin metadata without exposing the token.
 */
export async function logoutSession(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: '/login' }),
  });

  if (!response.ok) throw new LogoutError();
}

/**
 * Browser-side gateway for every authenticated BFF request. A stale access token is cleared
 * through the same-origin logout endpoint before redirecting; the token itself is never read
 * by JavaScript because it remains in an HttpOnly cookie.
 */
export async function authenticatedBffFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  dependencies: BffClientDependencies = {},
): Promise<Response> {
  const fetcher = dependencies.fetcher ?? fetch;
  const response = await fetcher(input, init);
  if (response.status !== 401 || typeof window === 'undefined') return response;

  const location = dependencies.location ?? window.location;
  const returnTo = returnPathFromLocation(location);
  await fetcher('/api/auth/logout', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: '/login' }),
  }).catch(() => undefined);

  const redirect = dependencies.redirect ?? ((path: string) => window.location.replace(path));
  redirect(expiredSessionLoginPath(returnTo));
  throw new SessionExpiredError();
}
