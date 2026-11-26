/**
 * moonSurfaceBake — the Moon's `SURFACE_BODY_BAKES` row: LROC WAC de-lit
 * against LOLA, and LOLA heights, globally at z3–z7. Both sources sit on the
 * 1,737,400 m sphere; the bake adds the sphere-to-datum gap (+400 m) so
 * heights land on the scene's datum.
 */

import {
  MOON_DATUM_OFFSET_M,
  MOON_SOURCE_SPHERE_RADIUS_M,
} from '../../../src/layers/body/surfaceTiles/format/data/moonSurfaceParams';
import { WHOLE_GLOBE_BOUNDS } from '../../../src/layers/body/surfaceTiles/format/data/wholeGlobeBounds';
import { SURFACE_TILE_REGISTRY } from '../../../src/layers/body/surfaceTiles/format/data/surfaceTileRegistry';
import { TIER_LADDER } from '../../../src/data/tierLadder';
import { baseLevelForTier } from '../../../src/layers/body/surfaceTiles/format/utils/baseLevelForTier';
import { rawDataPath } from '../../utils/io/rawDataRegistry';
import { constantHeightSource } from '../constantHeightSource';
import { delightedImagerySource } from '../delightedImagerySource';
import { geoTiffHeightSource } from '../geoTiffHeightSource';
import { geoTiffImagerySource } from '../geoTiffImagerySource';
import type { HeightSource } from '../@types/HeightSource';
import type { SurfaceBakeBand } from '../@types/SurfaceBakeBand';
import type { SurfaceBodyBake } from '../@types/SurfaceBodyBake';
import type { SurfaceImagerySource } from '../@types/SurfaceImagerySource';
import { MOON_WAC_DELIGHT, MOON_WAC_GRADE } from './moonAlbedoRecipe';

const TILE_ROOT = SURFACE_TILE_REGISTRY.moon.manifestKey;

/** Bump on any re-bake that changes pixels (see `earthSurfaceBake`). */
const TILE_PREFIX = `${TILE_ROOT}/v1`;

/** One finer than the coarsest whole-globe base (see `earthSurfaceBake`). */
const BAKE_MIN_LEVEL = Math.min(...TIER_LADDER.map((tier) => baseLevelForTier('moon', tier))) + 1;

const GLOBAL_MAX_LEVEL = 7;
const DEV_MAX_LEVEL = 4;

function wac(maxLevel: number): SurfaceImagerySource {
  const attribution =
    'LROC WAC mosaic: NASA/GSFC/Arizona State University, USGS Astrogeology (public domain).';
  return geoTiffImagerySource({
    id: 'lroc-wac-global-100m',
    attribution,
    provenance: {
      sourceId: 'lroc-wac-global-100m',
      attribution,
      vintage: 'WAC global morphologic mosaic (June 2013)',
    },
    grid: {
      path: rawDataPath('lroc.wacGlobal100m'),
      width: 109164,
      height: 54582,
      // 109164 x 100 m stops 6 m short of the sphere's circumference, and
      // 54582 x 100 m 3 m short of pole to pole: under 0.1 px, so still global.
      bounds: WHOLE_GLOBE_BOUNDS,
    },
    maxLevel,
  });
}

function lola(): HeightSource {
  const attribution = 'LOLA 118 m DEM: NASA/GSFC LOLA team, USGS Astrogeology (public domain).';
  return geoTiffHeightSource({
    id: 'lola-ldem-118m',
    attribution,
    provenance: {
      sourceId: 'lola-ldem-118m',
      attribution,
      vintage: 'LOLA LDEM 118 m (March 2014)',
    },
    grid: {
      path: rawDataPath('lola.ldem118m'),
      width: 92160,
      height: 46080,
      bounds: WHOLE_GLOBE_BOUNDS,
    },
    nodata: -32768,
    offsetM: MOON_DATUM_OFFSET_M,
    maxLevel: GLOBAL_MAX_LEVEL,
  });
}

async function bands({ dev }: { dev: boolean }): Promise<readonly SurfaceBakeBand[]> {
  const height = lola();
  const source = delightedImagerySource(
    wac(dev ? DEV_MAX_LEVEL : GLOBAL_MAX_LEVEL),
    height,
    MOON_WAC_DELIGHT,
    MOON_WAC_GRADE,
    MOON_SOURCE_SPHERE_RADIUS_M,
  );
  if (dev) return [{ source, minLevel: BAKE_MIN_LEVEL }];
  return [
    {
      source,
      minLevel: BAKE_MIN_LEVEL,
      height,
      // No-data is rare in a global DEM, but one NaN post aborts the bake.
      heightUnderfill: constantHeightSource(0),
    },
  ];
}

export const moonSurfaceBake: SurfaceBodyBake = {
  tileRoot: TILE_ROOT,
  tilePrefix: TILE_PREFIX,
  bands,
};
