import type { Uuid } from '@cdr/shared';

import type { CodeAffixSnapshot } from '../entities/code-affix';

export interface ParsedCodeSegment {
  readonly kind:
    'prefix' | 'series' | 'suffix' | 'pattern' | 'dimension' | 'bore' | 'number' | 'unknown';
  readonly text: string;
  readonly ruleId: Uuid | null;
  readonly meaning: string | null;
  readonly attribute: string | null;
  readonly impliedValue: string | null;
  readonly source: CodeAffixSnapshot['source'] | null;
  readonly confidence: number | null;
  readonly evidence: string | null;
  readonly boreMillimeters: number | null;
}

export interface ParsedProductCode {
  readonly code: string;
  readonly normalizedCode: string;
  readonly segments: readonly ParsedCodeSegment[];
}

export interface ProductCodeContext {
  readonly brand?: string;
  readonly family?: string;
}

const SEPARATOR = /[-_/\s.]/;

export function parseProductCode(
  rawCode: string,
  persistedRules: readonly CodeAffixSnapshot[],
  context: ProductCodeContext = {},
): ParsedProductCode {
  const normalizedCode = rawCode.trim().toUpperCase();
  const normalizedBrand = context.brand?.trim().toUpperCase();
  const normalizedFamily = context.family?.trim().toUpperCase();
  const rules = persistedRules
    .filter(
      (rule) =>
        rule.active &&
        rule.status === 'validated' &&
        rule.evidence &&
        (!rule.brand || rule.brand.toUpperCase() === normalizedBrand) &&
        (!rule.family || rule.family.toUpperCase() === normalizedFamily),
    )
    .sort(
      (left, right) => right.priority - left.priority || right.token.length - left.token.length,
    );
  const patterns = rules.filter((rule) => rule.kind === 'pattern');
  for (const rule of patterns) {
    const match = new RegExp(rule.token, 'i').exec(normalizedCode);
    if (match?.[0]) {
      return {
        code: rawCode,
        normalizedCode,
        segments: [segmentFromRule('pattern', match[0], rule, match)],
      };
    }
  }

  const segments: ParsedCodeSegment[] = [];
  let cursor = 0;
  while (SEPARATOR.test(normalizedCode[cursor] ?? '')) cursor += 1;

  const prefix = longestAt(rules, 'prefix', normalizedCode, cursor);
  if (prefix) {
    segments.push(
      segmentFromRule('prefix', normalizedCode.slice(cursor, cursor + prefix.token.length), prefix),
    );
    cursor += prefix.token.length;
    while (SEPARATOR.test(normalizedCode[cursor] ?? '')) cursor += 1;
  }

  const series = longestAt(rules, 'series', normalizedCode, cursor);
  if (series) {
    segments.push(
      segmentFromRule('series', normalizedCode.slice(cursor, cursor + series.token.length), series),
    );
    cursor += series.token.length;
  }

  const numeric = /^\d+/.exec(normalizedCode.slice(cursor))?.[0] ?? '';
  if (numeric) {
    if (series?.boreRule === 'iso_15' && series.evidence && numeric.length >= 2) {
      const dimension = numeric.slice(0, -2);
      const boreCode = numeric.slice(-2);
      if (dimension) segments.push(emptySegment('dimension', dimension, 'Serie de dimensiones'));
      const millimeters = isoBoreMillimeters(boreCode);
      segments.push({
        ...emptySegment('bore', boreCode, 'Código de agujero ISO 15'),
        ruleId: series.id,
        source: series.source,
        confidence: series.confidence,
        evidence: series.evidence,
        boreMillimeters: millimeters,
        impliedValue: millimeters === null ? null : `${millimeters} mm`,
      });
    } else {
      segments.push(emptySegment('number', numeric, 'Número base del código'));
    }
    cursor += numeric.length;
  }

  while (cursor < normalizedCode.length) {
    if (SEPARATOR.test(normalizedCode[cursor] ?? '')) {
      cursor += 1;
      continue;
    }
    const suffix = longestAt(rules, 'suffix', normalizedCode, cursor);
    if (suffix) {
      segments.push(
        segmentFromRule(
          'suffix',
          normalizedCode.slice(cursor, cursor + suffix.token.length),
          suffix,
        ),
      );
      cursor += suffix.token.length;
      continue;
    }
    const start = cursor;
    cursor += 1;
    while (
      cursor < normalizedCode.length &&
      !SEPARATOR.test(normalizedCode[cursor] ?? '') &&
      !longestAt(rules, 'suffix', normalizedCode, cursor)
    ) {
      cursor += 1;
    }
    segments.push(emptySegment('unknown', normalizedCode.slice(start, cursor), null));
  }

  return { code: rawCode, normalizedCode, segments };
}

function longestAt(
  rules: readonly CodeAffixSnapshot[],
  kind: CodeAffixSnapshot['kind'],
  code: string,
  cursor: number,
): CodeAffixSnapshot | undefined {
  return rules
    .filter((rule) => rule.kind === kind)
    .find((rule) => code.slice(cursor).startsWith(rule.token.toUpperCase()));
}

function segmentFromRule(
  kind: 'prefix' | 'series' | 'suffix' | 'pattern',
  text: string,
  rule: CodeAffixSnapshot,
  captures?: RegExpExecArray,
): ParsedCodeSegment {
  return {
    kind,
    text,
    ruleId: rule.id,
    meaning: interpolateCaptures(rule.meaning, captures),
    attribute: rule.attribute,
    impliedValue: interpolateCaptures(rule.impliedValue, captures),
    source: rule.source,
    confidence: rule.confidence,
    evidence: rule.evidence,
    boreMillimeters: null,
  };
}

function interpolateCaptures(value: string | null, captures?: RegExpExecArray): string | null {
  if (!value || !captures) return value;
  return value.replace(/\{(\d+)\}/g, (placeholder, rawIndex: string) => {
    const replacement = captures[Number(rawIndex)];
    return replacement === undefined ? placeholder : replacement;
  });
}

function emptySegment(
  kind: ParsedCodeSegment['kind'],
  text: string,
  meaning: string | null,
): ParsedCodeSegment {
  return {
    kind,
    text,
    ruleId: null,
    meaning,
    attribute: null,
    impliedValue: null,
    source: null,
    confidence: null,
    evidence: null,
    boreMillimeters: null,
  };
}

function isoBoreMillimeters(code: string): number | null {
  if (!/^\d{2}$/.test(code)) return null;
  const special: Record<string, number> = { '00': 10, '01': 12, '02': 15, '03': 17 };
  if (special[code] !== undefined) return special[code];
  const value = Number(code);
  return value >= 4 && value <= 96 ? value * 5 : null;
}
