/**
 * liveBodyPosition — the live world position of a selection row's body in a
 * body snapshot. The SINGLE resolution of that lookup; four callers share it
 * (the follow rows' target term, the frame-loop pivot pin, the NEAR0 selection
 * ring, and `liveFocusRow`'s off-frame debug read) rather than copying it.
 *
 * Answers WHERE, never WHETHER: null means only that the snapshot holds no
 * position for the row. "Does this body move" is `bodyMovesThisFrame` — the
 * snapshot carries static anchors too, so presence in it is not motion.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function liveBodyPosition(
  focusRow: SelectionRow | null,
  bodies: ReadonlyMap<string, BodyState>,
): Vec3 | null {
  if (focusRow === null || focusRow.type !== 'body') return null;
  return bodies.get(focusRow.id)?.positionMpc ?? null;
}
