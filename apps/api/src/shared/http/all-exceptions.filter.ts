import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ErrorCode, type Logger, getCorrelationId, isDomainError } from '@cdr/shared';
import type { Request, Response } from 'express';

import { LOGGER } from '../tokens';

const DOMAIN_CODE_TO_STATUS: Record<string, HttpStatus> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * The single place where an internal failure becomes an HTTP response.
 *
 * This is what keeps the domain free of HTTP concerns: use cases throw `DomainError`
 * subclasses and this filter decides the status code. Unknown errors are logged in full
 * but reported to the caller as a bare 500 with only a correlation id — never a stack
 * trace, never a driver message that could disclose schema or credentials.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const correlationId = getCorrelationId() ?? 'unknown';

    const { status, code, message, details } = this.classify(exception);

    if (status >= 500) {
      this.logger.error('Unhandled request failure', {
        path: request.url,
        method: request.method,
        status,
        error: exception,
      });
    } else {
      this.logger.warn('Request rejected', {
        path: request.url,
        method: request.method,
        status,
        code,
      });
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private classify(exception: unknown): {
    status: HttpStatus;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (isDomainError(exception)) {
      return {
        status: DOMAIN_CODE_TO_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR,
        code: exception.code,
        message: exception.message,
        ...(Object.keys(exception.details).length
          ? { details: exception.details as Record<string, unknown> }
          : {}),
      };
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      return {
        status: exception.getStatus(),
        code: HttpStatus[exception.getStatus()] ?? ErrorCode.INTERNAL,
        message: Array.isArray(message) ? message.join('; ') : message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
    };
  }
}
