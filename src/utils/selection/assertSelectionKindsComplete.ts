import type { SelectionKindFacts } from '../../@types/engine/layer/SelectionKindFacts';

/** Boot check over one composition: no kind type declared twice, every runtime row's type has facts. */
export function assertSelectionKindsComplete(
  kinds: readonly SelectionKindFacts[],
  rowTypes: readonly string[],
): void {
  const types = new Set<string>();
  for (const { type } of kinds) {
    if (types.has(type)) {
      throw new Error(`assertSelectionKindsComplete: kind "${type}" is declared twice`);
    }
    types.add(type);
  }
  const missing = rowTypes.filter((type) => !types.has(type));
  if (missing.length > 0) {
    throw new Error(`assertSelectionKindsComplete: rows with no kind facts: ${missing.join(', ')}`);
  }
}
