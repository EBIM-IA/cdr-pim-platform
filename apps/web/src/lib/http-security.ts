const PRIVATE_NO_STORE = 'private, no-store, max-age=0, must-revalidate';

export const UPSTREAM_TIMEOUT_MS = 10_000;
export const IMPORT_UPSTREAM_TIMEOUT_MS = 60_000;
/** Provider-backed AI calls need more time than regular CRUD, but may not occupy a BFF worker forever. */
export const AI_UPSTREAM_TIMEOUT_MS = 45_000;

function appendVary(headers: Headers, value: string): void {
  const entries = (headers.get('vary') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!entries.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    entries.push(value);
  }
  headers.set('Vary', entries.join(', '));
}

/** Prevents browsers and shared intermediaries from retaining authenticated PIM data. */
export function securePrivateResponse<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', PRIVATE_NO_STORE);
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  appendVary(response.headers, 'Cookie');
  return response;
}

/**
 * Per-request CSP. Next reads the nonce from the forwarded CSP header and applies it to
 * framework scripts. Inline styles remain enabled because React and the component library use
 * style attributes; executable inline script is still forbidden without the nonce.
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!development) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export interface BrowserSecurityOptions {
  readonly contentSecurityPolicy: string;
  readonly production: boolean;
}

/** Applies defense-in-depth browser headers to a response produced by the middleware. */
export function applyBrowserSecurityHeaders(
  headers: Headers,
  options: BrowserSecurityOptions,
): void {
  headers.set('Content-Security-Policy', options.contentSecurityPolicy);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  );
  headers.set('X-DNS-Prefetch-Control', 'off');
  if (options.production) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
}

/** Every server-to-server request gets a finite lifetime to avoid exhausting BFF workers. */
export function upstreamTimeoutSignal(timeoutMs = UPSTREAM_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}
