/** Coarse diagnostics only: never copy a vendor message, request URL or arbitrary error name. */
export function fileMaintenanceErrorCode(
  error: unknown,
): 'ACCESS_DENIED' | 'TIMEOUT' | 'UNAVAILABLE' {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth++) {
    const value = cause as {
      name?: unknown;
      $metadata?: { httpStatusCode?: unknown };
      cause?: unknown;
    };
    if (
      ['AccessDenied', 'AccessDeniedException', 'Forbidden', 'ForbiddenException'].includes(
        String(value.name),
      ) ||
      value.$metadata?.httpStatusCode === 403
    )
      return 'ACCESS_DENIED';
    if (
      ['AbortError', 'TimeoutError', 'RequestTimeout', 'RequestTimeoutException'].includes(
        String(value.name),
      )
    )
      return 'TIMEOUT';
    cause = value.cause;
  }
  return 'UNAVAILABLE';
}
