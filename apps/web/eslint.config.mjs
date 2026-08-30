import { baseConfig } from '@cdr/eslint-config';

export default [
  ...baseConfig,
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
