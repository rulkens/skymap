/**
 * marsSurfaceParams — Mars's surface constants shared by the scene row, the
 * tile registry and the terrain bake. Every Mars source (MOLA, HiRISE) gives
 * heights above the areoid on this sphere; the scene datum sits 6,190 m lower.
 */

import type { SurfaceTileShading } from '../../@types/data/SurfaceTileShading';
import { BODY_AMBIENT_LIGHT } from './bodyAmbientLight';

/** IAU 2000 mean radius, the reference sphere of every Mars raster we bake. */
export const MARS_IAU_SPHERE_RADIUS_M = 3_396_190;

/** MOLA 463 m global min/max, metres above the areoid (`gdalinfo -mm` on the
 *  COG, 2026-09-17; the published extremes are the same). The HiRISE site
 *  DTMs lie well inside. */
export const MARS_AREOID_RELIEF_M = [-8_201, 21_241] as const;

/** Dry regolith: rough and dielectric. */
const MARS_ROUGHNESS = 0.9;

/** Oren-Nayar's `A` term (`lib/pbr.wesl` `orenNayarDiffuse`) at `MARS_ROUGHNESS`:
 *  the diffuse BRDF at the sub-solar point seen from the sun is `A / PI`. */
const OREN_NAYAR_A = 1 - (0.5 * MARS_ROUGHNESS ** 2) / (MARS_ROUGHNESS ** 2 + 0.33);

/**
 * The textured globe shades `albedo * (AMBIENT + (1 - AMBIENT) * NoL)`
 * (`lib/bodyLighting.wesl` `litShade`); the bare tile fragment shades
 * `pbrDirect * sunIrradiance + ambient * albedo`. Equal direct terms at the
 * sub-solar point give `sunIrradiance * A / PI = 1 - AMBIENT`. The globe's
 * Minnaert limb term has no tile counterpart, so the terminator may still step.
 */
export const MARS_SURFACE_SHADING: SurfaceTileShading = {
  roughnessBase: MARS_ROUGHNESS,
  f0: 0.03,
  sunIrradiance: ((1 - BODY_AMBIENT_LIGHT) * Math.PI) / OREN_NAYAR_A,
};
