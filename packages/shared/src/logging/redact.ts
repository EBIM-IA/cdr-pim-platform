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

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}
