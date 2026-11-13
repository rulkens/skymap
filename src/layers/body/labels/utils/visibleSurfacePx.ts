/**
 * visibleSurfacePx — the device px of a surface point, or, when it lies past the limb,
 * of the last point the eye still sees on the way from it back to `from` (stepped in
 * latitude and longitude): the edge of what a name names, as seen. Null when even
 * `from` is hidden or behind the camera.
 */

import type { Vec2 } from '../../../../@types/math/Vec2';
import type { AntiqueBodyView } from '../@types/AntiqueBodyView';

const STEPS = 12;

export function visibleSurfacePx(
  view: AntiqueBodyView,
  latDeg: number,
  lonDeg: number,
  fromLatDeg: number,
  fromLonDeg: number,
): Vec2 | null {
  for (let k = 0; k <= STEPS; k++) {
    const t = 1 - k / STEPS;
    const lat = fromLatDeg + t * (latDeg - fromLatDeg);
    const lon = fromLonDeg + t * (lonDeg - fromLonDeg);
    if (view.facing(lat, lon) > 0) return view.project(lat, lon);
  }
  return null;
}
