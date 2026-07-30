/**
 * pivotRadiusMpc — the physical radius (Mpc) of whatever sits at the camera's
 * orbit pivot, or `null` when the pivot has no surface.
 *
 * `clampDistance` needs a radius to stand its floor off from, and the only thing
 * that knows there IS a radius is the resolved focus row. This is the one place
 * that maps a `SelectionRow` onto that argument, so the zoom floor, the pinch
 * floor, and the follow driver's distance target all derive it from the same
 * rule instead of each carrying its own copy of "which rows have a surface".
 *
 * Which arms return a radius follows the pivot-pin, not the row's size: the
 * frame loop pins the orbit pivot to a focused BODY (see `cameraDrivers`'
 * `pivotsOnFocusedBody`), so a body — and a survey star, the same near-field
 * discrete case — is a surface the camera can crash into. A galaxy, a structure,
 * or the Milky Way is a volume the camera flies INTO; its extent is a fly-past
 * offset (`focusFraming`'s `radius`), never a floor, so those arms are `null`
 * and stay on the absolute floor.
 */

import { SCALE_UNITS } from '../../../data/scaleUnits';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function pivotRadiusMpc(row: SelectionRow | null): number | null {
  if (row === null) return null;
  if (row.type !== 'body' && row.type !== 'star') return null;
  return row.radiusKm * SCALE_UNITS.KM_TO_MPC;
}
