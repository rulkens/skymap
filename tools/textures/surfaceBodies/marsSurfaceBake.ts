/**
 * marsSurfaceBake — Mars's `SURFACE_BODY_BAKES` row: Viking + MOLA globally
 * at z3–z7, and HiRISE ortho + DTM in a small window around each rover at
 * z10–z17. Every source is areoid-relative on the IAU sphere; the bake adds
 * the sphere-to-datum gap (+6,190 m) so heights land on the scene's datum.
 */

import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import {
  MARS_DATUM_OFFSET_M,
  MARS_IAU_SPHERE_RADIUS_M,
} from '../../../src/data/bodies/marsSurfaceParams';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';
import { SURFACE_TILE_REGISTRY } from '../../../src/data/bodies/surfaceTileRegistry';
import { TIER_LADDER } from '../../../src/data/tierLadder';
import { baseLevelForTier } from '../../../src/utils/surfaceTiles/baseLevelForTier';
import { rawDataPath, type RawDataKey } from '../../utils/io/rawDataRegistry';
import { heightLatticeStepDeg } from '../../utils/textures/heightLatticeStepDeg';
import { surfaceTileBounds } from '../../utils/scene/surfaceTileBounds';
import { surfaceTileIndicesForBounds } from '../../utils/scene/surfaceTileIndicesForBounds';
import { clippedHeightSource } from '../clippedHeightSource';
import { clippedImagerySource } from '../clippedImagerySource';
import { colourMatchedImagerySource } from '../colourMatchedImagerySource';
import { constantHeightSource } from '../constantHeightSource';
import { delightedImagerySource } from '../delightedImagerySource';
import { geoTiffHeightSource } from '../geoTiffHeightSource';
import { geoTiffImagerySource } from '../geoTiffImagerySource';
import type { GeoTiffGrid } from '../GeoTiffGrid';
import type { HeightSource } from '../HeightSource';
import type { SurfaceBakeBand } from '../SurfaceBakeBand';
import type { SurfaceBodyBake } from '../SurfaceBodyBake';
import type { SurfaceImagerySource } from '../SurfaceImagerySource';
import { MARS_VIKING_DELIGHT, MARS_VIKING_GRADE } from './marsAlbedoRecipe';

const TILE_ROOT = SURFACE_TILE_REGISTRY.mars.manifestKey;

/** Bump on any re-bake that changes pixels (see `earthSurfaceBake`). v2: the
 *  tuned de-light + grade recipe (`marsAlbedoRecipe.ts`). */
const TILE_PREFIX = `${TILE_ROOT}/v2`;

/** The compiled `reliefM` `heliocentricPlanet` gave Mars — read here so
 *  `assertInsideReliefM` catches a site's real DTM range landing outside it. */
const MARS_RELIEF_M = SCENE_PLANETS.find((body) => body.id === 'mars')!.surface.reliefM;

/** One finer than the coarsest whole-globe base (see `earthSurfaceBake`). */
const BAKE_MIN_LEVEL = Math.min(...TIER_LADDER.map((tier) => baseLevelForTier('mars', tier))) + 1;

const GLOBAL_MAX_LEVEL = 7;
const DEV_MAX_LEVEL = 4;
/** MOLA's 463 m posts still resolve z9 (spec §4.1); it underfills the sites. */
const MOLA_MAX_LEVEL = 9;
const SITE_MIN_LEVEL = 10;
/** HiRISE DTM ceiling z17.3, ortho z17.3 (spec §4.1). */
const SITE_MAX_LEVEL = 17;

/** Side of the square baked around each rover, ground metres (plan R2). */
const MARS_SITE_WINDOW_M = 3000;

/** Width of the ring inside the window where HiRISE fades into Viking/MOLA.
 *  DTM − MOLA runs 10–150 m along the window edges (Endeavour's east rim
 *  worst, decaying over ~800 m); one MOLA post (463 m) is the narrowest ramp
 *  MOLA itself can shape, and 500 m caps the added slope near 0.3. */
const MARS_SITE_FEATHER_M = 500;

/** Colour is pulled onto Viking's below ~600 m, about 2.5 Viking pixels, so
 *  a grey ortho takes Viking's hue and keeps its own fine luminance. */
const MARS_COLOUR_MATCH_SIGMA_DEG = 0.01;

/** Datum check: a sphere-relative DTM would sit kilometres off MOLA. */
const DATUM_CHECK_LEVEL = 10;
const DATUM_CHECK_LIMIT_M = 200;

/** UInt16 grey stretches: 0.1 / 99.9 percentiles of non-zero DNs over the
 *  rover's own window at full resolution (gdal_translate -projwin +
 *  gdalinfo -hist, 2026-09-17). A whole-ortho stretch clips Home Plate.
 *  Re-measure when a rover row moves. */
const GUSEV_GREY_STRETCH = [10, 206] as const;
const ENDEAVOUR_GREY_STRETCH = [58, 247] as const;

/** The global mosaics' headers put the outer edges ±0.004° past ±180/±90
 *  (pixel-size rounding on Viking's 256 px/° grid, 92160/360); the true grid
 *  is exactly global. */
const WHOLE_GLOBE: LonLatBounds = { west: -180, east: 180, south: -90, north: 90 };

const RAD_TO_DEG = 180 / Math.PI;

/** An equirectangular (lat_ts 0, lon0 0) GeoTIFF on the IAU sphere, from its
 *  `gdalinfo` origin and pixel size in metres: lon = x / R, lat = y / R. */
function sphereGrid(
  key: RawDataKey,
  originXM: number,
  originYM: number,
  pixelM: number,
  width: number,
  height: number,
): GeoTiffGrid {
  const toDeg = RAD_TO_DEG / MARS_IAU_SPHERE_RADIUS_M;
  return {
    path: rawDataPath(key),
    width,
    height,
    bounds: {
      west: originXM * toDeg,
      east: (originXM + width * pixelM) * toDeg,
      north: originYM * toDeg,
      south: (originYM - height * pixelM) * toDeg,
    },
  };
}

function viking(maxLevel: number): SurfaceImagerySource {
  const attribution = 'Viking MDIM 2.1 colour mosaic: NASA/JPL/USGS Astrogeology (public domain).';
  return geoTiffImagerySource({
    id: 'usgs-viking-mdim21-232m',
    attribution,
    provenance: { sourceId: 'usgs-viking-mdim21-232m', attribution, vintage: 'MDIM 2.1 (2014)' },
    grid: {
      path: rawDataPath('viking.mdim21'),
      width: 92160,
      height: 46080,
      bounds: WHOLE_GLOBE,
    },
    maxLevel,
  });
}

function mola(): HeightSource {
  const attribution = 'MOLA 463 m DEM: NASA/GSFC MGS MOLA team, USGS Astrogeology (public domain).';
  return geoTiffHeightSource({
    id: 'usgs-mola-dem-463m',
    attribution,
    provenance: { sourceId: 'usgs-mola-dem-463m', attribution, vintage: 'MOLA DEM v2 (2018)' },
    grid: {
      path: rawDataPath('mola.dem463'),
      width: 46080,
      height: 23040,
      bounds: WHOLE_GLOBE,
    },
    nodata: -32768,
    offsetM: MARS_DATUM_OFFSET_M,
    maxLevel: MOLA_MAX_LEVEL,
  });
}

type MarsSite = {
  readonly roverId: string;
  readonly id: string;
  readonly attribution: string;
  readonly vintage: string;
  readonly dtm: GeoTiffGrid;
  readonly dtmNodata: number;
  readonly ortho: GeoTiffGrid;
  /** Present for the UInt16 grey orthos only. */
  readonly greyStretch?: readonly [number, number];
};

/** Origins and pixel sizes from each file's `gdalinfo` header (2026-09-17). */
function marsSites(): readonly MarsSite[] {
  const hirise = 'HiRISE: NASA/JPL/University of Arizona';
  return [
    {
      roverId: 'curiosity',
      id: 'gale',
      attribution: `${hirise}; MSL Gale DEM and 78-quad colour mosaic, USGS Astrogeology / JPL (public domain).`,
      vintage: 'MSL Gale DEM v3',
      dtm: sphereGrid('hirise.gale.dtm', 8127993.492786024, -244781.075189438, 1, 32980, 57440),
      dtmNodata: -32767,
      ortho: sphereGrid('hirise.gale.ortho', 8140000, -270000, 0.25, 36000, 76000),
    },
    {
      roverId: 'perseverance',
      id: 'jezero',
      attribution: `${hirise}; MSR HiRISE mosaics, USGS Astrogeology, doi:10.5066/P13CPYYU (public domain).`,
      vintage: 'MSR soc v003 (2024)',
      dtm: sphereGrid('hirise.jezero.dtm', 4567580, 1101802, 1, 19144, 26816),
      dtmNodata: -32767,
      ortho: sphereGrid('hirise.jezero.ortho', 4567580, 1101802, 0.25, 76576, 107264),
    },
    {
      roverId: 'spirit',
      id: 'gusev',
      attribution: `${hirise}; DTEEC_001513_1655_001777_1650, USGS Astrogeology (CC0).`,
      vintage: 'DTEEC_001513_1655_001777_1650_U01',
      dtm: sphereGrid(
        'hirise.gusev.dtm',
        10399262.023903117,
        -859041.590182437,
        1.014888180205028,
        6597,
        10802,
      ),
      dtmNodata: -3.4028227e38,
      ortho: sphereGrid(
        'hirise.gusev.ortho',
        10399264.054028956,
        -858888.684607785,
        0.253676414787075,
        26389,
        43210,
      ),
      greyStretch: GUSEV_GREY_STRETCH,
    },
    {
      roverId: 'opportunity',
      id: 'endeavour',
      attribution: `${hirise}; DTEEC_018701_1775_018846_1775, USGS Astrogeology (CC0).`,
      vintage: 'DTEEC_018701_1775_018846_1775_U01',
      dtm: sphereGrid(
        'hirise.endeavour.dtm',
        -322772.240558677,
        -125946.805737401,
        1.01184849393766,
        7854,
        21470,
      ),
      dtmNodata: -3.4028227e38,
      ortho: sphereGrid(
        'hirise.endeavour.ortho',
        -322770.849266993,
        -125948.449991191,
        0.252962123484366,
        31414,
        85880,
      ),
      greyStretch: ENDEAVOUR_GREY_STRETCH,
    },
  ];
}

function inside(inner: LonLatBounds, outer: LonLatBounds): boolean {
  return (
    inner.west >= outer.west &&
    inner.east <= outer.east &&
    inner.south >= outer.south &&
    inner.north <= outer.north
  );
}

/** The rover's window, grown to whole `SITE_MAX_LEVEL` tiles so no baked
 *  tile straddles the clip (both products then stop on the same tile edge). */
function siteExtent(site: MarsSite): LonLatBounds {
  const row = SURFACE_FIXED_SITES.find((s) => s.id === site.roverId);
  if (row === undefined) throw new Error(`marsSurfaceBake: no surface site '${site.roverId}'`);
  const lon = row.lonDeg > 180 ? row.lonDeg - 360 : row.lonDeg;
  const halfLatDeg = (MARS_SITE_WINDOW_M / 2 / MARS_IAU_SPHERE_RADIUS_M) * RAD_TO_DEG;
  const halfLonDeg = halfLatDeg / Math.cos(row.latDeg / RAD_TO_DEG);
  const window = {
    west: lon - halfLonDeg,
    east: lon + halfLonDeg,
    south: row.latDeg - halfLatDeg,
    north: row.latDeg + halfLatDeg,
  };
  const rect = surfaceTileIndicesForBounds(window, SITE_MAX_LEVEL, SURFACE_TILE_PX);
  const extent = {
    west: surfaceTileBounds(SITE_MAX_LEVEL, rect.xMin, 0, SURFACE_TILE_PX).west,
    east: surfaceTileBounds(SITE_MAX_LEVEL, rect.xMax, 0, SURFACE_TILE_PX).east,
    north: surfaceTileBounds(SITE_MAX_LEVEL, 0, rect.yMin, SURFACE_TILE_PX).north,
    south: surfaceTileBounds(SITE_MAX_LEVEL, 0, rect.yMax, SURFACE_TILE_PX).south,
  };
  if (!inside(extent, site.dtm.bounds) || !inside(extent, site.ortho.bounds)) {
    throw new Error(
      `marsSurfaceBake: ${site.roverId}'s ${MARS_SITE_WINDOW_M} m window is not inside the ${site.id} DTM and ortho`,
    );
  }
  return extent;
}

/** `extent` shrunk by the feather ring on every side. */
function siteCore(extent: LonLatBounds): LonLatBounds {
  const latDeg = (MARS_SITE_FEATHER_M / MARS_IAU_SPHERE_RADIUS_M) * RAD_TO_DEG;
  const lonDeg = latDeg / Math.cos((extent.north + extent.south) / 2 / RAD_TO_DEG);
  return {
    west: extent.west + lonDeg,
    east: extent.east - lonDeg,
    south: extent.south + latDeg,
    north: extent.north - latDeg,
  };
}

/** Median of (DTM − MOLA) over the extent's z10 posts; both carry the same
 *  offset, so it cancels. Printed, and fatal past the limit. */
async function checkDatum(
  site: MarsSite,
  dtm: HeightSource,
  global: HeightSource,
  extent: LonLatBounds,
): Promise<void> {
  const step = heightLatticeStepDeg(DATUM_CHECK_LEVEL);
  const i0 = Math.ceil((extent.west + 180) / step);
  const j0 = Math.ceil((90 - extent.north) / step);
  const nx = Math.floor((extent.east + 180) / step) - i0 + 1;
  const ny = Math.floor((90 - extent.south) / step) - j0 + 1;
  const [a, b] = await Promise.all([
    dtm.readGrid(DATUM_CHECK_LEVEL, i0, j0, nx, ny),
    global.readGrid(DATUM_CHECK_LEVEL, i0, j0, nx, ny),
  ]);
  const diffs: number[] = [];
  for (let k = 0; k < nx * ny; k++) {
    const d = (a?.[k] ?? Number.NaN) - (b?.[k] ?? Number.NaN);
    if (Number.isFinite(d)) diffs.push(d);
  }
  if (diffs.length === 0) throw new Error(`marsSurfaceBake: ${site.id} datum check found no posts`);
  diffs.sort((x, y) => x - y);
  const median = diffs[Math.floor(diffs.length / 2)]!;
  process.stderr.write(
    `  datum check ${site.id}: median DTM - MOLA = ${median.toFixed(1)} m over ${diffs.length} posts\n`,
  );
  if (Math.abs(median) > DATUM_CHECK_LIMIT_M) {
    throw new Error(
      `marsSurfaceBake: ${site.id} DTM sits ${median.toFixed(0)} m off MOLA — datum mismatch`,
    );
  }
}

/** Throws if a rebased `[min, max]` escapes the Mars row's compiled
 *  `reliefM` (spec §4.3) — a wrong offset or source unit would otherwise
 *  ship silently instead of clipping in the runtime's height decode. */
function assertInsideReliefM(id: string, [min, max]: readonly [number, number]): void {
  const [reliefMin, reliefMax] = MARS_RELIEF_M;
  if (min < reliefMin || max > reliefMax) {
    throw new Error(
      `marsSurfaceBake: ${id}'s rebased range [${min.toFixed(0)}, ${max.toFixed(0)}] ` +
        `falls outside reliefM [${reliefMin}, ${reliefMax}]`,
    );
  }
}

async function siteBand(
  site: MarsSite,
  global: SurfaceImagerySource,
  globalHeight: HeightSource,
): Promise<SurfaceBakeBand> {
  const extent = siteExtent(site);
  const core = siteCore(extent);
  const provenance = {
    sourceId: `hirise-${site.id}`,
    attribution: site.attribution,
    vintage: site.vintage,
  };
  const dtm = geoTiffHeightSource({
    id: `hirise-${site.id}-dtm`,
    attribution: site.attribution,
    provenance,
    grid: site.dtm,
    nodata: site.dtmNodata,
    offsetM: MARS_DATUM_OFFSET_M,
    maxLevel: SITE_MAX_LEVEL,
  });
  await checkDatum(site, dtm, globalHeight, extent);
  const dtmRange = await dtm.boundsInBox(extent);
  if (dtmRange === null) {
    throw new Error(`marsSurfaceBake: ${site.id} DTM has no valid samples inside its window`);
  }
  assertInsideReliefM(`${site.id} DTM`, dtmRange);

  const ortho = clippedImagerySource(
    geoTiffImagerySource({
      id: `hirise-${site.id}-ortho`,
      attribution: site.attribution,
      provenance,
      grid: site.ortho,
      maxLevel: SITE_MAX_LEVEL,
      ...(site.greyStretch === undefined ? {} : { greyStretch: site.greyStretch }),
    }),
    extent,
    core,
  );
  return {
    // Every site now colour-matches to the graded Viking, not just the grey
    // orthos: Gale's own colour would otherwise jump against it.
    source: colourMatchedImagerySource(ortho, global, { sigmaDeg: MARS_COLOUR_MATCH_SIGMA_DEG }),
    minLevel: SITE_MIN_LEVEL,
    underfill: global,
    height: clippedHeightSource(dtm, globalHeight, extent, core),
    // Also the DTM's void fill: `bakeHeightLevel` fills NaN posts from it.
    heightUnderfill: globalHeight,
  };
}

async function bands({ dev }: { dev: boolean }): Promise<readonly SurfaceBakeBand[]> {
  if (dev) {
    return [
      {
        source: delightedImagerySource(
          viking(DEV_MAX_LEVEL),
          mola(),
          MARS_VIKING_DELIGHT,
          MARS_VIKING_GRADE,
        ),
        minLevel: BAKE_MIN_LEVEL,
      },
    ];
  }

  const globalHeight = mola();
  const global = delightedImagerySource(
    viking(GLOBAL_MAX_LEVEL),
    globalHeight,
    MARS_VIKING_DELIGHT,
    MARS_VIKING_GRADE,
  );
  const sites: SurfaceBakeBand[] = [];
  for (const site of marsSites()) sites.push(await siteBand(site, global, globalHeight));
  return [
    {
      source: global,
      minLevel: BAKE_MIN_LEVEL,
      height: globalHeight,
      // No-data is rare in a global mosaic, but one NaN post aborts the bake.
      heightUnderfill: constantHeightSource(0),
    },
    ...sites,
  ];
}

export const marsSurfaceBake: SurfaceBodyBake = {
  tileRoot: TILE_ROOT,
  tilePrefix: TILE_PREFIX,
  bands,
};
