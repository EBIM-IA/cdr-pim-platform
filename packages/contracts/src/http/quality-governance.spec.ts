import { describe, expect, it } from 'vitest';
import { qualityDecisionSchema, qualitySourcePrioritySchema } from './quality-governance';
describe('quality governance boundary', () => {
  it('requires an explicit reason and valid concurrency version for every decision', () => {
    for (const payload of [
      { version: 1, action: 'approve', reason: '   ' },
      { version: 0, action: 'reject', reason: 'Verificado' },
      { version: 1, action: 'approve', reason: 'Verificado', chosenIndex: -1 },
    ])
      expect(qualityDecisionSchema.safeParse(payload).success).toBe(false);
    expect(
      qualityDecisionSchema.parse({
        version: 1,
        action: 'reject',
        reason: '  Documento incorrecto  ',
      }).reason,
    ).toBe('Documento incorrecto');
  });
  it('rejects inferred or tied precedence and accepts an explicitly partial priority matrix', () => {
    const base = {
      categoryId: '10000000-0000-4000-8000-000000000001',
      expectedUpdatedAt: '2026-11-10T15:00:00Z',
      reason: 'Confirmado por cliente.',
    };
    expect(
      qualitySourcePrioritySchema.safeParse({ ...base, priority: { fabricante: 1, archivo: 1 } })
        .success,
    ).toBe(false);
    expect(qualitySourcePrioritySchema.safeParse({ ...base, priority: {} }).success).toBe(false);
    expect(
      qualitySourcePrioritySchema.safeParse({ ...base, priority: { fabricante: 1, archivo: 2 } })
        .success,
    ).toBe(true);
  });
});
