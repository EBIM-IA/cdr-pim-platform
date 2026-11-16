import { ConflictError, DependencyUnavailableError, isDomainError } from '@cdr/shared';

/** Busy ownership and infrastructure failures are retryable; they are not invalid input rows. */
export function isRetryableImportFailure(error: unknown): boolean {
  return (
    error instanceof ConflictError ||
    error instanceof DependencyUnavailableError ||
    !isDomainError(error)
  );
}
