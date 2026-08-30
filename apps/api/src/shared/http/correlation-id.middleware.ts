import { Injectable, type NestMiddleware } from '@nestjs/common';
import { CORRELATION_ID_HEADER, newExecutionContext, runWithContext } from '@cdr/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * Establishes the execution context for the whole request.
 *
 * An inbound `x-correlation-id` is honoured so that a trace started in the browser (or by
 * another internal service) survives the hop; otherwise a new one is minted. The value is
 * echoed back on the response so the caller can quote it in a support ticket.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.header(CORRELATION_ID_HEADER);
    const context = newExecutionContext(inbound && inbound.length <= 200 ? inbound : undefined);

    response.setHeader(CORRELATION_ID_HEADER, context.correlationId);
    runWithContext(context, () => next());
  }
}
