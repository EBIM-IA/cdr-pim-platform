import { describe, expect, it } from 'vitest';

import {
  codeAffixListQuerySchema,
  createCodeAffixSchema,
  parseProductCodeSchema,
  updateCodeAffixSchema,
} from './code-affix';

describe('code-affix HTTP contracts', () => {
  it('normalizes list defaults without inventing records', () => {
    expect(codeAffixListQuerySchema.parse({})).toEqual({ includeInactive: false });
    expect(codeAffixListQuerySchema.parse({ includeInactive: 'true', kind: 'suffix' })).toEqual({
      includeInactive: true,
      kind: 'suffix',
    });
  });

  it('accepts provenance and an explicit ISO rule', () => {
    expect(
      createCodeAffixSchema.parse({
        kind: 'series',
        token: '6',
        meaning: 'Rodamiento rígido de bolas',
        source: 'standard',
        confidence: 0.98,
        evidence: 'ISO 15, designación dimensional del fabricante',
        boreRule: 'iso_15',
      }),
    ).toMatchObject({ boreRule: 'iso_15', priority: 0 });
  });

  it('rejects empty patches and oversized codes', () => {
    expect(
      updateCodeAffixSchema.safeParse({ expectedUpdatedAt: '2026-10-07T12:00:00.000Z' }).success,
    ).toBe(false);
    expect(parseProductCodeSchema.safeParse({ code: 'X'.repeat(121) }).success).toBe(false);
  });

  it('rejects confidence values that the database would round', () => {
    expect(
      createCodeAffixSchema.safeParse({
        kind: 'suffix',
        token: 'C3',
        meaning: 'Juego radial',
        source: 'ai_suggestion',
        confidence: 0.9876,
      }).success,
    ).toBe(false);
  });
});
