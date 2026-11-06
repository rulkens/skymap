/**
 * The camera's distance from a band's `from`, in Mpc: the render origin when omitted, a
 * region's anchor, or a body's live position from `bodyStates`. A body the map lacks reads
 * Infinity, as an unresolved anchor does. Shared by the fade (`bandValueOf`) and asset demand.
 */

import type { EntryBand } from '../../../@types/engine/layer/EntryBand';
import type { BandEye } from '../../../@types/engine/presentation/BandEye';
import type { Vec3 } from '../../../@types/math/Vec3';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { isBodyRegionId } from '../../../utils/regions/isBodyRegionId';
import { regionById } from '../../../utils/regions/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';

export function bandDistanceMpc(
  band: EntryBand,
  camPosMpc: Readonly<Vec3>,
  bodyStates: BandEye['snapshot']['bodyStates'],
): number {
  const from = band.from;
  if (from === undefined) return Math.hypot(camPosMpc[0], camPosMpc[1], camPosMpc[2]);
  if (isBodyRegionId(from)) {
    return regionRelativeDistanceMpc(camPosMpc, regionById(from), bodyStates);
  }
  const body = bodyStates.get(from);
  return body === undefined ? Infinity : distanceMpc(camPosMpc, body.positionMpc);
}
