// @ts-check
import tseslint from 'typescript-eslint';

/**
 * Dependency-rule enforcement for Ports & Adapters.
 *
 *   EXTERNAL SYSTEM -> ADAPTER -> PORT -> APPLICATION -> DOMAIN
 *
 * The arrow only ever points inwards. These lint rules are the *fast* feedback loop;
 * the authoritative check is `apps/api/test/architecture/boundaries.spec.ts`, which
 * performs a full static scan and also catches cross-module imports.
 */

/** Frameworks and vendor SDKs that must never reach the inner layers. */
const OUTER_WORLD = [
  '@nestjs/*',
  '@nestjs/**',
  'drizzle-orm',
  'drizzle-orm/*',
  'drizzle-orm/**',
  'postgres',
  'pg',
  'openai',
  '@aws-sdk/*',
  '@aws-sdk/**',
  'express',
  'axios',
  'next',
  'next/*',
];

export const hexagonalConfig = tseslint.config(
  {
    // DOMAIN — the innermost layer. Pure TypeScript + @cdr/shared primitives only.
    files: ['**/modules/*/domain/**/*.ts'],
    // The dependency rule constrains PRODUCTION code. A unit test's job is precisely to
    // wire a fake adapter into a use case, so specs are exempt — as they are in the
    // architecture spec, which also skips *.spec.ts.
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: OUTER_WORLD,
              message:
                'Domain layer violation: the domain must not depend on frameworks, ' +
                'drivers or vendor SDKs. Express the need as a Port instead.',
            },
            {
              group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
              message:
                'Domain layer violation: the domain must not import outer layers. ' +
                'Dependencies point inwards only.',
            },
          ],
        },
      ],
    },
  },
  {
    // APPLICATION — orchestrates the domain through ports. May use Nest DI tokens,
    // but never a concrete driver or vendor SDK.
    files: ['**/modules/*/application/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: OUTER_WORLD.filter((m) => !m.startsWith('@nestjs')),
              message:
                'Application layer violation: use cases talk to Ports, never to a ' +
                'concrete driver or vendor SDK. Move this into an Adapter.',
            },
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message:
                'Application layer violation: use cases must not import adapters or ' +
                'controllers. Depend on the Port interface instead.',
            },
          ],
        },
      ],
    },
  },
);

export default hexagonalConfig;
