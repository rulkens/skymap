/** Lists show two names then `+N`: `flow`, `flow, labels`, `flow, labels +2`. */
const SHOWN = 2;

export function formatNameList(names: readonly string[]): string {
  const shown = names.slice(0, SHOWN).join(', ');
  const rest = names.length - SHOWN;
  return rest > 0 ? `${shown} +${rest}` : shown;
}
