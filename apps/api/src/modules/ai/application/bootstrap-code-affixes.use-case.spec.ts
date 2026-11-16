import { describe, expect, it, vi } from 'vitest';
import { BootstrapCodeAffixesUseCase } from './bootstrap-code-affixes.use-case';
import { CodeAffix } from '../../code-affixes/domain/entities/code-affix';
import type { CodeAffixRepositoryPort } from '../../code-affixes/domain/ports/code-affix.repository.port';
import { Role } from '../../identity/domain/entities/role';
const actor = { id: 'admin', email: 'admin@example.test', roles: [Role.Administrator] },
  now = new Date('2026-11-16T15:00:00Z');
describe('AI affix bootstrap', () => {
  it('requires literal evidence, suppresses duplicates, and stores every suggestion pending human validation', async () => {
    const generation = {
      model: 'test',
      generate: vi.fn().mockResolvedValue({
        model: 'test',
        text: JSON.stringify({
          items: [
            {
              kind: 'suffix',
              token: '2RS',
              meaning: 'Dos sellos',
              confidence: 0.95,
              evidence: '2RS significa dos sellos',
            },
            {
              kind: 'suffix',
              token: 'ZZ',
              meaning: 'Blindado',
              confidence: 0.99,
              evidence: 'Cita inventada',
            },
            {
              kind: 'suffix',
              token: '2RS',
              meaning: 'Duplicado',
              confidence: 0.95,
              evidence: '2RS significa dos sellos',
            },
          ],
        }),
      }),
    };
    const create = {
      execute: vi.fn(async (input, actor) => CodeAffix.create(input, actor.id, now)),
    };
    const service = new BootstrapCodeAffixesUseCase(generation, create, {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as CodeAffixRepositoryPort);
    const result = await service.execute(
      { evidence: 'El fabricante indica que 2RS significa dos sellos para esta familia.' },
      actor,
    );
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.items[0]?.toSnapshot()).toMatchObject({
      source: 'ai_suggestion',
      status: 'pending_validation',
      validatedAt: null,
    });
  });
});
