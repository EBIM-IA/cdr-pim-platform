import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Executable architecture rules.
 *
 * Documentation describing a layering rule decays; a failing test does not. This suite
 * statically scans every source file and enforces the dependency direction of ADR-002:
 *
 *   EXTERNAL SYSTEM -> ADAPTER -> PORT -> APPLICATION -> DOMAIN
 *
 * If one of these fails, the fix is almost never to relax the rule — it is to introduce a
 * port. Read the failure message: it names the file, the offending import and the reason.
 */

const SRC = path.resolve(process.cwd(), 'src');
const MODULES = path.join(SRC, 'modules');

interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly module: string;
  readonly layer: string;
  readonly imports: string[];
}

/** Matches `import ... from 'x'`, `import 'x'` and `require('x')`. */
const IMPORT_PATTERN = /(?:from\s+|import\s+|require\()\s*['"]([^'"]+)['"]/g;

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
    }),
  );
  return files.flat();
}

async function loadModuleSources(): Promise<SourceFile[]> {
  const files = await walk(MODULES);
  return Promise.all(
    files.map(async (absolutePath) => {
      const content = await readFile(absolutePath, 'utf8');
      const relative = path.relative(MODULES, absolutePath);
      const [moduleName = '', layer = ''] = relative.split(path.sep);

      const imports: string[] = [];
      for (const match of content.matchAll(IMPORT_PATTERN)) {
        imports.push(match[1] as string);
      }

      return {
        absolutePath,
        relativePath: path.relative(SRC, absolutePath),
        module: moduleName,
        layer,
        imports,
      };
    }),
  );
}

const sourcesPromise = loadModuleSources();

const filesInLayer = async (layer: string): Promise<SourceFile[]> =>
  (await sourcesPromise).filter((file) => file.layer === layer);

/** Frameworks, drivers and vendor SDKs. None of these may appear in the domain. */
const OUTER_WORLD = [
  '@nestjs/',
  'drizzle-orm',
  'postgres',
  'pg',
  'openai',
  '@aws-sdk/',
  'express',
  'axios',
  'next',
  '@cdr/messaging',
  '@cdr/storage',
];

function violatesOuterWorld(specifier: string, allow: string[] = []): boolean {
  if (allow.some((prefix) => specifier === prefix || specifier.startsWith(prefix))) return false;
  return OUTER_WORLD.some((prefix) => specifier === prefix || specifier.startsWith(prefix));
}

describe('hexagonal boundaries', () => {
  it('finds the source tree it is supposed to police', async () => {
    // A guard against the scan silently matching nothing, which would make every
    // assertion below vacuously true.
    expect((await sourcesPromise).length).toBeGreaterThan(20);
    expect((await filesInLayer('domain')).length).toBeGreaterThan(5);
  });

  it('keeps the domain free of frameworks, drivers and vendor SDKs', async () => {
    const violations = (await filesInLayer('domain')).flatMap((file) =>
      file.imports
        .filter((specifier) => violatesOuterWorld(specifier))
        .map((specifier) => `${file.relativePath} imports "${specifier}"`),
    );

    expect(violations, 'Express the dependency as a Port instead').toEqual([]);
  });

  it('never lets the domain import an outer layer', async () => {
    const violations = (await filesInLayer('domain')).flatMap((file) =>
      file.imports
        .filter((specifier) => /(^|\/)(application|infrastructure|presentation)\//.test(specifier))
        .map((specifier) => `${file.relativePath} imports "${specifier}"`),
    );

    expect(violations, 'Dependencies point inwards only').toEqual([]);
  });

  it('keeps concrete drivers and vendor SDKs out of the application layer', async () => {
    // Nest's DI decorators are allowed here: use cases are wired by the container, and
    // @Inject is how a use case names the Port it needs without naming its adapter.
    const violations = (await filesInLayer('application')).flatMap((file) =>
      file.imports
        .filter((specifier) => violatesOuterWorld(specifier, ['@nestjs/common', '@cdr/messaging']))
        .map((specifier) => `${file.relativePath} imports "${specifier}"`),
    );

    expect(violations, 'Move the driver into an Adapter behind a Port').toEqual([]);
  });

  it('never lets the application layer import an adapter or a controller', async () => {
    const violations = (await filesInLayer('application')).flatMap((file) =>
      file.imports
        .filter((specifier) => /(^|\/)(infrastructure|presentation)\//.test(specifier))
        .map((specifier) => `${file.relativePath} imports "${specifier}"`),
    );

    expect(violations, 'Depend on the Port interface instead').toEqual([]);
  });
});

describe('module boundaries', () => {
  /**
   * Cross-module imports are allowed ONLY into another module's `domain/ports` (its
   * published contract) or its `domain/entities`. Reaching into another module's
   * application, infrastructure or presentation folder is what turns a modular monolith
   * back into a big ball of mud, and is the one thing that would make future extraction of
   * a module into its own service impossible.
   *
   * Two exceptions:
   *  - a module's own `<name>.module.ts` is its Nest composition surface, so importing it
   *    (as `SearchModule` imports `CatalogModule` to obtain an exported port) is exactly
   *    the sanctioned way for one context to depend on another;
   *  - a table definition holding a foreign key, which is a physical database constraint
   *    rather than a code dependency.
   */
  it('only reaches into another module through its published ports', async () => {
    const violations: string[] = [];

    for (const file of await sourcesPromise) {
      for (const specifier of file.imports) {
        if (!specifier.startsWith('.')) continue;

        const resolved = path.resolve(path.dirname(file.absolutePath), specifier);
        if (!resolved.startsWith(MODULES + path.sep)) continue;

        const [targetModule = '', ...rest] = path.relative(MODULES, resolved).split(path.sep);
        if (targetModule === file.module) continue;

        const targetPath = rest.join('/');
        const isPublishedContract =
          targetPath.startsWith('domain/ports') || targetPath.startsWith('domain/entities');
        const isNestCompositionRoot = targetPath === `${targetModule}.module`;
        const isForeignKeyReference =
          file.layer === 'infrastructure' && targetPath.includes('.tables');

        if (!isPublishedContract && !isNestCompositionRoot && !isForeignKeyReference) {
          violations.push(
            `${file.relativePath} reaches into ${targetModule}/${targetPath} ` +
              `(public surface: domain/ports, domain/entities and the module file)`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('platform-wide rules', () => {
  it('keeps source-backed demo data out of the production build', async () => {
    const buildConfig = JSON.parse(
      await readFile(path.resolve(process.cwd(), 'tsconfig.build.json'), 'utf8'),
    ) as { exclude?: string[] };

    expect(buildConfig.exclude).toEqual(
      expect.arrayContaining([
        'src/database/client-template-manifest.ts',
        'src/database/demo-seed.ts',
        'src/database/seed-demo.cli.ts',
      ]),
    );
  });

  it('reads configuration only through the validated schema', async () => {
    const allFiles = await walk(SRC);
    const offenders: string[] = [];

    for (const absolutePath of allFiles) {
      const relative = path.relative(SRC, absolutePath);
      // The config provider and the standalone CLIs are the sanctioned entry points.
      if (
        relative === path.join('shared', 'config', 'config.module.ts') ||
        relative.startsWith(path.join('database', 'migrate.cli')) ||
        relative.startsWith(path.join('database', 'new-migration.cli'))
      ) {
        continue;
      }
      const content = await readFile(absolutePath, 'utf8');
      if (content.includes('process.env')) {
        offenders.push(`${relative} reads process.env directly — inject API_ENV instead`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('confines the OpenAI SDK to its adapter folder', async () => {
    const offenders = (await walk(SRC))
      .filter((absolutePath) => !absolutePath.includes(path.join('ai', 'infrastructure', 'openai')))
      .filter((absolutePath) => absolutePath.endsWith('.ts'));

    const violations: string[] = [];
    for (const absolutePath of offenders) {
      const content = await readFile(absolutePath, 'utf8');
      if (/from\s+['"]openai['"]/.test(content)) {
        violations.push(path.relative(SRC, absolutePath));
      }
    }

    expect(violations, 'Use EmbeddingProviderPort / TextGenerationProviderPort').toEqual([]);
  });
});
