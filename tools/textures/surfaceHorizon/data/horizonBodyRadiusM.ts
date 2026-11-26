import { EARTH_DATUM_RADIUS_M } from '../../../../src/data/bodies/earthDatumRadiusM';
import type { SurfaceTileBodyId } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileBodyId';
import { MARS_IAU_SPHERE_RADIUS_M } from '../../../../src/layers/body/surfaceTiles/format/data/marsSurfaceParams';
import { MOON_SOURCE_SPHERE_RADIUS_M } from '../../../../src/layers/body/surfaceTiles/format/data/moonSurfaceParams';

/** The sphere each body's baked heights are measured above, for the march's curvature drop:
 *  the sources' own spheres, not the runtime datum (Mars and the Moon rebase at draw time). */
export const HORIZON_BODY_RADIUS_M: Record<SurfaceTileBodyId, number> = {
  earth: EARTH_DATUM_RADIUS_M,
  moon: MOON_SOURCE_SPHERE_RADIUS_M,
  mars: MARS_IAU_SPHERE_RADIUS_M,
};
