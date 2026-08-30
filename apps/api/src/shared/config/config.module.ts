import { Global, Module } from '@nestjs/common';
import { type ApiEnv, loadApiEnv } from '@cdr/config';

import { API_ENV } from '../tokens';

/**
 * Configuration is validated exactly once, at bootstrap, and then injected as an
 * immutable object. Nothing in the codebase reads `process.env` directly — the
 * architecture test enforces that.
 */
@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: (): ApiEnv => loadApiEnv() }],
  exports: [API_ENV],
})
export class ConfigModule {}
