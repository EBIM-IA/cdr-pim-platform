import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { type ApiEnv } from '@cdr/config';

import { API_ENV, DATABASE, DATABASE_SQL } from '../shared/tokens';
import { type Sql, createDatabase } from './drizzle.client';

/** Closes the pool on SIGTERM so ECS can drain a task without severing live queries. */
@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_SQL) private readonly sql: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

const connectionProvider = {
  provide: 'DATABASE_CONNECTION',
  inject: [API_ENV],
  useFactory: (env: ApiEnv) =>
    createDatabase({
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL,
    }),
};

@Global()
@Module({
  providers: [
    connectionProvider,
    {
      provide: DATABASE,
      inject: ['DATABASE_CONNECTION'],
      useFactory: (connection: ReturnType<typeof createDatabase>) => connection.db,
    },
    {
      provide: DATABASE_SQL,
      inject: ['DATABASE_CONNECTION'],
      useFactory: (connection: ReturnType<typeof createDatabase>) => connection.sql,
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE, DATABASE_SQL],
})
export class DatabaseModule {}
