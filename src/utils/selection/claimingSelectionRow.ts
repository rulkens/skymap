/**
 * The one row whose `focusId` claims an id, or null. Two claims is a boot-shape bug and
 * throws rather than picking a winner, so the resolver and asset demand can never read
 * different kinds off the same pending id.
 */

import type { SelectionKindRow } from '../../@types/engine/layer/SelectionKindRow';

export function claimingSelectionRow(
  rows: readonly SelectionKindRow[],
  focusId: string,
): SelectionKindRow | null {
  const claiming = rows.filter((r) => r.focusId?.claims(focusId));
  if (claiming.length > 1) {
    throw new Error(
      `claimingSelectionRow: focus id "${focusId}" is claimed by more than one row (${claiming
        .map((r) => r.type)
        .join(', ')})`,
    );
  }
  return claiming[0] ?? null;
}
