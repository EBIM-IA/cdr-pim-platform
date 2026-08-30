import { Global, Module } from '@nestjs/common';
import { type ApiEnv } from '@cdr/config';
import { type Clock, type Logger, SystemClock, createLogger } from '@cdr/shared';

import { API_ENV, CLOCK, LOGGER } from '../tokens';

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): Logger =>
        createLogger({
          service: env.SERVICE_NAME,
          environment: env.APP_ENV,
          level: env.LOG_LEVEL,
          pretty: env.APP_ENV === 'local',
        }),
    },
    { provide: CLOCK, useValue: SystemClock satisfies Clock },
  ],
  exports: [LOGGER, CLOCK],
})
export class LoggerModule {}
