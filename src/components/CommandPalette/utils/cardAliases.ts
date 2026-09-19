import type { PaletteCard } from '../../../@types/palette/PaletteCard';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';

/**
 * A focus card whose focus id matches a famous entry gets that entry's other
 * names as tooltip aliases (the entry's `names` minus the card's own label);
 * every other card — non-focus, or a focus id outside the famous atlas — has
 * none.
 */
export function cardAliases(
  card: PaletteCard,
  famous: readonly FamousGalaxyMetaEntry[],
): readonly string[] {
  if (card.action.kind !== 'focus') return [];
  const entry = famous.find((f) => f.id === card.action.focusId);
  if (!entry) return [];
  return entry.names.filter((name) => name !== card.label);
}
