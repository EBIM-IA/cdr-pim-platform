/**
 * Defensive redaction of sensitive values before anything reaches CloudWatch.
 *
 * Security baseline: we must never log passwords, tokens, API keys or secrets
 * (`docs/architecture/SECURITY_BASELINE.md`). Relying on developers to remember this
 * does not scale, so redaction happens centrally in the logger.
 */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|phrase)?|secret|token|api[-_]?key|authorization|credential|private[-_]?key|session|cookie|pin|otp|psk)/i;

export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 6;

/** Scrubs secrets that escaped into free-form driver/vendor error text. */
export function sanitizeLogText(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:/\s]+:)[^@\s/]+@/gi, `$1${REDACTED}@`)
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(
      /([?&](?:access_token|api[-_]?key|authorization|password|secret|session|token)=)[^&\s]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /\b(password|secret|api[-_]?key|access_token)\s*[=:]\s*([^\s,;]+)/gi,
      `$1=${REDACTED}`,
    );
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (typeof value === 'string') return sanitizeLogText(value);
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogText(value.message),
      ...(value.stack ? { stack: sanitizeLogText(value.stack) } : {}),
      ...('cause' in value ? { cause: redact(value.cause, depth + 1) } : {}),
    };
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}
