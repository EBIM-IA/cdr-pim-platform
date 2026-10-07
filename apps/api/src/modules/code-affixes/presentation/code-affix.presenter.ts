import type { CodeAffixDto, ParsedProductCodeDto } from '@cdr/contracts';

import type { CodeAffix } from '../domain/entities/code-affix';
import type { ParsedProductCode } from '../domain/services/code-parser';

export function toCodeAffixDto(rule: CodeAffix): CodeAffixDto {
  const value = rule.toSnapshot();
  return {
    ...value,
    validatedAt: value.validatedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

export function toParsedProductCodeDto(result: ParsedProductCode): ParsedProductCodeDto {
  return { ...result, segments: result.segments.map((segment) => ({ ...segment })) };
}
