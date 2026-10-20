/* eslint-disable no-console -- standalone CLI: stdout is its user interface */
import { loadApiEnv } from '@cdr/config';
import { sanitizeLogText } from '@cdr/shared';

import { createDatabase } from './drizzle.client';
import { assertDemoSeedEnvironment, seedDemoCatalog } from './demo-seed';

async function main(): Promise<void> {
  const env = loadApiEnv();
  assertDemoSeedEnvironment(env.APP_ENV);

  const { db, sql } = createDatabase({
    url: env.DATABASE_URL,
    poolMax: 1,
    ssl: env.DATABASE_SSL,
    sslCaFile: env.DATABASE_SSL_CA_FILE,
  });

  try {
    const result = await seedDemoCatalog(db);
    console.log(
      [
        'Demo seed completed.',
        `products +${result.productsInserted}`,
        `identifiers +${result.identifiersInserted}`,
        `groups +${result.groupsInserted}`,
        `memberships +${result.membershipsInserted}`,
        `embeddings +${result.embeddingsIndexed}`,
      ].join(' '),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(
    'Demo seed failed:',
    error instanceof Error ? sanitizeLogText(error.message) : 'Unknown seed error',
  );
  process.exitCode = 1;
});
