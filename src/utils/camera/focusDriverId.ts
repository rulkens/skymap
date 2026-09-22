/** The id the body-state / position-driver tables drive for this focus row, or
 * null when the row has none: a body row and a seeded star row carry one (an
 * S-star's position comes from the same table a planet's does), a survey star
 * and every other arm do not. */

import type { SelectionRow } from '../../@types/engine/SelectionRow';

export function focusDriverId(row: SelectionRow | null): string | null {
  if (row === null) return null;
  if (row.type === 'body') return row.id;
  return row.type === 'starCatalog' ? row.id : null;
}
