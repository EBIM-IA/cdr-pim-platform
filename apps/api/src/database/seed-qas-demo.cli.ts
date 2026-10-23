/* eslint-disable no-console -- standalone CLI: emits a bounded operational report, never credentials or data values */
import { z } from 'zod';
import { readFileSync } from 'node:fs';

import { createDatabase } from './drizzle.client';
import { QAS_DEMO_SUPPLEMENT } from './qas-demo-manifest';
import {
  assertQasDemoSeedEnvironment,
  QasDemoSeedCollisionError,
  runQasDemoSeed,
} from './qas-demo-seed';

export function parseQasDemoSeedArguments(args: readonly string[]): { readonly apply: boolean } {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) return { apply: false };
  if (args.length === 1 && args[0] === '--apply') return { apply: true };
  throw new Error('Use --dry-run (default) or --apply, exclusively.');
}

const seedEnv = z.object({
  APP_ENV: z.literal('qas'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  DATABASE_SSL: z.literal('true'),
  DATABASE_SSL_CA_FILE: z.string().min(1),
  QAS_DEMO_EXPECTED_SOURCE_SHA256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});

async function main(): Promise<void> {
  const options = parseQasDemoSeedArguments(process.argv.slice(2));
  assertQasDemoSeedEnvironment(process.env.APP_ENV ?? '');
  const env = seedEnv.parse(process.env);
  // Fail before opening a connection if the configured certificate bundle is unavailable.
  readFileSync(env.DATABASE_SSL_CA_FILE);
  const { db, sql } = createDatabase({
    url: env.DATABASE_URL,
    poolMax: 1,
    ssl: true,
    sslCaFile: env.DATABASE_SSL_CA_FILE,
  });
  try {
    const result = await runQasDemoSeed(db, {
      ...options,
      supplement: QAS_DEMO_SUPPLEMENT,
      expectedSourceSha256: env.QAS_DEMO_EXPECTED_SOURCE_SHA256,
    });
    const { insertedIds, ...summary } = result;
    for (const [table, ids] of Object.entries(insertedIds)) {
      for (let offset = 0; offset < ids.length; offset += 100) {
        console.log(
          `QAS_DEMO_INSERTED_IDS ${JSON.stringify({ table, ids: ids.slice(offset, offset + 100) })}`,
        );
      }
    }
    console.log(`QAS_DEMO_RESULT ${JSON.stringify(summary)}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Driver exceptions can contain SQL parameters. Log only our fixed collision codes.
  console.error(
    JSON.stringify({
      event: 'qas_demo_seed_failed',
      code:
        error instanceof QasDemoSeedCollisionError
          ? 'INCOMPATIBLE_EXISTING_DATA'
          : 'QAS_SEED_FAILED',
      ...(error instanceof QasDemoSeedCollisionError
        ? { table: error.table, reason: error.reason }
        : {}),
    }),
  );
  process.exitCode = 1;
});
