/**
 * Stable, machine-readable error codes shared across every layer and both apps.
 *
 * The wire format of an error is part of the API contract: never rename a code
 * without a version bump. See `docs/architecture/INTEGRATION_ARCHITECTURE.md`.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base class for every *expected* failure expressed by the domain or application layer.
 *
 * Framework-free on purpose: the domain throws these, and a Nest exception filter in the
 * presentation layer is what maps them to HTTP. The domain never knows about status codes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  /** Non-sensitive structured context, safe to log and to return to the caller. */
  readonly details: Readonly<Record<string, unknown>>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = Object.freeze({ ...details });
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends DomainError {
  readonly code = ErrorCode.VALIDATION_FAILED;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class NotFoundError extends DomainError {
  readonly code = ErrorCode.NOT_FOUND;
  constructor(resource: string, identifier: string) {
    super(`${resource} not found`, { resource, identifier });
  }
}

export class ConflictError extends DomainError {
  readonly code = ErrorCode.CONFLICT;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = ErrorCode.FORBIDDEN;
  constructor(message = 'Operation not permitted', details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/**
 * A required outbound dependency (database, queue, AI provider, ERP) is unreachable.
 * Adapters translate their vendor-specific failures into this so the application layer
 * never has to know what an `SQSServiceException` is.
 */
export class DependencyUnavailableError extends DomainError {
  readonly code = ErrorCode.DEPENDENCY_UNAVAILABLE;
  constructor(dependency: string, cause?: unknown) {
    super(`Dependency unavailable: ${dependency}`, { dependency });
    if (cause !== undefined) this.cause = cause;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
