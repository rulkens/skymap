/**
 * liveFocusRow — the focused SelectionRow with its `positionMpc` corrected to
 * the LIVE value, for debug tooling that runs OUTSIDE the frame loop.
 *
 * Only the 'body', 'craft' and 'earthScene' arms ever go stale: the composed resolver's `extractRow` resolves them once,
 * at the hardcoded CONST_J2000 epoch (see its header), so a row read long
 * after selection can sit years off the pose it's dumped next to. Every other
 * arm already carries a live-resolved position. Identity fields
 * (type/id/label) pass through unchanged.
 */

import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { liveBodyPosition } from '../camera/liveBodyPosition';

export function liveFocusRow(focusRow: SelectionRow | null, simDays: number): SelectionRow | null {
  if (
    focusRow === null ||
    (focusRow.type !== 'body' && focusRow.type !== 'craft' && focusRow.type !== 'earthScene')
  )
    return focusRow;
  const positionMpc = liveBodyPosition(focusRow, deriveBodyStates(simDays));
  return positionMpc === null ? focusRow : { ...focusRow, positionMpc };
}
