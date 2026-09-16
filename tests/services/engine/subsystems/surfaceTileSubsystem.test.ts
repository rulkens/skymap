/**
 * Four things this subsystem owns that a stand-in device is enough to see: the
 * manifest validation in `derivePlannerParams`, the base level `runFrame`
 * derives from the tier the whole-globe texture is bound at and passes in, the
 * residency query (`residentSlot`) `cutSurfaceTiles` calls back into, and the
 * engage/disengage transition the atlas view + debug snapshot both key off.
 * All exercised against the registry's one row (`earth`) — R7 defers the
 * multi-body switch path's own test to F4's Mars row.
 *
 * The base level is the one of the three that is invisible when it is wrong. The
 * three tiers bind three different whole-globe images — z2, z3 and z4 on the
 * ladder — so a base level that describes only the finest of them makes a
 * default `medium` session stand down a level early (soft pixels where the
 * screen wanted more) and hand a z3 base straight to a z5 tile, a 4x linear step
 * where one level of softening was the entire budget. No error, no 404, nothing
 * to see but slightly worse ground.
 *
 * The manifest validation is the one part of this subsystem that is neither GPU,
 * network nor clock, and the one that has to be a refusal rather than an
 * adaptation.
 *
 * 512 is a property of the tile FORMAT: `residentSlot` resolves
 * `atlasUvOrigin`/`atlasUvScale` off the atlas's own `slotsPerRow`
 * (`EARTH_TILE_ATLAS_SIDE / tilePx`) — sound only at the shipped 512 px
 * edge, since nothing else re-derives from `tilePx` at all. A bake at
 * another edge is therefore unaddressable, not merely unusual — silently
 * adapting to it would resolve the same tile to a differently-sized atlas
 * rect, with no error anywhere and a picture that still looks like Earth.
 * Rejecting degrades to base-only, which is the identity case.
 *
 * Two cases, because a `null` that is right for the wrong reason is worth
 * nothing: the accepted default has to still be accepted.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/utils/network/fetchSurfaceTileManifest', () => ({
  fetchSurfaceTileManifest: vi.fn(),
}));
vi.mock('../../../../src/utils/network/fetchSurfaceTileBitmap', () => ({
  fetchSurfaceTileBitmap: vi.fn(),
}));
vi.mock('../../../../src/utils/network/fetchHeightTile', () => ({
  fetchHeightTile: vi.fn(),
}));

import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTilePlan } from '../../../../src/@types/scene/SurfaceTilePlan';
import type { SurfaceCutTile } from '../../../../src/@types/scene/SurfaceCutTile';
import type { Tier } from '../../../../src/@types/data/Tier';
import {
  createSurfaceTileSubsystem,
  EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT,
} from '../../../../src/services/engine/subsystems/surfaceTileSubsystem';
import { fetchSurfaceTileManifest } from '../../../../src/utils/network/fetchSurfaceTileManifest';
import { fetchSurfaceTileBitmap } from '../../../../src/utils/network/fetchSurfaceTileBitmap';
import { fetchHeightTile } from '../../../../src/utils/network/fetchHeightTile';
import { baseLevelForTier } from '../../../../src/utils/surfaceTiles/baseLevelForTier';
import {
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_PX,
  HEIGHT_TILE_ATLAS_SIDE,
} from '../../../../src/data/bodies/earthTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../../src/data/scene/heightTileFormat';

/** The shipped pyramid's reference tier: `large`, whose z4 whole-globe base the
 *  bake sits one level above. */
const BASE_LEVEL = baseLevelForTier('earth', 'large');
const MIN_TILE_LEVEL = BASE_LEVEL + 1;

/** A manifest describing a usable surface pyramid, with `tilePx` left to the
 *  caller — `undefined` standing in for a bake that omitted the field. */
const WORLD_BOUNDS = { west: -180, south: -90, east: 180, north: 90 };

function surfaceManifest(tilePx: number | undefined): SurfaceTileManifest {
  return {
    prefix: 'earth-tiles/v8',
    tilePx,
    bands: [
      {
        bounds: WORLD_BOUNDS,
        min: MIN_TILE_LEVEL,
        max: MIN_TILE_LEVEL + 1,
        builtFrom: {
          albedo: { sourceId: 'test', attribution: 'test', vintage: 'test' },
          height: { sourceId: 'test-height', attribution: 'test', vintage: 'test' },
        },
      },
    ],
  } as unknown as SurfaceTileManifest;
}

/** A subsystem with the manifest landed, on a device that answers nothing —
 *  enough for every question about params, since construction and a disengaged
 *  frame allocate nothing. */
async function subsystemWithManifest(manifest: SurfaceTileManifest) {
  vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(manifest);
  const subsystem = createSurfaceTileSubsystem({
    device: {} as unknown as GPUDevice,
    requestRender: () => {},
  });
  // The first call is what starts the fetch, and it necessarily answers null.
  subsystem.plannerParams('earth', BASE_LEVEL);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return subsystem;
}

async function plannerParamsFor(manifest: SurfaceTileManifest, tier: Tier = 'large') {
  return (await subsystemWithManifest(manifest)).plannerParams(
    'earth',
    baseLevelForTier('earth', tier),
  );
}

describe('surfaceTileSubsystem manifest validation', () => {
  it('accepts a bake at the format tile edge, and one that omits the field', async () => {
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX))).not.toBeNull();
    expect(await plannerParamsFor(surfaceManifest(undefined))).not.toBeNull();
  });

  it('refuses a bake cut at a different tile edge rather than adapting to it', async () => {
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX / 2))).toBeNull();
    expect(await plannerParamsFor(surfaceManifest(EARTH_TILE_PX * 2))).toBeNull();
  });

  it('skips a structurally-malformed band entry and derives params from the good ones', async () => {
    // A manifest a broken bake or a hand-edit could produce: one entry
    // missing `bounds` entirely alongside one well-formed entry. Skipping
    // the bad one — never throwing out of `refreshParams` — is the module's
    // stated stance for any manifest shape this build can't address.
    const manifest = surfaceManifest(EARTH_TILE_PX);
    const goodBand = manifest.bands[0]!;
    const brokenManifest: SurfaceTileManifest = {
      ...manifest,
      bands: [{ ...goodBand, bounds: undefined as never }, goodBand],
    };

    const params = await plannerParamsFor(brokenManifest);

    expect(params).not.toBeNull();
    expect(params!.bands).toHaveLength(1);
    expect(params!.bands[0]!.max).toBe(goodBand.max);
  });

  it('skips a band with no baked height, rather than requesting tiles that 404', async () => {
    // A leaf draws only with its OWN height tile (§5.2): an albedo-only band
    // (a `--product albedo` run, or a bake older than the height product)
    // would otherwise plan requests for height tiles that were never baked,
    // 404ing forever and stalling refinement on that band's whole footprint.
    const manifest = surfaceManifest(EARTH_TILE_PX);
    const albedoOnly: SurfaceTileManifest = {
      ...manifest,
      bands: [
        { ...manifest.bands[0]!, builtFrom: { albedo: manifest.bands[0]!.builtFrom.albedo } },
      ],
    };

    expect(await plannerParamsFor(albedoOnly)).toBeNull();
  });
});

describe('surfaceTileSubsystem registry-driven manifest fetch', () => {
  it("requests earth's SURFACE_TILE_REGISTRY manifestKey, not a literal", async () => {
    vi.mocked(fetchSurfaceTileManifest).mockClear();
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    const subsystem = createSurfaceTileSubsystem({
      device: {} as unknown as GPUDevice,
      requestRender: () => {},
    });

    subsystem.plannerParams('earth', BASE_LEVEL);

    expect(fetchSurfaceTileManifest).toHaveBeenCalledWith('earth-tiles');
  });
});

describe('surfaceTileSubsystem base level', () => {
  it('reports a base one level coarser per tier step down, off the same manifest', async () => {
    // The tier has to reach `derivePlannerParams` for this to hold: a base level
    // computed from the `large` ceiling alone answers z4 for all three, which is
    // a promise of detail two of them never bound.
    const manifest = surfaceManifest(EARTH_TILE_PX);
    const large = await plannerParamsFor(manifest, 'large');
    const medium = await plannerParamsFor(manifest, 'medium');
    const small = await plannerParamsFor(manifest, 'small');
    expect(medium!.baseLevel).toBe(large!.baseLevel - 1);
    expect(small!.baseLevel).toBe(large!.baseLevel - 2);
  });

  it('re-derives the base level when the caller passes a different one under one subsystem', async () => {
    // The params are memoised — one small object per session, not per frame — so
    // the memo has to be keyed on the base level. Cached without it, a tier swap
    // would keep planning against the previous session's base for the rest of
    // the session, with the manifest already in hand and nothing to re-fetch.
    const subsystem = await subsystemWithManifest(surfaceManifest(EARTH_TILE_PX));
    const before = subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'))!.baseLevel;
    expect(subsystem.plannerParams('earth', baseLevelForTier('earth', 'medium'))!.baseLevel).toBe(
      before - 1,
    );
    expect(subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'))!.baseLevel).toBe(
      before,
    );
  });
});

/** A device that answers just enough to let the atlas allocate: a stub texture
 *  and no-op queue writes. Nothing reads what it "records" any more — once the
 *  page table went, the only remaining GPU write from this subsystem is the
 *  atlas's own `copyExternalImageToTexture`, and every assertion below reads
 *  the subsystem's own state (`getAtlasView`/`getDebugSnapshot`/`residentSlot`)
 *  instead of a device call log. */
function recordingDevice(): GPUDevice {
  return {
    createTexture: () => ({ createView: () => ({}) as GPUTextureView, destroy: () => {} }),
    queue: {
      writeTexture: () => {},
      copyExternalImageToTexture: () => {},
    },
  } as unknown as GPUDevice;
}

const TILE = { product: 'albedo', z: MIN_TILE_LEVEL, x: 0, y: 0 } as const;
/** The SAME (z, x, y) as `TILE`, in the other product — the pair that makes
 *  "keyed by the full tile path" an assertion rather than a claim. */
const HEIGHT_TILE = { product: 'height', z: MIN_TILE_LEVEL, x: 0, y: 0 } as const;
// Sub-camera on the prime meridian/equator — an arbitrary but exactly
// predictable direction (lonDeg 0, latDeg 0) for the debug-snapshot test below.
const SUB_CAMERA_EQUATOR_PRIME: SurfaceTilePlan['subCameraDirLocal'] = [1, 0, 0];
const ENGAGED: SurfaceTilePlan = {
  zWin: MIN_TILE_LEVEL,
  requests: [{ tile: TILE, screenPx: EARTH_TILE_PX }],
  subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
};
/** The shape the two-product walk emits: every tile requested in both
 *  products at the same (z, x, y). */
const BOTH_PRODUCTS: SurfaceTilePlan = {
  zWin: MIN_TILE_LEVEL,
  requests: [
    { tile: TILE, screenPx: EARTH_TILE_PX },
    { tile: HEIGHT_TILE, screenPx: EARTH_TILE_PX },
  ],
  subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
};
/** At the `large` tier's base level exactly: the density that whole-globe
 *  texture already carries, so there is nothing a tile could add — and one level
 *  MORE than a `medium` session's base carries, which is what the engage-gate
 *  test below turns on. */
const DISENGAGED: SurfaceTilePlan = {
  zWin: BASE_LEVEL,
  requests: [],
  subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
};

/**
 * A subsystem with the manifest landed and `TILE` resident in the atlas —
 * genuinely resident, not merely requested, so `residentSlot`/debug-snapshot
 * assertions exercise the real post-fetch state.
 */
async function engagedSubsystem() {
  vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
  vi.mocked(fetchSurfaceTileBitmap).mockResolvedValue({
    close: () => {},
  } as unknown as ImageBitmap);

  const subsystem = createSurfaceTileSubsystem({
    device: recordingDevice(),
    requestRender: () => {},
  });
  subsystem.plannerParams('earth', BASE_LEVEL);
  await new Promise((resolve) => setTimeout(resolve, 0));

  subsystem.update({ bodyId: 'earth', plan: ENGAGED });
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A second frame of the SAME plan: the tile lands async during the first
  // call's fetch, so `notResidentCount`/`lastEngaged.plan.misses` only reads
  // 0 on the frame AFTER the bitmap resolves.
  subsystem.update({ bodyId: 'earth', plan: ENGAGED });

  return subsystem;
}

/**
 * Whether one frame of `plan` engages the virtual texture on a session bound at
 * `tier`. The atlas is allocated by the first ENGAGED frame and by nothing
 * else, so `getAtlasView()` going non-null IS the gate's answer.
 */
async function engagesAt(plan: SurfaceTilePlan, tier: Tier): Promise<boolean> {
  vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
  const subsystem = createSurfaceTileSubsystem({
    device: recordingDevice(),
    requestRender: () => {},
  });
  subsystem.plannerParams('earth', baseLevelForTier('earth', tier));
  await new Promise((resolve) => setTimeout(resolve, 0));
  subsystem.update({ bodyId: 'earth', plan });
  return subsystem.getAtlasView() !== null;
}

describe('surfaceTileSubsystem engage gate', () => {
  it('engages on the very plan a finer-tiered session stands down on', async () => {
    // One plan, settled exactly at the `large` tier's base level. That density is
    // already on screen for a session holding the 8192 base — nothing to add, so
    // stand down — and one level MORE than the 4096 base a default `medium`
    // session holds, so for that session the screen is asking for detail the base
    // does not carry and the tiles are the only thing that can supply it.
    //
    // This is the whole bug in one assertion: with the base level fixed at the
    // largest tier's, the second expectation held for both and the default
    // session showed z3 ground while the screen wanted z5.
    expect(await engagesAt(DISENGAGED, 'medium'), 'medium').toBe(true);
    expect(await engagesAt(DISENGAGED, 'large'), 'large').toBe(false);
  });

  it('re-engaging after a pull-back reuses residency instead of re-fetching', async () => {
    // The page table's stand-down used to blank a texture on this transition;
    // with it gone, the only remaining behaviour to pin is that residency
    // itself survives a disengage/re-engage cycle — a resident tile the camera
    // still wants must not re-fetch.
    const subsystem = await engagedSubsystem();
    const fetchesAfterFirstLand = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;

    subsystem.update({ bodyId: 'earth', plan: DISENGAGED });
    subsystem.update({ bodyId: 'earth', plan: ENGAGED });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length).toBe(fetchesAfterFirstLand);
    expect(subsystem.residentSlot(TILE)).not.toBeNull();
  });
});

/**
 * The DebugPanel's "Earth tile atlas" section reads `getDebugSnapshot()`
 * straight off `resident` / `pendingLevelOf` / the last plan — the shape a
 * mistake here (off-by-one level grouping, a miss count computed against the
 * wrong map) would mislead a developer chasing a tile-residency bug rather
 * than throw or fail a render.
 */
describe('surfaceTileSubsystem debug snapshot', () => {
  it('is the quiet empty snapshot before the atlas ever engages', async () => {
    const subsystem = await subsystemWithManifest(surfaceManifest(EARTH_TILE_PX));
    expect(subsystem.getDebugSnapshot()).toEqual(EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT);
  });

  it('reports resident counts, the last plan shape and the deepest keys once engaged', async () => {
    const subsystem = await engagedSubsystem();
    const snap = subsystem.getDebugSnapshot();

    expect(snap.engaged).toBe(true);
    expect(snap.capacity).toBe((EARTH_TILE_ATLAS_SIDE / EARTH_TILE_PX) ** 2);
    expect(snap.used).toBe(1);
    expect(snap.levels).toEqual([{ z: MIN_TILE_LEVEL, resident: 1, pending: 0 }]);
    expect(snap.plan).toEqual({ requestCount: 1, zWin: ENGAGED.zWin, misses: 0, cutCount: 0 });
    // cutCount tracks `lastCut`, not `update()`'s own request count — the two
    // diverge whenever ancestor fallback drops a leaf from `cut` (see
    // cutSurfaceTiles.ts) but still requests its file.
    subsystem.setLastCut([
      {
        id: { z: MIN_TILE_LEVEL, x: 0, y: 0 },
        anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0.1, dLatRad: 0.1 },
        albedo: {
          slot: 0,
          atlasUvOrigin: [0, 0],
          atlasUvScale: [1, 1],
          readyAtMs: 0,
          fallback: null,
        },
        height: { slot: 0, levelDelta: 0, originPosts: [0, 0] },
        edgeCoarser: [0, 0, 0, 0],
      },
    ]);
    expect(subsystem.getDebugSnapshot().plan?.cutCount).toBe(1);
    expect(snap.droppedAllocations).toBe(0);
    expect(snap.deepestLevelKeys).toEqual(['0,0']);
    // ENGAGED's subCameraDirLocal is the equator/prime-meridian direction, and
    // the manifest's one WORLD_BOUNDS band covers the whole globe to MIN_TILE_LEVEL+1.
    expect(snap.subCamera?.lonDeg).toBeCloseTo(0, 9);
    expect(snap.subCamera?.latDeg).toBeCloseTo(0, 9);
    expect(snap.subCamera?.coveredMaxLevel).toBe(MIN_TILE_LEVEL + 1);
  });

  it('clears the sub-camera readout on the frame the camera pulls back out', async () => {
    const subsystem = await engagedSubsystem();
    expect(subsystem.getDebugSnapshot().subCamera).not.toBeNull();

    subsystem.update({ bodyId: 'earth', plan: DISENGAGED });
    expect(subsystem.getDebugSnapshot().subCamera).toBeNull();
  });
});

describe('surfaceTileSubsystem residency readiness', () => {
  it('stamps a resident entry with the real-time moment its bitmap uploaded', async () => {
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    vi.mocked(fetchSurfaceTileBitmap).mockResolvedValue({
      close: () => {},
    } as unknown as ImageBitmap);
    // performance.now(), not Date.now()/a sim clock — real time, per the
    // design contract, so a fade runs even while the sim clock is paused.
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(54_321);

    const subsystem = createSurfaceTileSubsystem({
      device: recordingDevice(),
      requestRender: () => {},
    });
    subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    subsystem.update({ bodyId: 'earth', plan: ENGAGED });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resolved = subsystem.residentSlot(TILE);
    expect(resolved).not.toBeNull();
    expect(resolved!.readyAtMs).toBe(54_321);

    nowSpy.mockRestore();
  });
});

describe('surfaceTileSubsystem residentSlot', () => {
  it('returns null before the manifest lands and for a tile nothing has requested', async () => {
    const cold = await subsystemWithManifest(surfaceManifest(EARTH_TILE_PX));
    expect(cold.residentSlot(TILE)).toBeNull();
  });

  it('returns null for a tile at a different (z,x,y) than the one resident', async () => {
    const subsystem = await engagedSubsystem();
    expect(subsystem.residentSlot({ product: 'albedo', z: MIN_TILE_LEVEL, x: 9, y: 9 })).toBeNull();
  });

  it('resolves the resident tile to a slot-sized atlas rect', async () => {
    const subsystem = await engagedSubsystem();
    const resolved = subsystem.residentSlot(TILE);

    expect(resolved).not.toBeNull();
    // Every tile occupies exactly one slot's fraction of the atlas, whichever
    // slot it landed in — a structural invariant of the atlas geometry, not a
    // restatement of `TextureAtlas.slotUv`'s own col/row arithmetic.
    const slotFraction = EARTH_TILE_PX / EARTH_TILE_ATLAS_SIDE;
    expect(resolved!.atlasUvScale[0]).toBeCloseTo(slotFraction);
    expect(resolved!.atlasUvScale[1]).toBeCloseTo(slotFraction);
    expect(resolved!.atlasUvOrigin[0]).toBeGreaterThanOrEqual(0);
    expect(resolved!.atlasUvOrigin[0]).toBeLessThan(1);
    expect(resolved!.atlasUvOrigin[1]).toBeGreaterThanOrEqual(0);
    expect(resolved!.atlasUvOrigin[1]).toBeLessThan(1);
    // Each origin coordinate lands on a whole slot boundary.
    const slotsX = resolved!.atlasUvOrigin[0] / slotFraction;
    expect(slotsX).toBeCloseTo(Math.round(slotsX));
  });

  it('drops out of residency once the atlas evicts the slot', async () => {
    // The eviction handler's whole job: `residentSlot` must stop reporting a
    // tile the atlas has since recycled under a different key, or
    // `cutSurfaceTiles`'s ancestor fallback would draw a stale/wrong rect.
    const subsystem = await engagedSubsystem();
    expect(subsystem.residentSlot(TILE)).not.toBeNull();

    // Fill the atlas past capacity with distinct tiles at a LATER frame, so
    // LRU has something older (TILE, from `engagedSubsystem`'s frame) to
    // evict. `x` offset by 1 so this list never re-touches TILE's own (0,0).
    const side = EARTH_TILE_ATLAS_SIDE / EARTH_TILE_PX;
    const filling = Array.from({ length: side * side }, (_, i) => ({
      tile: {
        product: 'albedo' as const,
        z: MIN_TILE_LEVEL,
        x: (i % side) + 1,
        y: Math.floor(i / side),
      },
      screenPx: side * side - i,
    }));
    subsystem.update({
      bodyId: 'earth',
      plan: {
        zWin: MIN_TILE_LEVEL,
        requests: filling,
        subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subsystem.residentSlot(TILE)).toBeNull();
  });
});

/**
 * The second product's stream (§5.5): its own `rgba8unorm` atlas at a 129-post
 * slot stride, driven by the same plan and answered by the same residency
 * query. The two are told apart by `product` alone — every key is a full tile
 * path — so what this pins is that the dispatch exists at all: a height
 * payload uploaded into the albedo atlas (or a height key resolved against the
 * albedo atlas's slot geometry) is a slot the walk then reports as resident
 * while it holds someone else's bytes.
 */
describe('surfaceTileSubsystem height stream', () => {
  /** A subsystem with the manifest landed and BOTH products of `TILE` fetched. */
  async function engagedWithBothProducts() {
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    vi.mocked(fetchSurfaceTileBitmap).mockResolvedValue({
      close: () => {},
    } as unknown as ImageBitmap);
    vi.mocked(fetchHeightTile).mockResolvedValue({
      subtreeMinM: -10,
      subtreeMaxM: 20,
      geometricResidualM: 0,
      bitmap: { close: () => {} } as unknown as ImageBitmap,
    });

    const subsystem = createSurfaceTileSubsystem({
      device: recordingDevice(),
      requestRender: () => {},
    });
    subsystem.plannerParams('earth', BASE_LEVEL);
    await new Promise((resolve) => setTimeout(resolve, 0));
    subsystem.update({ bodyId: 'earth', plan: BOTH_PRODUCTS });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return subsystem;
  }

  it('lands a height request in the height atlas and resolves residency by product', async () => {
    const subsystem = createSurfaceTileSubsystem({
      device: recordingDevice(),
      requestRender: () => {},
    });
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    vi.mocked(fetchHeightTile).mockResolvedValue({
      subtreeMinM: -10,
      subtreeMaxM: 20,
      geometricResidualM: 0,
      bitmap: { close: () => {} } as unknown as ImageBitmap,
    });
    subsystem.plannerParams('earth', BASE_LEVEL);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Height ALONE in the plan: the albedo tile at the same (z, x, y) stays
    // unrequested, so a residency map that ignored `product` would answer both.
    subsystem.update({
      bodyId: 'earth',
      plan: {
        zWin: MIN_TILE_LEVEL,
        requests: [{ tile: HEIGHT_TILE, screenPx: EARTH_TILE_PX }],
        subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resolved = subsystem.residentSlot(HEIGHT_TILE);
    expect(resolved).not.toBeNull();
    expect(subsystem.residentSlot(TILE)).toBeNull();
    expect(subsystem.getHeightAtlasView()).not.toBeNull();
    // Resolved against the HEIGHT atlas's own geometry (129-post slots in a
    // 2064 texture), not the albedo atlas's 512-in-8192 — the two fractions
    // differ, so this is the assertion a shared-atlas slip fails.
    const slotFraction = HEIGHT_POSTS_PER_TILE / HEIGHT_TILE_ATLAS_SIDE;
    expect(resolved!.atlasUvScale[0]).toBeCloseTo(slotFraction);
    expect(resolved!.atlasUvScale[1]).toBeCloseTo(slotFraction);

    const snap = subsystem.getDebugSnapshot();
    expect(snap.height).toEqual({
      used: 1,
      capacity: (HEIGHT_TILE_ATLAS_SIDE / HEIGHT_POSTS_PER_TILE) ** 2,
    });
    // The per-level rows stay the albedo product's: a height tile counted
    // there would read as albedo residency the walk does not have.
    expect(snap.levels).toEqual([]);
  });

  it('clears both products’ residency when the body stands down', async () => {
    const subsystem = await engagedWithBothProducts();
    expect(subsystem.residentSlot(TILE)).not.toBeNull();
    expect(subsystem.residentSlot(HEIGHT_TILE)).not.toBeNull();

    // A different body than the engaged one stands the old one down (§ one
    // engaged); its own params never resolve, so nothing re-engages here.
    subsystem.update({ bodyId: 'planet', plan: BOTH_PRODUCTS });
    expect(subsystem.getAtlasView()).toBeNull();
    expect(subsystem.getHeightAtlasView()).toBeNull();

    // Both atlases are fresh on re-engage, so both products must re-fetch: a
    // residency map that survived the stand-down would report slots in the
    // new, empty atlas — the same stale-rect bug eviction already guards.
    const albedoCalls = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;
    const heightCalls = vi.mocked(fetchHeightTile).mock.calls.length;
    subsystem.update({ bodyId: 'earth', plan: BOTH_PRODUCTS });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length).toBe(albedoCalls + 1);
    expect(vi.mocked(fetchHeightTile).mock.calls.length).toBe(heightCalls + 1);
  });
});

describe('surfaceTileSubsystem lastCut', () => {
  it('starts empty, round-trips through setLastCut, and clears on destroy', async () => {
    const subsystem = await subsystemWithManifest(surfaceManifest(EARTH_TILE_PX));
    expect(subsystem.getLastCut()).toEqual([]);

    const cut: readonly SurfaceCutTile[] = [
      {
        id: { z: MIN_TILE_LEVEL, x: 0, y: 0 },
        anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0.1, dLatRad: 0.1 },
        albedo: {
          slot: 0,
          atlasUvOrigin: [0, 0],
          atlasUvScale: [0.1, 0.1],
          readyAtMs: 0,
          fallback: null,
        },
        height: { slot: 0, levelDelta: 0, originPosts: [0, 0] },
        edgeCoarser: [0, 0, 0, 0],
      },
    ];
    subsystem.setLastCut(cut);
    expect(subsystem.getLastCut()).toBe(cut);

    subsystem.destroy();
    expect(subsystem.getLastCut()).toEqual([]);
  });
});

describe('surfaceTileSubsystem stand-down', () => {
  it('allocates nothing when a session never engages', async () => {
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    let touched = false;
    const device = new Proxy({} as GPUDevice, {
      get: () => {
        touched = true;
        return () => {};
      },
    });

    const subsystem = createSurfaceTileSubsystem({ device, requestRender: () => {} });
    subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let frame = 0; frame < 3; frame++) {
      subsystem.update({ bodyId: 'earth', plan: DISENGAGED });
    }

    // Not one property of the device read: no atlas, no upload. 67 MB rides on
    // this for every session that stays outside Earth's orbit.
    expect(touched).toBe(false);
    expect(subsystem.getAtlasView()).toBeNull();
  });

  it('allocates nothing when the manifest 404s, even though the plan is engaged', async () => {
    // The day-one production case: R2 has no manifest yet, so the fetch
    // resolves null and `params` must stay null regardless of what the
    // camera is doing. Cleared first: neither mock resets its call history
    // between tests in this file, and both were driven by earlier cases above.
    vi.mocked(fetchSurfaceTileManifest).mockClear();
    vi.mocked(fetchSurfaceTileBitmap).mockClear();
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(null);
    let touched = false;
    const device = new Proxy({} as GPUDevice, {
      get: () => {
        touched = true;
        return () => {};
      },
    });

    const subsystem = createSurfaceTileSubsystem({ device, requestRender: () => {} });
    expect(subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'))).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A caller that ignored runFrame's `params !== null` gate has to be safe
    // anyway: engaged frames against a null-manifest session must still be inert.
    expect(subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'))).toBeNull();
    for (let frame = 0; frame < 3; frame++) {
      subsystem.update({ bodyId: 'earth', plan: ENGAGED });
    }

    expect(touched).toBe(false);
    expect(subsystem.getAtlasView()).toBeNull();
    expect(fetchSurfaceTileBitmap).not.toHaveBeenCalled();
    // The one property that actually regresses if this path breaks: a 404
    // must not re-arm and re-fetch on every subsequent frame.
    expect(fetchSurfaceTileManifest).toHaveBeenCalledTimes(1);
  });
});

/**
 * The atlas-thrash bug: a single pass that allocates as it walks the plan lets
 * a new, higher-priority request evict a resident the SAME plan would have
 * touched a few iterations later, because the resident still carries last
 * frame's LRU stamp when the new request is processed. The evicted tile then
 * re-allocates (and re-fetches) a few iterations later, having lost its
 * pixels — the flash-in/out symptom. Fixed by touching every present key
 * first, so nothing is evicted mid-plan.
 *
 * `fetchSurfaceTileBitmap` call count is the observable: eviction clears the
 * key's loaded membership (see `tileStreamSubsystem`'s evict
 * handler), so a resident tile coming back re-fetches. Snapshotting the count
 * around each `update()` keeps the assertion independent of the file's shared
 * (never-reset) mock call history.
 */
describe('surfaceTileSubsystem full-atlas allocation', () => {
  const SLOT_COUNT = (EARTH_TILE_ATLAS_SIDE / EARTH_TILE_PX) ** 2;

  /** `SLOT_COUNT` distinct tiles on an 8x8 grid at the window level, exactly
   *  filling the atlas — largest screenPx first, matching planner order. */
  function fillingRequests() {
    const side = EARTH_TILE_ATLAS_SIDE / EARTH_TILE_PX;
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({
      tile: { product: 'albedo', z: MIN_TILE_LEVEL, x: i % side, y: Math.floor(i / side) } as const,
      screenPx: SLOT_COUNT - i,
    }));
  }

  it('does not evict a planned resident to make room for a new higher-priority tile', async () => {
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(surfaceManifest(EARTH_TILE_PX));
    vi.mocked(fetchSurfaceTileBitmap).mockResolvedValue({
      close: () => {},
    } as unknown as ImageBitmap);

    const subsystem = createSurfaceTileSubsystem({
      device: recordingDevice(),
      requestRender: () => {},
    });
    subsystem.plannerParams('earth', baseLevelForTier('earth', 'large'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resident = fillingRequests();
    const fillPlan: SurfaceTilePlan = {
      zWin: MIN_TILE_LEVEL,
      requests: resident,
      subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
    };

    const callsBeforeFill = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;
    subsystem.update({ bodyId: 'earth', plan: fillPlan });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The atlas is now genuinely full — every one of its slots resident.
    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length - callsBeforeFill).toBe(SLOT_COUNT);

    // A new tile, off the 8x8 grid the fill used, sorted first (highest
    // screenPx) — the priority order that let a single evicting pass reach
    // it before the plan's own residents.
    const newTile = { product: 'albedo', z: MIN_TILE_LEVEL, x: 99, y: 99 } as const;
    const nextPlan: SurfaceTilePlan = {
      zWin: MIN_TILE_LEVEL,
      requests: [{ tile: newTile, screenPx: SLOT_COUNT + 1 }, ...resident],
      subCameraDirLocal: SUB_CAMERA_EQUATOR_PRIME,
    };

    const callsBeforeNext = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;
    subsystem.update({ bodyId: 'earth', plan: nextPlan });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Nothing resident got evicted-and-refetched, and the full atlas made the
    // new tile wait rather than bump a resident out.
    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length - callsBeforeNext).toBe(0);
    // The debug snapshot's other half of the same story: the refused
    // allocation attempt is counted, not silently swallowed.
    expect(subsystem.getDebugSnapshot().droppedAllocations).toBe(1);
  });
});
