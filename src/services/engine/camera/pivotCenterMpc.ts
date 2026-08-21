/**
 * pivotCenterMpc — the live world-space centre (Mpc) of whatever sits at the
 * camera's orbit pivot, or `null` when the pivot has no surface. The centre
 * half of the question `pivotRadiusMpc` answers the radius half of — the two
 * together are `eyeAltitudeMpc`'s `bodyCenterMpc`/`bodyRadiusMpc` inputs.
 *
 * A body's centre moves under the sim clock, so it is resolved from the live
 * `deriveBodyStates(simDays)` snapshot rather than the row's own snapshot-at-
 * select-time `positionMpc` field (which a moving body quickly outgrows); a
 * star's `positionMpc` is a fixed catalog value, read straight off the row.
 */

import { deriveBodyStates } from '../frame/deriveBodyStates';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function pivotCenterMpc(row: SelectionRow | null, simDays: number): Vec3 | null {
  if (row === null) return null;
  if (row.type === 'body') return deriveBodyStates(simDays).get(row.id)?.positionMpc ?? null;
  if (row.type === 'star') return row.positionMpc;
  return null;
}
