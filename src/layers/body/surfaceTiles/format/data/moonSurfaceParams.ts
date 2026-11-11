/** moonSurfaceParams — the Moon's source sphere (LROC WAC and LOLA both sit on
 *  it), the datum rebase from it to the scene's Moon (+400 m), and the tile
 *  shading matched to the base globe. Shared by the body row and the bake. */

import { orenNayarMatchedShading } from '../utils/orenNayarMatchedShading';

export const MOON_SOURCE_SPHERE_RADIUS_M = 1_737_400;
export const MOON_DATUM_RADIUS_M = 1_737_000;
export const MOON_DATUM_OFFSET_M = MOON_SOURCE_SPHERE_RADIUS_M - MOON_DATUM_RADIUS_M;

// gdalinfo -mm on the LOLA LDEM 118 m COG, 2026-11-11.
export const MOON_SPHERE_RELIEF_M = [-9_128.5, 10_781.5] as const;

// Mars's roughness and f0; the 2026-11-11 eye check found no reason to differ.
export const MOON_SURFACE_SHADING = orenNayarMatchedShading(0.9, 0.03);
