import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import type { DetailCardTable } from '../../@types/components/infoCard/DetailCardTable';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';

/** The table's row for `target`. TypeScript cannot correlate `table[target.type]`
 * with `target` across the union, so the widening happens here, once. */
export function detailCardFor(table: DetailCardTable, target: FocusableTarget): DetailCardEntry {
  return table[target.type] as DetailCardEntry;
}
