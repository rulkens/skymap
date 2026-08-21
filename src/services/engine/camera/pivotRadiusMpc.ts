/**
 * pivotRadiusMpc — the physical radius (Mpc) of whatever sits at the camera's
 * orbit pivot, or `null` when the pivot has no surface.
 *
 * The one place that answers "does the pivot have a surface, and how big is
 * it" — the zoom's standoff floor, the orbit-drag rate's ground-tracking
 * denominator, and the near-plane bracket all derive it from this one rule. A
 * body or survey star is a surface the camera can crash into; a galaxy, a
 * structure, or the Milky Way is a volume the camera flies INTO, so those stay
 * `null` and unfloored.
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function pivotRadiusMpc(row: SelectionRow | null): number | null {
  if (row === null) return null;
  if (row.type !== 'body' && row.type !== 'star') return null;
  return row.radiusKm * SCALE_UNITS.KM_TO_MPC;
}
