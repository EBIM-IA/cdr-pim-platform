import { baseConfig } from '@cdr/eslint-config';
import { hexagonalConfig } from '@cdr/eslint-config/hexagonal';

export default [
  ...baseConfig,
  ...hexagonalConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS DI relies on parameter decorators; empty constructors are idiomatic there.
      '@typescript-eslint/no-empty-function': 'off',

      // ── Why this rule is OFF for apps/api, and nowhere else ──────────────────
      //
      // `consistent-type-imports` decides "used only as a type" from syntax alone. A class
      // that appears solely as a constructor parameter annotation looks type-only to it —
      // but that is exactly the shape NestJS needs at RUNTIME: `emitDecoratorMetadata`
      // records the constructor's parameter types into `design:paramtypes`, and an erased
      // `import type` leaves `Function`/`Object` there instead of the class.
      //
      // Its autofix therefore turns working DI into `UnknownDependenciesException` at
      // bootstrap — silently, because the code still compiles, typechecks and passes every
      // unit test. That is precisely how finding C-1 was introduced.
      //
      // Scope: this workspace is the only one with decorator-driven DI. The rule stays
      // enabled in apps/web, apps/worker and every package, where no decorator exists and
      // the erasure is harmless.
      //
      // Backstop: `test/bootstrap/app-module.spec.ts` compiles the real AppModule through
      // the Nest container, so any reintroduction fails CI rather than production.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
