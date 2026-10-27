/**
 * surfaceTileStream — the stream applies a plan and owns what it applies to:
 * manifests, both atlases, residency and in-flight fetches. Every decision is
 * the planner's (`planSurfaceTiles.test.ts`); here the plans are hand-built,
 * the device a stand-in and the fetches mocked, so what these pin is that a
 * verdict, a touch and an upload land where the residency then says they did.
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
import type { SurfaceTilePlan } from '../../../../src/@types/engine/surfaceTiles/SurfaceTilePlan';
import type { SurfaceTileId } from '../../../../src/@types/data/SurfaceTileId';
import type { HeightTileImage } from '../../../../src/@types/scene/HeightTileImage';
import { createSurfaceTileStream } from '../../../../src/services/engine/subsystems/surfaceTileStream';
import { IDLE_SURFACE_TILE_PLAN } from '../../../../src/data/bodies/idleSurfaceTilePlan';
import { fetchSurfaceTileManifest } from '../../../../src/utils/network/fetchSurfaceTileManifest';
import { fetchSurfaceTileBitmap } from '../../../../src/utils/network/fetchSurfaceTileBitmap';
import { fetchHeightTile } from '../../../../src/utils/network/fetchHeightTile';
import { baseLevelForTier } from '../../../../src/utils/surfaceTiles/baseLevelForTier';
import { derivePlannerParams } from '../../../../src/utils/surfaceTiles/derivePlannerParams';
import { isSurfaceTileBodyId } from '../../../../src/utils/surfaceTiles/isSurfaceTileBodyId';
import { equirectUvToDirection } from '../../../../src/utils/math/equirectUvToDirection';
import { codeHeightM } from '../../../../src/utils/surfaceTiles/codeHeightM';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import {
  SURFACE_TILE_ATLAS_SIDE,
  SURFACE_TILE_PX,
  HEIGHT_TILE_ATLAS_SIDE,
} from '../../../../src/data/bodies/surfaceTileParams';
import {
  HEIGHT_GRID_BYTES,
  HEIGHT_POSTS_PER_TILE,
} from '../../../../src/data/scene/heightTileFormat';

function tileBody(id: string) {
  const bodyId = asSceneBodyId(id);
  if (!isSurfaceTileBodyId(bodyId)) throw new Error(`${id} has no surface tiles`);
  return bodyId;
}
const EARTH = tileBody('earth');
const MARS = tileBody('mars');
const BASE_LEVEL = baseLevelForTier('earth', 'large');
const MIN_TILE_LEVEL = BASE_LEVEL + 1;
const PREFIX = 'earth-tiles/v8';
const SLOT_COUNT = (SURFACE_TILE_ATLAS_SIDE / SURFACE_TILE_PX) ** 2;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function manifestOf(prefix: string): SurfaceTileManifest {
  const provenance = { sourceId: 'test', attribution: 'test', vintage: 'test' };
  return {
    prefix,
    tilePx: SURFACE_TILE_PX,
    bands: [
      {
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        min: MIN_TILE_LEVEL,
        max: MIN_TILE_LEVEL + 1,
        builtFrom: { albedo: provenance, height: provenance },
      },
    ],
  };
}

/** Just enough device for the atlases to allocate: stub textures, no-op
 *  writes, and a count of textures destroyed. */
function stubDevice(destroyed = { textures: 0 }): GPUDevice {
  return {
    createTexture: () => ({
      createView: () => ({}) as GPUTextureView,
      destroy: () => destroyed.textures++,
    }),
    queue: { writeTexture: () => {}, copyExternalImageToTexture: () => {} },
  } as unknown as GPUDevice;
}

/** A device that records whether anything read it at all. */
function watchedDevice(): { device: GPUDevice; touched: () => boolean } {
  let touched = false;
  const device = new Proxy({} as GPUDevice, {
    get: () => {
      touched = true;
      return () => {};
    },
  });
  return { device, touched: () => touched };
}

const albedo = (x: number, y = 0): SurfaceTileId => ({
  product: 'albedo',
  z: MIN_TILE_LEVEL,
  x,
  y,
});
const height = (x: number): SurfaceTileId => ({ product: 'height', z: MIN_TILE_LEVEL, x, y: 0 });
const plan = (over: Partial<SurfaceTilePlan>): SurfaceTilePlan => ({
  ...IDLE_SURFACE_TILE_PLAN,
  ...over,
});
const ENGAGE_EARTH = { engage: EARTH, tilePx: SURFACE_TILE_PX } as const;
const requesting = (
  tiles: readonly SurfaceTileId[],
  verdict: SurfaceTilePlan['verdict'] = 'keep',
) => plan({ verdict, requests: tiles.map((tile, i) => ({ tile, screenPx: 1000 - i })) });

function bitmap(close: () => void = () => {}): ImageBitmap {
  return { close } as unknown as ImageBitmap;
}
function heightImage(
  gridCodes = new Uint8Array(HEIGHT_GRID_BYTES),
  close = () => {},
): HeightTileImage {
  return {
    subtreeMinM: -10,
    subtreeMaxM: 20,
    geometricResidualM: 0,
    gridCodes,
    bitmap: bitmap(close),
  };
}

/** A stream with Earth's manifest loaded and nothing engaged yet. */
async function streamWithManifest(device: GPUDevice = stubDevice()) {
  vi.mocked(fetchSurfaceTileManifest).mockImplementation(async (key) =>
    manifestOf(key === 'mars-tiles' ? 'mars-tiles/v2' : PREFIX),
  );
  const stream = createSurfaceTileStream({
    device,
    requestRender: () => {},
  });
  stream.apply(plan({ wantManifest: EARTH }));
  await tick();
  return stream;
}

/** Earth engaged with `tiles` requested and landed. */
async function engagedWith(tiles: readonly SurfaceTileId[] = [albedo(0)], close = () => {}) {
  vi.mocked(fetchSurfaceTileBitmap).mockImplementation(async () => bitmap(close));
  vi.mocked(fetchHeightTile).mockImplementation(async () => heightImage(undefined, close));
  const stream = await streamWithManifest();
  stream.apply(requesting(tiles, ENGAGE_EARTH));
  await tick();
  return stream;
}

/** A fetch the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('surfaceTileStream manifests', () => {
  it("fetches a wanted body's registry manifestKey once, and a 404 is final", async () => {
    // Bug caught: a refetch storm against a bucket with no manifest yet.
    vi.mocked(fetchSurfaceTileManifest).mockReset();
    vi.mocked(fetchSurfaceTileManifest).mockResolvedValue(null);
    const stream = createSurfaceTileStream({
      device: stubDevice(),
      requestRender: () => {},
    });
    expect(stream.residency.manifest(EARTH).status).toBe('absent');

    stream.apply(plan({ wantManifest: EARTH }));
    expect(stream.residency.manifest(EARTH).status).toBe('pending');
    await tick();
    stream.apply(plan({ wantManifest: EARTH }));

    expect(stream.residency.manifest(EARTH)).toEqual({ status: 'failed', value: null });
    expect(fetchSurfaceTileManifest).toHaveBeenCalledTimes(1);
    expect(fetchSurfaceTileManifest).toHaveBeenCalledWith('earth-tiles');
  });

  it('allocates nothing until a plan engages, nor when engaged without a manifest', async () => {
    // Bug caught: 67 MB of atlas for every session that never nears a tiling body.
    const { device, touched } = watchedDevice();
    const stream = await streamWithManifest(device);
    for (let frame = 0; frame < 3; frame++) stream.apply(IDLE_SURFACE_TILE_PLAN);
    stream.apply(requesting([albedo(0)], { engage: MARS, tilePx: SURFACE_TILE_PX }));

    expect(touched()).toBe(false);
    expect(stream.getAtlasView()).toBeNull();
    expect(stream.residency.engagedBodyId()).toBeNull();
  });
});

describe('surfaceTileStream verdicts', () => {
  it('release frees both atlases and ignores fetches still in flight', async () => {
    // Bug caught: Earth tiles repopulating after a switch to Mars, or leaked bitmaps.
    const destroyed = { textures: 0 };
    const stream = await streamWithManifest(stubDevice(destroyed));
    const albedoFetch = deferred<ImageBitmap | null>();
    const heightFetch = deferred<HeightTileImage | null>();
    vi.mocked(fetchSurfaceTileBitmap).mockReturnValueOnce(albedoFetch.promise);
    vi.mocked(fetchHeightTile).mockReturnValueOnce(heightFetch.promise);
    stream.apply(requesting([albedo(0), height(0)], ENGAGE_EARTH));
    expect(stream.residency.inFlightCount()).toBe(2);

    stream.apply(plan({ verdict: 'release' }));
    const closeAlbedo = vi.fn();
    const closeHeight = vi.fn();
    albedoFetch.resolve(bitmap(closeAlbedo));
    heightFetch.resolve(heightImage(undefined, closeHeight));
    await tick();

    expect(stream.residency.engagedBodyId()).toBeNull();
    expect(stream.getAtlasView()).toBeNull();
    expect(stream.getHeightAtlasView()).toBeNull();
    expect(stream.residency.residentSlot(albedo(0))).toBeNull();
    expect(stream.residency.inFlightCount()).toBe(0);
    expect(closeAlbedo).toHaveBeenCalled();
    expect(closeHeight).toHaveBeenCalled();
    expect(destroyed.textures).toBe(2);
    // The late landings wrote nothing a fresh engagement could report.
    stream.apply(requesting([], ENGAGE_EARTH));
    expect(stream.residency.residentSlot(albedo(0))).toBeNull();
    expect(stream.residency.residentSlot(height(0))).toBeNull();
  });

  it('an engage for another body stands the engaged one down first', async () => {
    // Bug caught: Earth's tiles, at Earth's slots, drawn over Mars, and Earth's
    // residency answering for a fresh atlas on the way back.
    const stream = await engagedWith([albedo(0), height(0)]);
    stream.apply(plan({ wantManifest: MARS }));
    await tick();

    stream.apply(requesting([], { engage: MARS, tilePx: SURFACE_TILE_PX }));
    expect(stream.residency.engagedBodyId()).toBe('mars');
    expect(stream.debugStats().used).toBe(0);

    stream.apply(requesting([], ENGAGE_EARTH));
    expect(stream.residency.residentSlot(albedo(0))).toBeNull();
    expect(stream.residency.residentSlot(height(0))).toBeNull();
  });

  it('keep holds residency through a pull-back, and re-engages from scratch after a release', async () => {
    const stream = await engagedWith();
    const fetches = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;
    stream.apply(IDLE_SURFACE_TILE_PLAN);
    stream.apply(plan({ touched: [albedo(0)] }));
    expect(stream.residency.residentSlot(albedo(0))).not.toBeNull();
    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length).toBe(fetches);

    stream.apply(plan({ verdict: 'release' }));
    stream.apply(requesting([albedo(0)], ENGAGE_EARTH));
    expect(stream.residency.engagedBodyId()).toBe('earth');
    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length).toBe(fetches + 1);
  });
});

describe('surfaceTileStream residency', () => {
  it('resolves a landed tile to a slot-sized rect stamped in real time, and nothing else', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(54_321);
    const stream = await engagedWith();
    nowSpy.mockRestore();

    const resolved = stream.residency.residentSlot(albedo(0));
    // REAL time, so a fade runs while the sim clock is paused.
    expect(resolved?.readyAtMs).toBe(54_321);
    const slotFraction = SURFACE_TILE_PX / SURFACE_TILE_ATLAS_SIDE;
    expect(resolved!.atlasUvScale[0]).toBeCloseTo(slotFraction);
    expect(resolved!.atlasUvScale[1]).toBeCloseTo(slotFraction);
    const slotsX = resolved!.atlasUvOrigin[0] / slotFraction;
    expect(slotsX).toBeCloseTo(Math.round(slotsX));
    expect(stream.residency.residentSlot(albedo(9, 9))).toBeNull();
    // Same (z, x, y), other product: keyed by the full tile path.
    expect(stream.residency.residentSlot(height(0))).toBeNull();
  });

  it('names a key in flight until it lands, and a failed key as failed', async () => {
    // Bug caught: an in-flight key planned as a miss, allocated and fetched twice.
    const stream = await streamWithManifest();
    const fetch = deferred<ImageBitmap | null>();
    vi.mocked(fetchSurfaceTileBitmap).mockReturnValueOnce(fetch.promise);
    vi.mocked(fetchSurfaceTileBitmap).mockResolvedValueOnce(null);
    stream.apply(requesting([albedo(0), albedo(1)], ENGAGE_EARTH));
    await tick();

    expect(stream.residency.isInFlight(albedo(0))).toBe(true);
    expect(stream.residency.hasFailed(albedo(1))).toBe(true);
    expect(stream.residency.hasFailed(albedo(0))).toBe(false);
    fetch.resolve(bitmap());
    await tick();
    expect(stream.residency.isInFlight(albedo(0))).toBe(false);
    expect(stream.residency.residentSlot(albedo(0))).not.toBeNull();
  });

  it('lands a height tile in the height atlas, resolved against its own slot geometry', async () => {
    const stream = await engagedWith([height(0)]);

    const resolved = stream.residency.residentSlot(height(0));
    expect(stream.residency.residentSlot(albedo(0))).toBeNull();
    const slotFraction = HEIGHT_POSTS_PER_TILE / HEIGHT_TILE_ATLAS_SIDE;
    expect(resolved!.atlasUvScale[0]).toBeCloseTo(slotFraction);
    expect(resolved!.subtreeRangeM).toEqual([-10, 20]);
    const stats = stream.debugStats();
    expect(stats.height).toEqual({
      used: 1,
      capacity: (HEIGHT_TILE_ATLAS_SIDE / HEIGHT_POSTS_PER_TILE) ** 2,
    });
    // The per-level rows stay albedo's: a height tile there reads as albedo the walk lacks.
    expect(stats.levels).toEqual([]);
  });

  it('an upload into a recycled slot is dropped and never reported resident', async () => {
    // Bug caught: the cut names a slot holding another tile.
    const stream = await streamWithManifest();
    const late = deferred<ImageBitmap | null>();
    vi.mocked(fetchSurfaceTileBitmap).mockReturnValueOnce(late.promise);
    stream.apply(requesting([albedo(0)], ENGAGE_EARTH));
    vi.mocked(fetchSurfaceTileBitmap).mockImplementation(async () => bitmap());
    const side = SURFACE_TILE_ATLAS_SIDE / SURFACE_TILE_PX;
    const filling = Array.from({ length: SLOT_COUNT }, (_, i) =>
      albedo((i % side) + 1, Math.floor(i / side)),
    );
    stream.apply(requesting(filling));
    await tick();

    const close = vi.fn();
    late.resolve(bitmap(close));
    await tick();

    expect(stream.residency.residentSlot(albedo(0))).toBeNull();
    expect(close).toHaveBeenCalled();
    expect(stream.debugStats().used).toBe(SLOT_COUNT);
  });
});

describe('surfaceTileStream apply order', () => {
  it('touches every listed key before allocating any request', async () => {
    // Bug caught: a resident tile this frame needs evicted for a miss, then
    // refetched — the flash-in/out of the eviction cascade.
    const side = SURFACE_TILE_ATLAS_SIDE / SURFACE_TILE_PX;
    const filling = Array.from({ length: SLOT_COUNT }, (_, i) =>
      albedo(i % side, Math.floor(i / side)),
    );
    const stream = await engagedWith(filling);
    expect(stream.debugStats().used).toBe(SLOT_COUNT);
    const fetches = vi.mocked(fetchSurfaceTileBitmap).mock.calls.length;

    stream.apply(
      plan({
        touched: filling,
        requests: [{ tile: albedo(99, 99), screenPx: 2000 }],
      }),
    );
    await tick();

    expect(vi.mocked(fetchSurfaceTileBitmap).mock.calls.length).toBe(fetches);
    expect(filling.every((tile) => stream.residency.residentSlot(tile) !== null)).toBe(true);
    // The refused allocation is counted, not swallowed.
    expect(stream.debugStats().droppedAllocations).toBe(1);
  });
});

describe('surfaceTileStream terrain', () => {
  // Small enough u/v that the z5 and z6 leaves both floor to (0, 0), whose z5
  // ancestor is `height(0)`.
  const DIR = equirectUvToDirection([0.01, 0.99]);
  const CODE = 0x204060;
  const uniformGrid = () => {
    const grid = new Uint8Array(HEIGHT_GRID_BYTES);
    for (let i = 0; i < grid.length; i += 3)
      grid.set([CODE >> 16, (CODE >> 8) & 0xff, CODE & 0xff], i);
    return grid;
  };

  const paramsAt = (baseLevel: number) => derivePlannerParams(manifestOf(PREFIX), baseLevel);

  async function withUniformHeight() {
    vi.mocked(fetchHeightTile).mockImplementation(async () => heightImage(uniformGrid()));
    const stream = await streamWithManifest();
    stream.apply(requesting([height(0)], ENGAGE_EARTH));
    await tick();
    return stream;
  }

  it('reads the resident grid for the engaged body, and nothing for another', async () => {
    // Bug caught: Mars' camera standing on Earth's terrain.
    const stream = await withUniformHeight();
    const params = paramsAt(BASE_LEVEL);
    expect(stream.heightAt(EARTH, DIR, params)).toBeCloseTo(codeHeightM(CODE), 6);
    expect(stream.residentHeightLevelAt(EARTH, DIR, params)).toBe(MIN_TILE_LEVEL);
    expect(stream.heightAt(MARS, DIR, params)).toBe(0);
    expect(stream.residentHeightLevelAt(MARS, DIR, params)).toBeNull();
  });

  it("climbs no lower than the plan's base level", async () => {
    // Bug caught: a tier swap reading a tile the bound base texture already covers.
    const stream = await withUniformHeight();
    const params = paramsAt(MIN_TILE_LEVEL);
    expect(stream.heightAt(EARTH, DIR, params)).toBe(0);
    expect(stream.residentHeightLevelAt(EARTH, DIR, params)).toBeNull();
  });
});

describe('surfaceTileStream debug stats', () => {
  it('reports residency by level and the deepest keys once engaged', async () => {
    const stream = await engagedWith();
    expect(stream.debugStats()).toEqual({
      engaged: true,
      bodyId: 'earth',
      capacity: SLOT_COUNT,
      used: 1,
      height: { used: 0, capacity: (HEIGHT_TILE_ATLAS_SIDE / HEIGHT_POSTS_PER_TILE) ** 2 },
      levels: [{ z: MIN_TILE_LEVEL, resident: 1, pending: 0 }],
      droppedAllocations: 0,
      deepestLevelKeys: ['0,0'],
    });
  });
});
