/**
 * Explicit success/failure type for operations whose failure is an ordinary outcome
 * rather than an exception (e.g. parsing untrusted input, optimistic concurrency).
 *
 * We deliberately do NOT use this everywhere: throwing `DomainError` remains the default
 * for invariant violations, because it keeps use-case code readable. `Result` is for the
 * cases where the caller is expected to branch on the failure.
 */
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
