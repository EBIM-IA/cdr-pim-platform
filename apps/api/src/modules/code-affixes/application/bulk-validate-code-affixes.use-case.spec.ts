import { describe, expect, it, vi } from 'vitest';
import { newUuid } from '@cdr/shared';
import { CodeAffix } from '../domain/entities/code-affix';
import type { CodeAffixRepositoryPort } from '../domain/ports/code-affix.repository.port';
import type { ValidateCodeAffixUseCase } from './manage-code-affixes.use-cases';
import { BulkValidateCodeAffixesUseCase } from './bulk-validate-code-affixes.use-case';
import { Role } from '../../identity/domain/entities/role';
const now = new Date('2026-11-16T15:00:00Z'),
  actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] };
describe('human bulk validation threshold', () => {
  it('validates only pending AI suggestions with evidence and confidence at least 90%', async () => {
    const rules = [0.9, 0.899].map((confidence, index) =>
      CodeAffix.create(
        {
          id: newUuid(),
          kind: 'suffix',
          token: `RS${index}`,
          meaning: 'Sello',
          attribute: null,
          impliedValue: null,
          brand: null,
          family: null,
          source: 'ai_suggestion',
          confidence,
          evidence: 'Evidencia del fabricante',
          boreRule: 'none',
          priority: 0,
        },
        actor.id,
        now,
      ),
    );
    const repository = {
      findById: vi.fn(async (id) => rules.find((rule) => rule.toSnapshot().id === id) ?? null),
    };
    const validate = { execute: vi.fn(async () => rules[0]!) };
    const service = new BulkValidateCodeAffixesUseCase(
      repository as unknown as CodeAffixRepositoryPort,
      validate as unknown as ValidateCodeAffixUseCase,
    );
    const result = await service.execute(
      {
        items: rules.map((rule) => ({
          id: rule.toSnapshot().id,
          expectedUpdatedAt: now.toISOString(),
        })),
      },
      actor,
    );
    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(validate.execute).toHaveBeenCalledTimes(1);
  });
});
