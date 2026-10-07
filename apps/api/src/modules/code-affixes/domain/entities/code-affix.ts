import { type Uuid, ValidationError, newUuid } from '@cdr/shared';

export type CodeAffixKind = 'prefix' | 'series' | 'suffix' | 'pattern';
export type CodeAffixSource = 'manual' | 'manufacturer' | 'standard' | 'import' | 'ai_suggestion';
export type CodeAffixStatus = 'draft' | 'pending_validation' | 'validated' | 'rejected';
export type CodeAffixBoreRule = 'none' | 'iso_15';

export interface CodeAffixSnapshot {
  readonly id: Uuid;
  readonly kind: CodeAffixKind;
  readonly token: string;
  readonly meaning: string;
  readonly attribute: string | null;
  readonly impliedValue: string | null;
  readonly brand: string | null;
  readonly family: string | null;
  readonly source: CodeAffixSource;
  readonly confidence: number | null;
  readonly status: CodeAffixStatus;
  readonly evidence: string | null;
  readonly boreRule: CodeAffixBoreRule;
  readonly priority: number;
  readonly active: boolean;
  readonly createdBy: string;
  readonly validatedBy: string | null;
  readonly validatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type EditableCodeAffix = Pick<
  CodeAffixSnapshot,
  | 'kind'
  | 'token'
  | 'meaning'
  | 'attribute'
  | 'impliedValue'
  | 'brand'
  | 'family'
  | 'source'
  | 'confidence'
  | 'evidence'
  | 'boreRule'
  | 'priority'
>;

export class CodeAffix {
  private constructor(private state: CodeAffixSnapshot) {}

  static create(input: EditableCodeAffix & { id?: Uuid }, actorId: string, now: Date): CodeAffix {
    const fields = normalize(input);
    validate(fields);
    return new CodeAffix({
      id: input.id ?? newUuid(),
      ...fields,
      status: input.source === 'ai_suggestion' ? 'pending_validation' : 'draft',
      active: true,
      createdBy: actorId,
      validatedBy: null,
      validatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: CodeAffixSnapshot): CodeAffix {
    return new CodeAffix(snapshot);
  }

  update(input: Partial<EditableCodeAffix>, now: Date): void {
    const next = normalize({
      kind: input.kind ?? this.state.kind,
      token: input.token ?? this.state.token,
      meaning: input.meaning ?? this.state.meaning,
      attribute: input.attribute === undefined ? this.state.attribute : input.attribute,
      impliedValue: input.impliedValue === undefined ? this.state.impliedValue : input.impliedValue,
      brand: input.brand === undefined ? this.state.brand : input.brand,
      family: input.family === undefined ? this.state.family : input.family,
      source: input.source ?? this.state.source,
      confidence: input.confidence === undefined ? this.state.confidence : input.confidence,
      evidence: input.evidence === undefined ? this.state.evidence : input.evidence,
      boreRule: input.boreRule ?? this.state.boreRule,
      priority: input.priority ?? this.state.priority,
    });
    validate(next);
    this.state = {
      ...this.state,
      ...next,
      status: next.source === 'ai_suggestion' ? 'pending_validation' : 'draft',
      validatedBy: null,
      validatedAt: null,
      updatedAt: now,
    };
  }

  validate(decision: 'validated' | 'rejected', actorId: string, now: Date): void {
    if (decision === 'validated' && !this.state.evidence) {
      throw new ValidationError('A code-affix rule requires evidence before validation');
    }
    this.state = {
      ...this.state,
      status: decision,
      validatedBy: actorId,
      validatedAt: now,
      updatedAt: now,
    };
  }

  deactivate(now: Date): void {
    this.state = { ...this.state, active: false, updatedAt: now };
  }

  toSnapshot(): CodeAffixSnapshot {
    return { ...this.state };
  }
}

function normalize(input: EditableCodeAffix): EditableCodeAffix {
  const nullable = (value: string | null): string | null => {
    const text = value?.trim() ?? '';
    return text.length > 0 ? text : null;
  };
  return {
    kind: input.kind,
    token: input.kind === 'pattern' ? input.token.trim() : input.token.trim().toUpperCase(),
    meaning: input.meaning.trim(),
    attribute: nullable(input.attribute),
    impliedValue: nullable(input.impliedValue),
    brand: nullable(input.brand)?.toUpperCase() ?? null,
    family: nullable(input.family),
    source: input.source,
    confidence: input.confidence,
    evidence: nullable(input.evidence),
    boreRule: input.boreRule,
    priority: input.priority,
  };
}

function validate(input: EditableCodeAffix): void {
  if (!input.token || !input.meaning) {
    throw new ValidationError('Code-affix token and meaning are required');
  }
  if (input.confidence !== null && (input.confidence < 0 || input.confidence > 1)) {
    throw new ValidationError('Code-affix confidence must be between 0 and 1');
  }
  if (
    input.confidence !== null &&
    Math.abs(input.confidence * 1_000 - Math.round(input.confidence * 1_000)) > 1e-9
  ) {
    throw new ValidationError('Code-affix confidence supports at most three decimal places');
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1_000) {
    throw new ValidationError('Code-affix priority must be an integer between 0 and 1000');
  }
  if (input.boreRule === 'iso_15' && input.kind !== 'series') {
    throw new ValidationError('ISO 15 bore calculation is only valid for a series rule');
  }
  if (input.kind === 'pattern') validatePattern(input.token);
}

function validatePattern(pattern: string): void {
  if (pattern.length > 200 || /\(\?[=!<]|\\[1-9]/.test(pattern) || hasUnsafeRepetition(pattern)) {
    throw new ValidationError('Pattern uses an unsupported regular-expression feature');
  }
  try {
    new RegExp(pattern, 'i');
  } catch {
    throw new ValidationError('Pattern is not a valid regular expression');
  }
}

/**
 * Reject the common catastrophic-backtracking shapes while retaining the small pattern
 * language used by the approved prototype (captures, non-capturing groups and bounded
 * repetitions). A repeated group may not itself contain a repetition or alternation.
 * Product codes are additionally capped at 120 characters by the HTTP contract.
 */
function hasUnsafeRepetition(pattern: string): boolean {
  const groups: { repeatedInside: boolean; alternation: boolean }[] = [];
  let inCharacterClass = false;
  let escaped = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '[') {
      inCharacterClass = true;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (inCharacterClass) continue;

    if (character === '(') {
      groups.push({ repeatedInside: false, alternation: false });
      if (pattern[index + 1] === '?' && pattern[index + 2] === ':') index += 2;
      continue;
    }
    if (character === '|') {
      const current = groups.at(-1);
      if (current) current.alternation = true;
      continue;
    }
    if (character === ')') {
      const group = groups.pop();
      if (!group) continue;
      const quantifier = readQuantifier(pattern, index + 1);
      if (quantifier && (group.repeatedInside || group.alternation)) return true;
      if (quantifier) {
        const parent = groups.at(-1);
        if (parent) parent.repeatedInside = true;
      }
      continue;
    }
    if (isQuantifierStart(pattern, index)) {
      const current = groups.at(-1);
      if (current) current.repeatedInside = true;
    }
  }
  return false;
}

function readQuantifier(pattern: string, index: number): boolean {
  const character = pattern[index];
  return character === '*' || character === '+' || character === '?' || character === '{';
}

function isQuantifierStart(pattern: string, index: number): boolean {
  const character = pattern[index];
  if (character === '*' || character === '+' || character === '?') return true;
  return character === '{' && /^\{\d+(?:,\d*)?\}/.test(pattern.slice(index));
}
