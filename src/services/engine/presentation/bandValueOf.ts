/**
 * One entry's distance-band value for one item at one eye: the product of the bands that
 * apply to the item. `in` and `out` use `smoothstep`, the curve `fadeBand` uses. The region anchor's position comes from
 * `snapshot.bodyStates`, the same map `sceneBodyStates` hands passes. It takes an eye rather
 * than a view so scene-body admission can measure at the frame camera.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { Vec3 } from '../../../@types/math/Vec3';
import { smoothstep } from '../../../utils/math/smoothstep';
import { regionById } from '../../../utils/regions/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/regions/regionRelativeDistanceMpc';

export function bandValueOf(
  entry: VisibilityEntry,
  item: string | undefined,
  view: { drawCamPos: Readonly<Vec3>; snapshot: Pick<ReadyFrameContext, 'bodyStates'> },
): number {
  if (entry.bands === undefined) return 1;
  const [x, y, z] = view.drawCamPos;
  let value = 1;
  for (const band of Object.values(entry.bands)) {
    if (band.items !== undefined && (item === undefined || !band.items.includes(item))) continue;
    const d =
      band.from === undefined
        ? Math.hypot(x, y, z)
        : regionRelativeDistanceMpc(
            view.drawCamPos,
            regionById(band.from),
            view.snapshot.bodyStates,
          );
    if (band.in) value *= smoothstep(band.in[0], band.in[1], d);
    if (band.out) value *= 1 - smoothstep(band.out[0], band.out[1], d);
  }
  return value;
}
