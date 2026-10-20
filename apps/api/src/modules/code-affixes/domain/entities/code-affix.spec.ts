import { describe, expect, it } from 'vitest';

import { CodeAffix } from './code-affix';

const now = new Date('2026-10-07T12:00:00.000Z');

describe('CodeAffix', () => {
  it('keeps AI-originated content pending instead of treating it as true', () => {
    const rule = CodeAffix.create(
      {
        kind: 'suffix',
        token: 'c3',
        meaning: 'Juego radial superior al normal',
        attribute: 'Juego radial',
        impliedValue: 'C3',
        brand: null,
        family: 'Rodamientos',
        source: 'ai_suggestion',
        confidence: 0.93,
        evidence: 'Pendiente de contrastar con catálogo del fabricante',
        boreRule: 'none',
        priority: 20,
      },
      'admin-1',
      now,
    );

    expect(rule.toSnapshot()).toMatchObject({ token: 'C3', status: 'pending_validation' });
  });

  it('requires evidence to validate and resets validation after an edit', () => {
    const rule = CodeAffix.create(
      {
        kind: 'series',
        token: '6',
        meaning: 'Rodamiento rígido de bolas',
        attribute: null,
        impliedValue: null,
        brand: null,
        family: 'Rodamientos',
        source: 'standard',
        confidence: 1,
        evidence: 'ISO 15 y catálogo del fabricante',
        boreRule: 'iso_15',
        priority: 100,
      },
      'admin-1',
      now,
    );
    rule.validate('validated', 'admin-2', new Date('2026-10-07T12:01:00.000Z'));
    expect(rule.toSnapshot().status).toBe('validated');

    rule.update({ meaning: 'Serie 6, una hilera' }, new Date('2026-10-07T12:02:00.000Z'));
    expect(rule.toSnapshot()).toMatchObject({ status: 'draft', validatedBy: null });
  });

  it('does not allow an ISO 15 calculation on arbitrary suffixes', () => {
    expect(() =>
      CodeAffix.create(
        {
          kind: 'suffix',
          token: '2RS',
          meaning: 'Dos sellos',
          attribute: null,
          impliedValue: null,
          brand: null,
          family: null,
          source: 'manual',
          confidence: null,
          evidence: null,
          boreRule: 'iso_15',
          priority: 0,
        },
        'admin-1',
        now,
      ),
    ).toThrow(/ISO 15/);
  });

  it('allows the bounded capture patterns used by the approved mockup', () => {
    expect(() =>
      CodeAffix.create(
        {
          kind: 'pattern',
          token: '^(\\d{1,3})\\s?[-X]\\s?(\\d{1,3})\\s?[-X]\\s?(\\d{1,2}(?:[.,]\\d)?)\\b',
          meaning: 'Medidas {1} × {2} × {3}',
          attribute: 'Medidas',
          impliedValue: '{1} × {2} × {3} mm',
          brand: null,
          family: 'Retenes y sellos',
          source: 'standard',
          confidence: 1,
          evidence: 'DIN 3760',
          boreRule: 'none',
          priority: 100,
        },
        'admin-1',
        now,
      ),
    ).not.toThrow();
  });

  it('rejects nested and ambiguous repeated groups', () => {
    const create = (token: string) =>
      CodeAffix.create(
        {
          kind: 'pattern',
          token,
          meaning: 'Regla insegura',
          attribute: null,
          impliedValue: null,
          brand: null,
          family: null,
          source: 'manual',
          confidence: null,
          evidence: null,
          boreRule: 'none',
          priority: 0,
        },
        'admin-1',
        now,
      );

    expect(() => create('(a+)+$')).toThrow(/unsupported/);
    expect(() => create('(a|aa)+$')).toThrow(/unsupported/);
  });

  it('rejects confidence precision that PostgreSQL would round silently', () => {
    expect(() =>
      CodeAffix.create(
        {
          kind: 'suffix',
          token: 'C3',
          meaning: 'Juego radial',
          attribute: null,
          impliedValue: null,
          brand: null,
          family: null,
          source: 'ai_suggestion',
          confidence: 0.9876,
          evidence: 'Catálogo',
          boreRule: 'none',
          priority: 10,
        },
        'admin-1',
        now,
      ),
    ).toThrow(/three decimal/);
  });
});
