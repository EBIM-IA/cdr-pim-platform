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
    },
  },
];
