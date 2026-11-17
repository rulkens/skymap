/**
 * One entry's distance-band value for one item at one eye: the product of the bands that
 * apply to the item. `in` and `out` use `smoothstep`, the curve `fadeBand` uses. Positions
 * come from `snapshot.bodyStates`, the same live map `sceneBodyStates` hands passes. It takes
 * an eye rather than a view so scene-body admission can measure at the frame camera.
 */

import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { BandEye } from '../../../@types/engine/presentation/BandEye';
import { smoothstep } from '../../../utils/math/smoothstep';
import { bandDistanceMpc } from './bandDistanceMpc';

export function bandValueOf(
  entry: VisibilityEntry,
  item: string | undefined,
  view: BandEye,
): number {
  if (entry.bands === undefined) return 1;
  let value = 1;
  for (const band of Object.values(entry.bands)) {
    if (band.items !== undefined && (item === undefined || !band.items.includes(item))) continue;
    const d = bandDistanceMpc(band, view.drawCamPos, view.snapshot.bodyStates);
    if (band.in) value *= smoothstep(band.in[0], band.in[1], d);
    if (band.out) value *= 1 - smoothstep(band.out[0], band.out[1], d);
  }
  return value;
}
