import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Adds the standard Retry-After header alongside named-throttler diagnostic headers. */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected override setResponseHeader(
    response: Record<string, unknown>,
    name: string,
    value: string | number,
  ): void {
    super.setResponseHeader(response, name, value);
    if (name.startsWith('Retry-After-')) {
      super.setResponseHeader(response, 'Retry-After', value);
    }
  }
}
