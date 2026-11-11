/** Expand one search term once; do not recurse through user-defined synonym cycles. */
export function expandCatalogSynonyms(
  term: string,
  rules: readonly { value: string; target: string | null }[],
): string[] {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLocaleLowerCase('es');
  return [
    ...new Set([
      term,
      ...rules
        .filter((rule) => normalize(rule.value) === normalize(term))
        .map((rule) => rule.target)
        .filter((value): value is string => Boolean(value)),
    ]),
  ];
}
