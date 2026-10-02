import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { schema } from './schema';

export type Database = ReturnType<typeof createDatabase>['db'];
export type Sql = ReturnType<typeof postgres>;

export interface DatabaseOptions {
  readonly url: string;
  readonly poolMax: number;
  readonly ssl: boolean;
}

/**
 * Creates the single PostgreSQL connection pool for the process.
 *
 * `postgres.js` is used directly (rather than `pg`) because it is a smaller dependency
 * with first-class support for the binary protocol and for `pgvector`'s text encoding.
 * The Drizzle instance is only ever consumed by adapters in an `infrastructure/` folder —
 * the domain and application layers know nothing about it (ADR-002, ADR-009).
 */
export function createDatabase(options: DatabaseOptions): {
  db: ReturnType<typeof drizzle>;
  sql: Sql;
} {
  const sql = postgres(options.url, {
    max: options.poolMax,
    // Hosted environments validate both the certificate chain and server hostname. The
    // configuration schema makes TLS mandatory in QAS/PRD.
    ssl: options.ssl ? 'verify-full' : false,
    // Fail fast rather than let a request hang until the ALB times it out.
    connect_timeout: 10,
    idle_timeout: 30,
    onnotice: () => undefined,
    prepare: false,
  });

  return { db: drizzle(sql, { schema }), sql };
}
