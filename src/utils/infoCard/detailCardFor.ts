import type { FocusableTargetBase } from '../../@types/engine/selection/FocusableTargetBase';
import type { DetailCardTable } from '../../@types/components/infoCard/DetailCardTable';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';

/** The table's card pair for `target`'s kind; `detailCardTable` refused a kind with none at boot. */
export function detailCardFor(
  table: DetailCardTable,
  target: FocusableTargetBase,
): DetailCardEntry {
  const entry = table.get(target.type);
  if (entry === undefined) throw new Error(`detailCardFor: no card for kind "${target.type}"`);
  return entry;
}
