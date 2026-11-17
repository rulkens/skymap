import type { SurfaceTileShading } from '../@types/SurfaceTileShading';
import { BODY_AMBIENT_LIGHT } from '../../../../../data/bodies/bodyAmbientLight';

/** orenNayarMatchedShading — tile shading whose sub-solar brightness matches
 *  the base globe's. Oren-Nayar's `A` (`lib/pbr.wesl`) against
 *  `bodyLighting.wesl`'s `litShade`: `sunIrradiance * A / PI = 1 - AMBIENT`,
 *  ignoring the GGX specular term (~0.0036 vs ~0.04 diffuse at Mars's dials),
 *  so tiles run slightly brighter there. */
export function orenNayarMatchedShading(roughness: number, f0: number): SurfaceTileShading {
  const orenNayarA = 1 - (0.5 * roughness ** 2) / (roughness ** 2 + 0.33);
  return {
    roughnessBase: roughness,
    f0,
    sunIrradiance: ((1 - BODY_AMBIENT_LIGHT) * Math.PI) / orenNayarA,
  };
}
