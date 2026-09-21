/** The id the body-state / position-driver tables drive for this focus row, or
 * null when the row has none: only the `body` arm carries such an id, every
 * other arm returns null. */

import type { SelectionRow } from '../../@types/engine/SelectionRow';

export function focusDriverId(row: SelectionRow | null): string | null {
  return row !== null && row.type === 'body' ? row.id : null;
}
