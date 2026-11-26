/**
 * The horizon rows the bake writes decide which horizon tile every leaf reads (the planner requests
 * by them, the resolver climbs from their max). Wrong levels coarsen shadows where the globe image
 * hands off to the tiles, or read a tile denser than the heights under it. Driven through the real
 * tier, planner and resolver code, over a fixture shaped like Earth's manifest.
 */
import { describe, expect, it } from 'vitest';

import type { SurfaceTileManifest } from '../../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import type { SurfaceTileBodyId } from '../../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileBodyId';
import type { SurfaceTilePlannerParams } from '../../../../../src/layers/body/surfaceTiles/plan/@types/SurfaceTilePlannerParams';
import { HORIZON_POSTS_PER_TILE } from '../../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';
import { SURFACE_TILE_PX } from '../../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import { baseLevelForTier } from '../../../../../src/layers/body/surfaceTiles/format/utils/baseLevelForTier';
import { surfaceTileInBand } from '../../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileInBand';
import { derivePlannerParams } from '../../../../../src/layers/body/surfaceTiles/plan/subsystems/derivePlannerParams';
import { resolveStandaloneRect } from '../../../../../src/layers/body/surfaceTiles/plan/subsystems/resolveStandaloneRect';
import { BODY_TEXTURE_REGISTRY } from '../../../../../src/layers/body/textures/data/bodyTextureRegistry';
import { TIER_LADDER } from '../../../../../src/data/tierLadder';
import { clampTier } from '../../../../../src/utils/math/clampTier';
import { HORIZON_GLOBE_LEVELS } from '../../../../../tools/textures/surfaceHorizon/data/horizonGlobeLevels';
import { horizonManifest } from '../../../../../tools/textures/surfaceHorizon/utils/horizonManifest';
import { repackGlobeHorizon } from '../../../../../tools/textures/surfaceHorizon/utils/repackGlobeHorizon';

const SOURCE = { sourceId: 'test', attribution: 'test', vintage: '2026' };
// Height rows as today's manifests carry them, each still naming the horizon it used to share.
const BUILT = { albedo: SOURCE, height: SOURCE, horizon: SOURCE };
const REGION = { west: 10.8, east: 13.1, south: 54.9, north: 56.1 };
const CITY = { west: 12.5, east: 12.57, south: 55.65, north: 55.68 };
const FIXTURE: SurfaceTileManifest = {
  prefix: 'earth-tiles/v11',
  tilePx: SURFACE_TILE_PX,
  bands: [
    { bounds: CITY, min: 14, max: 19, builtFrom: BUILT },
    { bounds: REGION, min: 8, max: 13, builtFrom: BUILT },
    { bounds: { west: -180, east: 180, south: -90, north: 90 }, min: 3, max: 7, builtFrom: BUILT },
  ],
};
const SLOT = {
  slot: 0,
  atlasUvOrigin: [0, 0],
  atlasUvScale: [1, 1],
  readyAtMs: 0,
  subtreeRangeM: null,
} as const;

function baked(manifest: SurfaceTileManifest): SurfaceTileManifest {
  return horizonManifest(
    manifest,
    manifest.bands.filter((band) => band.builtFrom.height !== undefined),
  );
}

/** The level of the horizon tile leaf (z, at lon/lat) reads with every requestable tile resident. */
function horizonLevelRead(
  params: SurfaceTilePlannerParams,
  z: number,
  lonDeg: number,
  latDeg: number,
) {
  const bands = params.requestBands.horizon;
  const x = Math.floor(((lonDeg + 180) / 360) * 2 ** z);
  const y = Math.floor(((90 - latDeg) / 180) * 2 ** (z - 1));
  const rect = resolveStandaloneRect({
    product: 'horizon',
    z,
    x,
    y,
    // As `cutSurfaceTiles` derives it.
    maxLevel: Math.max(-1, ...bands.map((band) => band.max)),
    baseLevel: params.baseLevel,
    residentSlot: (tile) =>
      surfaceTileInBand(bands, params.tilePx, tile.z, tile.x, tile.y) ? SLOT : null,
    isEmpty: () => false,
  });
  if (rect === null || rect === 'empty')
    throw new Error(`no horizon for z${z} at ${lonDeg}, ${latDeg}`);
  return z - Math.log2(1 / rect.atlasUvScale[0]);
}

describe('horizonManifest', () => {
  it("a first-level cut leaf reads horizon posts at least as dense as its tier's globe image", () => {
    const globePosts = new Map<number, number>();
    for (const bodyId of ['earth', 'moon', 'mars'] satisfies SurfaceTileBodyId[]) {
      const ceiling = BODY_TEXTURE_REGISTRY[bodyId].kinds.horizon!;
      for (const tier of TIER_LADDER) {
        const params = derivePlannerParams(baked(FIXTURE), baseLevelForTier(bodyId, tier))!;
        const firstLeaf = Math.min(...params.bands.map((band) => band.min));
        const leafPosts =
          2 ** horizonLevelRead(params, firstLeaf, 30, -20) * (HORIZON_POSTS_PER_TILE - 1);
        const { level } = HORIZON_GLOBE_LEVELS.find(
          (row) => row.tier === clampTier(tier, ceiling),
        )!;
        if (!globePosts.has(level))
          globePosts.set(level, repackGlobeHorizon(() => null, level).width / 2);
        expect(leafPosts, `${bodyId} ${tier}`).toBeGreaterThanOrEqual(globePosts.get(level)!);
      }
    }
  });

  it('a leaf reads its own tile at z + 2 density, and past that the finest tile, never denser than its heights', () => {
    const params = derivePlannerParams(baked(FIXTURE), baseLevelForTier('earth', 'medium'))!;
    const firstLeaf = Math.min(...params.bands.map((band) => band.min));
    const sites = [
      { lonDeg: 12.53, latDeg: 55.66, heightMax: 19 },
      { lonDeg: 11.5, latDeg: 55.2, heightMax: 13 },
      { lonDeg: 30, latDeg: -20, heightMax: 7 },
    ];
    for (const { lonDeg, latDeg, heightMax } of sites) {
      for (let z = firstLeaf; z <= heightMax; z++) {
        expect(
          horizonLevelRead(params, z, lonDeg, latDeg) + 2,
          `z${z} at ${lonDeg}, ${latDeg}`,
        ).toBe(Math.min(z + 2, heightMax));
      }
    }
  });

  it('a re-run rewrites the same rows', () => {
    const once = baked(FIXTURE);
    expect(baked(once)).toEqual(once);
  });
});
