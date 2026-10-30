/**
 * One entry's distance-band value for one item at one eye: the product of the bands that
 * apply to the item. `in` and `out` use `smoothstep`, the curve `fadeBand` uses. A region
 * anchor's or a body's position comes from `snapshot.bodyStates`, the same live map
 * `sceneBodyStates` hands passes; a body it lacks reads Infinity, as an unresolved anchor
 * does. It takes an eye rather than a view so scene-body admission can measure at the frame
 * camera.
 */

import type { EntryBand } from '../../../@types/engine/layer/EntryBand';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { BandEye } from '../../../@types/engine/presentation/BandEye';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { smoothstep } from '../../../utils/math/smoothstep';
import { isBodyRegionId } from '../../../utils/regions/isBodyRegionId';
import { regionById } from '../../../utils/regions/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';

function distanceFrom(from: NonNullable<EntryBand['from']>, view: BandEye): number {
  if (isBodyRegionId(from)) {
    return regionRelativeDistanceMpc(view.drawCamPos, regionById(from), view.snapshot.bodyStates);
  }
  const body = view.snapshot.bodyStates.get(from);
  return body === undefined ? Infinity : distanceMpc(view.drawCamPos, body.positionMpc);
}

export function bandValueOf(
  entry: VisibilityEntry,
  item: string | undefined,
  view: BandEye,
): number {
  if (entry.bands === undefined) return 1;
  const [x, y, z] = view.drawCamPos;
  let value = 1;
  for (const band of Object.values(entry.bands)) {
    if (band.items !== undefined && (item === undefined || !band.items.includes(item))) continue;
    const d = band.from === undefined ? Math.hypot(x, y, z) : distanceFrom(band.from, view);
    if (band.in) value *= smoothstep(band.in[0], band.in[1], d);
    if (band.out) value *= 1 - smoothstep(band.out[0], band.out[1], d);
  }
  return value;
}
