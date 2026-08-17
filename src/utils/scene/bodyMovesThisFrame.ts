import type { SelectionRow } from '../../@types/engine/SelectionRow';
import { ORBITAL_ELEMENTS } from '../../data/bodies/orbitalElements';

/**
 * bodyMovesThisFrame — is the focused row a body the sim clock propagates?
 *
 * Membership in `ORBITAL_ELEMENTS`, deliberately NOT presence in the derived
 * body-state map: that map also holds static anchors (the Sun, the famous
 * stars), which have a position but no orbit, so `liveBodyPosition(...) !== null`
 * answers "has a position", not "moves". The follow driver, the focus-tween skip
 * and the pivot pin all want the latter — they ask here, and take the position
 * itself from `liveBodyPosition`.
 */
export function bodyMovesThisFrame(focusRow: SelectionRow | null): boolean {
  if (focusRow === null || focusRow.type !== 'body') return false;
  const { id } = focusRow;
  return ORBITAL_ELEMENTS.some((el) => el.id === id);
}
