/* eslint-disable no-console -- standalone CLI: stdout is its user interface */
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { defaultMigrationsDir } from './migrator';

/** Scaffolds the next migration file so numbering and naming stay consistent. */
async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    console.error('Usage: pnpm db:new <snake_case_name>');
    process.exit(2);
  }

  const directory = defaultMigrationsDir();
  const existing = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const last = existing.at(-1);
  const next = String((last ? Number(last.slice(0, 4)) : -1) + 1).padStart(4, '0');
  const file = path.join(directory, `${next}_${name}.sql`);

  await writeFile(
    file,
    [
      '-- =============================================================================',
      `-- ${next} — ${name.replace(/_/g, ' ')}`,
      '-- =============================================================================',
      '-- Why this change is needed:',
      '--',
      '-- Reversible: (write the inverse statement here, or state why it is destructive)',
      '-- =============================================================================',
      '',
      '',
    ].join('\n'),
    { flag: 'wx' },
  );
  console.log(`Created ${path.relative(process.cwd(), file)}`);
  console.log('Remember: once applied anywhere, this file is immutable (checksum-enforced).');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
