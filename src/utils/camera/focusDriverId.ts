/** The id the body-state / position-driver tables drive for this focus row, or
 * null when the row has none. Body rows only today; the starCatalog arm joins
 * in PR 2 (spec §2.5). */

import type { SelectionRow } from '../../@types/engine/SelectionRow';

export function focusDriverId(row: SelectionRow | null): string | null {
  return row !== null && row.type === 'body' ? row.id : null;
}
