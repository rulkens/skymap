import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyIsmMapGridRadius } from '../@types/GalaxyIsmMapGridRadius';
import { ismMapGridRadius } from './ismMapGridRadius';

/** Same bounds for a galaxy that may not be generated yet — the ismMap chain dispatches before geometry exists, and its grid must agree texel-for-texel with the orientation chain's. */
export function ismMapGridRadiusOrDefault(
  geometry: GalaxyDescription | null,
): GalaxyIsmMapGridRadius {
  return geometry ? ismMapGridRadius(geometry) : { rMin: 1e-3, rMax: 1 };
}
