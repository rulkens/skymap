/** marsSurfaceParams — Mars's IAU sphere, the datum rebase from it (+6,190 m,
 *  spec §4.3), and the tile shading matched to the base globe. */

import type { SurfaceTileShading } from '../../@types/data/SurfaceTileShading';
import { BODY_AMBIENT_LIGHT } from './bodyAmbientLight';

export const MARS_IAU_SPHERE_RADIUS_M = 3_396_190;
export const MARS_DATUM_RADIUS_M = 3_390_000;
export const MARS_DATUM_OFFSET_M = MARS_IAU_SPHERE_RADIUS_M - MARS_DATUM_RADIUS_M;

// gdalinfo -mm on the MOLA COG, 2026-09-17.
export const MARS_AREOID_RELIEF_M = [-8_201, 21_241] as const;

const MARS_ROUGHNESS = 0.9;

// Oren-Nayar's `A` (`lib/pbr.wesl`): matches `bodyLighting.wesl`'s `litShade`
// sub-solar term, `sunIrradiance * A / PI = 1 - AMBIENT` — ignoring the GGX
// specular term (~0.0036 vs ~0.04 diffuse here), so tiles run brighter there.
const OREN_NAYAR_A = 1 - (0.5 * MARS_ROUGHNESS ** 2) / (MARS_ROUGHNESS ** 2 + 0.33);

export const MARS_SURFACE_SHADING: SurfaceTileShading = {
  roughnessBase: MARS_ROUGHNESS,
  f0: 0.03,
  sunIrradiance: ((1 - BODY_AMBIENT_LIGHT) * Math.PI) / OREN_NAYAR_A,
};
