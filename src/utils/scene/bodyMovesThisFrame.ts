import type { SelectionRow } from '../../@types/engine/SelectionRow';
import { bodyFollowsSimClock } from './bodyFollowsSimClock';

/**
 * bodyMovesThisFrame — is the focused row a body the sim clock propagates?
 * Deliberately NOT presence in the derived body-state map: static anchors
 * (the Sun, the famous stars) have a position but no orbit, so
 * `liveBodyPosition(...) !== null` answers "has a position", not "moves".
 */
export function bodyMovesThisFrame(focusRow: SelectionRow | null): boolean {
  if (focusRow === null || focusRow.type !== 'body') return false;
  return bodyFollowsSimClock(focusRow.id);
}
