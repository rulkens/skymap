/** marsSurfaceParams — Mars's IAU sphere, the datum rebase from it (+6,190 m,
 *  spec §4.3), the tile shading matched to the base globe, and the base
 *  globe's colour grade (`src/` cannot import the `tools/` recipe module). */

import type { ColourGrade } from '../../../textures/@types/ColourGrade';
import { orenNayarMatchedShading } from '../utils/orenNayarMatchedShading';

export const MARS_IAU_SPHERE_RADIUS_M = 3_396_190;
export const MARS_DATUM_RADIUS_M = 3_390_000;
export const MARS_DATUM_OFFSET_M = MARS_IAU_SPHERE_RADIUS_M - MARS_DATUM_RADIUS_M;

// gdalinfo -mm on the MOLA COG, 2026-09-17.
export const MARS_AREOID_RELIEF_M = [-8_201, 21_241] as const;

const MARS_ROUGHNESS = 0.9;

export const MARS_SURFACE_SHADING = orenNayarMatchedShading(MARS_ROUGHNESS, 0.03);

// Solar System Scope base globe grade, tuned in the albedo bench 2026-09-17
// against the graded Viking tiles (see `marsAlbedoRecipe.ts`'s Viking pair).
export const MARS_GLOBE_GRADE: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1.05,
  saturation: 1,
  gain: [1.0447, 1.4707, 1.4248],
  offset: [0.066, 0.049, 0.036],
};
