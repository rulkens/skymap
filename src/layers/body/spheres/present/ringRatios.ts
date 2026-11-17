/** A body's ring radii in its radii, or `(0, 0)` (the textured fragment's "no ring" sentinel). */

import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';

export function ringRatios(body: PlanetBody, radiusM: number): { inner: number; outer: number } {
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  if (ring === undefined) return { inner: 0, outer: 0 };
  // The ring table is authored in km, the body in metres.
  const bodyRadiusKm = radiusM * SCALE_UNITS.M_TO_KM;
  return { inner: ring.innerRadiusKm / bodyRadiusKm, outer: ring.outerRadiusKm / bodyRadiusKm };
}
