/** iceKeepWeight — how much of a pixel's ORIGINAL luminance to keep instead
 *  of the de-shaded/kneed value (design §8 step 4): three independent gates
 *  — polar, white, bright — since a shaded rock at the pole or a bright dust
 *  patch near the equator is not ice and should still get corrected. */
import { smoothstep } from '../../../src/utils/math/smoothstep';
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';

const ICE_SOFT = 0.2;

export function iceKeepWeight(
  absLatDeg: number,
  whiteness: number,
  luminance: number,
  ice: AlbedoRecipe['ice'],
): number {
  const latWeight = smoothstep(ice.minAbsLatDeg, ice.minAbsLatDeg + ice.fadeDeg, absLatDeg);
  const whiteWeight = smoothstep(ice.minWhiteness, ice.minWhiteness + ICE_SOFT, whiteness);
  const lumWeight = smoothstep(ice.minLuminance, ice.minLuminance + ICE_SOFT, luminance);
  return latWeight * whiteWeight * lumWeight;
}
