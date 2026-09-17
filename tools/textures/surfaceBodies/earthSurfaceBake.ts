/**
 * earthSurfaceBake — Earth's `SURFACE_BODY_BAKES` row: which imagery/height
 * sources feed `bakeAll`, and at which floors. Mars's own row sits beside
 * this one, not inside the shared bake harness.
 */

import { TIER_LADDER } from '../../../src/data/tierLadder';
import { SURFACE_TILE_REGISTRY } from '../../../src/data/bodies/surfaceTileRegistry';
import { baseLevelForTier } from '../../../src/utils/surfaceTiles/baseLevelForTier';
import { BMNG_QUADRANT_KEYS } from '../../utils/io/bmngQuadrantKeys';
import { BMNG_VINTAGE } from '../../utils/io/bmngVintage';
import { rawDataPath } from '../../utils/io/rawDataRegistry';
import { bmngQuadrantSource, type BmngQuadrant } from '../bmngQuadrantSource';
import { colourMatchedImagerySource } from '../colourMatchedImagerySource';
import { constantHeightSource } from '../constantHeightSource';
import { dhmTerraenHeightSource } from '../dhmTerraenHeightSource';
import { equirectFileSource } from '../equirectFileSource';
import { eoxTileSource } from '../eoxTileSource';
import { etopoHeightSource } from '../etopoHeightSource';
import { geodanmarkTileSource } from '../geodanmarkTileSource';
import type { HeightSource } from '../HeightSource';
import { skadiHeightSource } from '../skadiHeightSource';
import type { SurfaceBakeBand } from '../SurfaceBakeBand';
import type { SurfaceBodyBake } from '../SurfaceBodyBake';
import { voidFilledHeightSource } from '../voidFilledHeightSource';

/** Stable location of the manifest and index — the pointer clients always
 *  fetch — so it reads `SURFACE_TILE_REGISTRY`'s own key rather than a
 *  second literal that could drift from the runtime's. */
const TILE_ROOT = SURFACE_TILE_REGISTRY.earth.manifestKey;

/**
 * Versioned prefix for the tile bodies themselves. BUMP THIS on any re-bake
 * that changes bytes, pixels or header alike: tiles are served `immutable,
 * max-age=1y`, so reusing a version strands the old bytes in edge AND browser
 * caches, and a browser cache cannot be purged at all — a returning visitor
 * then mixes old and new tiles. A new version is new keys, which cost nothing
 * extra and need no purge. v9: height tiles became Terrain-RGB WebP instead of
 * raw f32. v10: the `SHGT` chunk grew the v3 CPU post grid (`heightTileFormat.ts`).
 */
const TILE_PREFIX = `${TILE_ROOT}/v10`;

/**
 * Shallowest level this bake emits: one finer than the COARSEST whole-globe
 * base, not the finest — pinning this to the `large` tier's z4 base would
 * leave `medium`/`small` sessions falling back to the base texture one or
 * two levels early (an unbaked level 404s like ocean does).
 */
const BAKE_MIN_LEVEL = Math.min(...TIER_LADDER.map((tier) => baseLevelForTier('earth', tier))) + 1;

/**
 * Shallowest level the EOX regional band emits: one deeper than BMNG's OWN
 * max (z7), not derived from `BAKE_MIN_LEVEL` — a regional band's floor is a
 * different rule ("pick up where the global band stops"), not the global
 * band's own tier-derived floor.
 */
const EOX_MIN_LEVEL = 8;

/** Scale below which EOX's colour is pulled onto Blue Marble's, in degrees
 *  along a meridian: 2 km is about one Blue Marble texel, so the seam is
 *  matched at the finest scale the band underneath can resolve and everything
 *  finer stays EOX's own. */
const EOX_COLOUR_MATCH_SIGMA_DEG = 0.018;

/** GeoDanmark's own floor: one level deeper than EOX's own max (z13), same
 *  "pick up where the shallower band stops" rule as `EOX_MIN_LEVEL` — also
 *  the level the z19 harvest bbox is snapped to (`geodanmarkTileSource`'s
 *  `minLevel`), so this is the ladder's single source of truth for both. */
const GEODANMARK_MIN_LEVEL = 14;

/** Shared: the quadrants and the whole-globe equirect are the SAME BMNG month
 *  (see `BMNG_VINTAGE`). */
const BMNG_ATTRIBUTION = `NASA Blue Marble Next Generation, ${BMNG_VINTAGE.label} topography + bathymetry (public domain, credit NASA Earth Observatory).`;

/** The shipped source: BMNG's eight-file quadrant set, reaching z7. */
async function deepSource() {
  return bmngQuadrantSource({
    id: `nasa-bmng-${BMNG_VINTAGE.stamp}-quadrants`,
    attribution: BMNG_ATTRIBUTION,
    vintage: BMNG_VINTAGE.label,
    quadrantPaths: Object.fromEntries(
      Object.entries(BMNG_QUADRANT_KEYS).map(([quadrant, key]) => [quadrant, rawDataPath(key)]),
    ) as Record<BmngQuadrant, string>,
  });
}

/**
 * `--dev`: the whole-globe equirect, reaching z5 — built from what
 * `fetch-textures` already pulls (no 421 MB quadrant set). An explicit flag
 * rather than a silent fallback: the pyramid would otherwise be complete,
 * valid and four levels short with nothing downstream able to tell.
 */
async function devSource() {
  return equirectFileSource({
    id: `nasa-bmng-${BMNG_VINTAGE.stamp}-equirect`,
    rawKey: 'textures.nasaBmng',
    attribution: BMNG_ATTRIBUTION,
    vintage: BMNG_VINTAGE.label,
  });
}

async function bands({ dev }: { dev: boolean }): Promise<readonly SurfaceBakeBand[]> {
  if (dev) {
    // Whole-globe BMNG only — the EOX and GeoDanmark bands need real harvests
    // on disk, which `--dev` explicitly opts out of (see `devSource`), and no
    // height source either: ETOPO is a 1.6 GB pull `--dev` exists to avoid.
    return [{ source: await devSource(), minLevel: BAKE_MIN_LEVEL }];
  }

  // Shared instance, not two separate `deepSource()` calls: reuses BMNG's
  // band cache, and its `readBox` handles arbitrary small boxes (Copenhagen
  // sits wholly inside quadrant C1, no seam risk) — the same source can
  // serve both as the global band and as the EOX band's underfill.
  const bmng = await deepSource();
  const eox = colourMatchedImagerySource(
    await eoxTileSource({ coverageDir: rawDataPath('eox.dir') }),
    bmng,
    {
      sigmaDeg: EOX_COLOUR_MATCH_SIGMA_DEG,
      waterMaskPath: rawDataPath('textures.earthWaterMask'),
    },
  );
  const geodanmark = await geodanmarkTileSource({
    coverageDir: rawDataPath('geodanmark.dir'),
    minLevel: GEODANMARK_MIN_LEVEL,
  });

  // Each height source covers exactly its albedo band's boxes (§4.1), so
  // coverage is read off the imagery source rather than declared twice.
  const etopo = await etopoHeightSource();
  const skadi: HeightSource = skadiHeightSource({
    dir: rawDataPath('skadi.dir'),
    coverage: eox.coverage,
  });
  const dhm: HeightSource = voidFilledHeightSource(
    dhmTerraenHeightSource({
      dir: rawDataPath('dhmterraen.dir'),
      coverage: geodanmark.coverage,
    }),
    skadi,
  );

  return [
    {
      source: bmng,
      minLevel: BAKE_MIN_LEVEL,
      height: etopo,
      // ETOPO's own NODATA maps to NaN (`etopoHeightSource`), so a rare
      // gap in a global 1.6 GB GeoTIFF would otherwise abort the bake.
      heightUnderfill: constantHeightSource(0),
      // The only band whose source carries real bathymetry, and the only
      // one that is global — which is what lets R3 label the world ocean
      // as simply the largest connected water component.
      flattenWater: true,
    },
    {
      source: eox,
      minLevel: EOX_MIN_LEVEL,
      underfill: bmng,
      height: skadi,
      heightUnderfill: etopo,
    },
    {
      source: geodanmark,
      minLevel: GEODANMARK_MIN_LEVEL,
      // The band the level above it stops at: R11's sibling closure pulls
      // in halo tiles outside the harvest bbox, and their pixels have to
      // come from somewhere — EOX, not BMNG, or the halo ring would be
      // six levels coarser than the tiles beside it. (`dhm` is already
      // void-filled from skadi, the height product's own halo source.)
      underfill: eox,
      height: dhm,
    },
  ];
}

export const earthSurfaceBake: SurfaceBodyBake = {
  tileRoot: TILE_ROOT,
  tilePrefix: TILE_PREFIX,
  bands,
};
