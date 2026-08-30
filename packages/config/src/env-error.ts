import type { z } from 'zod';

/**
 * Fail fast, loudly, and without leaking values.
 *
 * A task that starts with a bad configuration is worse than one that never starts: ECS
 * would happily route traffic to it. We therefore exit at bootstrap and print only the
 * *names* of the offending variables — never their contents.
 */
export class EnvironmentValidationError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    const lines = issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    super(`Invalid environment configuration:\n${lines.join('\n')}`);
    this.name = 'EnvironmentValidationError';
  }
}

export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }
  return result.data;
}
