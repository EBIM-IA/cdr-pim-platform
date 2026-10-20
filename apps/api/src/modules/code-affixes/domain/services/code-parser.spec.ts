import { randomUUID } from 'node:crypto';

import type { Uuid } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import type { CodeAffixSnapshot } from '../entities/code-affix';
import { parseProductCode } from './code-parser';

const date = new Date('2026-10-07T12:00:00.000Z');
const rule = (
  partial: Pick<CodeAffixSnapshot, 'kind' | 'token' | 'meaning'> & Partial<CodeAffixSnapshot>,
): CodeAffixSnapshot => ({
  id: randomUUID() as Uuid,
  attribute: null,
  impliedValue: null,
  brand: null,
  family: null,
  source: 'standard',
  confidence: 1,
  status: 'validated',
  evidence: 'Catálogo técnico verificable',
  boreRule: 'none',
  priority: 0,
  active: true,
  createdBy: 'admin',
  validatedBy: 'admin',
  validatedAt: date,
  createdAt: date,
  updatedAt: date,
  ...partial,
});

describe('parseProductCode', () => {
  it('uses only persisted validated rules and calculates ISO bore with evidence', () => {
    const result = parseProductCode('6205-2RS-C3', [
      rule({ kind: 'series', token: '6', meaning: 'Serie 6', boreRule: 'iso_15' }),
      rule({ kind: 'suffix', token: '2RS', meaning: 'Dos sellos' }),
      rule({ kind: 'suffix', token: 'C3', meaning: 'Juego C3' }),
      rule({ kind: 'suffix', token: 'FAKE', meaning: 'No validado', status: 'draft' }),
    ]);

    expect(result.segments.map((segment) => [segment.kind, segment.text])).toEqual([
      ['series', '6'],
      ['dimension', '2'],
      ['bore', '05'],
      ['suffix', '2RS'],
      ['suffix', 'C3'],
    ]);
    expect(result.segments.find((segment) => segment.kind === 'bore')).toMatchObject({
      boreMillimeters: 25,
      evidence: 'Catálogo técnico verificable',
    });
  });

  it('does not calculate a bore when the persisted series has no applicable rule', () => {
    const result = parseProductCode('6205', [
      rule({ kind: 'series', token: '6', meaning: 'Serie sin regla de agujero' }),
    ]);
    expect(result.segments.map((segment) => segment.kind)).toEqual(['series', 'number']);
    expect(result.segments.every((segment) => segment.boreMillimeters === null)).toBe(true);
  });

  it('leaves unknown pieces explicit instead of inventing a meaning', () => {
    const result = parseProductCode('ABC-XYZ', []);
    expect(result.segments).toEqual([
      expect.objectContaining({ kind: 'unknown', text: 'ABC' }),
      expect.objectContaining({ kind: 'unknown', text: 'XYZ' }),
    ]);
  });

  it('does not apply brand or family scoped rules without matching context', () => {
    const scoped = rule({
      kind: 'suffix',
      token: 'C3',
      meaning: 'Regla exclusiva FAG',
      brand: 'FAG',
      family: 'Rodamientos',
    });

    expect(parseProductCode('C3', [scoped]).segments[0]).toMatchObject({
      kind: 'unknown',
      ruleId: null,
    });
    expect(
      parseProductCode('C3', [scoped], { brand: 'fag', family: 'rodamientos' }).segments[0],
    ).toMatchObject({ kind: 'suffix', ruleId: scoped.id });
  });

  it('matches approved patterns inside a code and interpolates captured values', () => {
    const result = parseProductCode('BANDA 6PK1875 CONTITECH', [
      rule({
        kind: 'pattern',
        token: '(\\d{1,2})\\s?PK\\s?(\\d{3,4})',
        meaning: 'Banda PK: {1} canales, {2} mm',
        impliedValue: '{1} canales · {2} mm',
      }),
    ]);

    expect(result.segments[0]).toMatchObject({
      kind: 'pattern',
      text: '6PK1875',
      meaning: 'Banda PK: 6 canales, 1875 mm',
      impliedValue: '6 canales · 1875 mm',
    });
  });
});
