/**
 * Reasoning models do not accept the same sampling controls as classic chat models.
 * Keeping that compatibility decision at the adapter boundary lets deployments change the
 * configured model without changing any application use case.
 */
export function responseTuning(
  model: string,
  temperature: number,
): { readonly reasoning: { readonly effort: 'low' } } | { readonly temperature: number } {
  return usesReasoning(model) ? { reasoning: { effort: 'low' } } : { temperature };
}

function usesReasoning(model: string): boolean {
  return /^(?:gpt-[56](?:\.|-|$)|o[134](?:-|$))/u.test(model.toLocaleLowerCase('en'));
}
