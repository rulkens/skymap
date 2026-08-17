/**
 * hiResFamousSubsystem — unit tests for the LOD-3 per-frame planner.
 *
 * Coverage focus:
 *   - apparent-size gate (no entry under 120 px; smoothstep across the
 *     120 → 160 px crossfade band; full alpha above)
 *   - texture LRU allocation + LRU eviction by recent diameter (9 distinct
 *     famous galaxies push the smallest out)
 *   - fetch enqueue: idempotent, null → markFailed + no retry
 *   - fetcher is always called with `famousId` set (a missing famousId
 *     would silently fall through to SDSS/DSS and pollute the texture array)
 *   - destroy clears the texture's evict handler subscription
 *   - lastOutput mirrors runFrame return
 *
 * Camera placement: a galaxy lives at world `[10, 0, 0]` and the camera
 * sits at `[10 - camDist, 0, 0]`, so the squared-distance test reduces
 * to `camDist²` and the apparent-size formula collapses to
 * `px = (dMpcRow / camDist) * pxPerRad`.  We pre-compute `camDistFor(px)`
 * to pin tests at exact band boundaries (120 / 140 / 160 px) instead of
 * eyeballing camera positions.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createHiResFamousSubsystem } from '../../../../src/services/engine/subsystems/hiResFamousSubsystem';
import { createHiResFamousTexture } from '../../../../src/services/gpu/resources/hiResFamousTexture';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

const LAYER_SIDE = 1024;
const LAYER_COUNT = 8;

// Same screen-size baseline as the proceduralDiskSubsystem tests, so the
// math behaves identically across the planner suite.
const VIEWPORT_HEIGHT_PX = 720;
const FOV_Y_RAD = (60 * Math.PI) / 180;
const PX_PER_RAD = VIEWPORT_HEIGHT_PX / (2 * Math.tan(FOV_Y_RAD / 2));

function makeFakeDevice(): GPUDevice {
  const fakeTexture = {
    createView: vi.fn(() => ({}) as GPUTextureView),
    destroy: vi.fn(),
  };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeFakeBitmap(): ImageBitmap {
  return { width: LAYER_SIDE, height: LAYER_SIDE, close: () => {} } as unknown as ImageBitmap;
}

/**
 * One famous galaxy at world `[10, 0, 0]`, diameter `diameterKpc`, with
 * finite orientation.  When count > 1, galaxies share the position so a
 * single camera placement pins the same apparent size for all of them
 * (good enough for the LRU + ignored-source tests; the alpha-pinning
 * tests use count=1).
 */
function makeFamousCloud(count: number, diameterKpc = 50): GalaxyCatalog {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return makeGalaxyCatalog(count, {
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
    diameterKpc: fill(diameterKpc),
  });
}

/** Camera placed at `[10 - camDist, 0, 0]` (galaxy at `[10, 0, 0]`). */
function makeCam(camDistMpc: number): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: camDistMpc,
    yaw: 0,
    pitch: 0,
    fovYRad: FOV_Y_RAD,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([10 - camDistMpc, 0, 0]),
  } as unknown as OrbitCamera;
}

/** Solve the apparent-size equation for `camDist` given a target px. */
function camDistFor(px: number, diameterKpc = 50): number {
  const dMpc = diameterKpc / 1000;
  return (dMpc * PX_PER_RAD) / px;
}

function makeInput(
  catalogs: Map<SourceType, GalaxyCatalog>,
  camDist: number,
  famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[],
  mask = 0xffffffff,
) {
  return {
    cam: makeCam(camDist),
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: PX_PER_RAD,
    famousGalaxiesMeta,
  };
}

function makeFamousGalaxiesMeta(count: number, idPrefix = 'fg-'): FamousGalaxyMetaEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}${i}`,
    names: [`name-${i}`],
    description: '',
    type: 'galaxy',
  }));
}

describe('createHiResFamousSubsystem', () => {
  it('runFrame emits hiResLayerIdx -1 for famous galaxies below the trigger band', () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
    // Camera far enough to put apparent size well below 120 px.
    const out = sys.runFrame(makeInput(clouds, camDistFor(50), makeFamousGalaxiesMeta(1)));
    expect(out.byFamousIdx.get(0)?.hiResLayerIdx ?? -1).toBe(-1);
    // Below-the-gate galaxies should never have triggered a fetch.
    expect(fetcher).not.toHaveBeenCalled();
    sys.destroy();
  });

  it('runFrame allocates a layer and emits the smoothstep alpha mid-band', async () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    texture.initTexture();
    const bitmap = makeFakeBitmap();
    const fetcher = vi.fn(async () => bitmap);
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
    const meta = makeFamousGalaxiesMeta(1);
    const input = makeInput(clouds, camDistFor(140), meta);

    // Frame 1 → enters the gate, allocates layer 0, enqueues a fetch.
    // Bitmap is not loaded yet so the planner emits hiResLayerIdx: -1.
    const out1 = sys.runFrame(input);
    expect(out1.byFamousIdx.get(0)?.hiResLayerIdx).toBe(-1);
    expect(out1.byFamousIdx.get(0)?.hiResCrossfadeAlpha).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Resolve the fetch — uploadBitmap runs in the .then() callback.
    await Promise.resolve();
    await Promise.resolve();

    // Frame 2 → bitmap is now loaded; emit hiResLayerIdx 0 + alpha 0.5.
    const out2 = sys.runFrame(input);
    expect(out2.byFamousIdx.get(0)?.hiResLayerIdx).toBe(0);
    // See the crossfade-pinpoints suite for the tolerance rationale —
    // FP roundtrip leaks ~1e-5 from the px math, well below 3 decimals.
    expect(out2.byFamousIdx.get(0)?.hiResCrossfadeAlpha).toBeCloseTo(0.5, 3);
    sys.destroy();
  });

  describe('crossfade alpha pinpoints', () => {
    /**
     * Helper: run the planner once with the bitmap pre-loaded so the
     * emitted alpha reflects the camera-pinned px exactly.  We prime the
     * texture by calling `allocate` + `uploadBitmap` directly before the
     * first runFrame.
     */
    async function alphaAtPx(targetPx: number): Promise<number> {
      const device = makeFakeDevice();
      const texture = createHiResFamousTexture({
        device,
        layerSide: LAYER_SIDE,
        layerCount: LAYER_COUNT,
      });
      texture.initTexture();
      // Pre-load the layer so the planner doesn't have to wait for a fetch.
      texture.allocate('0', targetPx);
      texture.uploadBitmap(0, makeFakeBitmap());
      const fetcher = vi.fn(async () => makeFakeBitmap());
      const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
      const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
      // Nudge camDist a hair closer so the FP roundtrip `targetPx →
      // camDist → px_observed` lands at-or-just-above the target.  The
      // smoothstep is steep enough at the boundaries that 0.01 px of
      // slop is invisible to the assertions (alpha diff ≤ 3e-4) and
      // crucially avoids the gate's strict `<` check rejecting the
      // 120 px lower-edge case.
      const camDist = camDistFor(targetPx + 0.01);
      const out = sys.runFrame(makeInput(clouds, camDist, makeFamousGalaxiesMeta(1)));
      const alpha = out.byFamousIdx.get(0)?.hiResCrossfadeAlpha ?? -1;
      sys.destroy();
      return alpha;
    }

    // Tolerance 3 (≤ 5e-4): the smoothstep math is exact, but the
    // upstream `px = (dMpc / camDist) * pxPerRad` roundtrip leaks ~1e-5
    // of float error that compounds through `t` and `t² (3 - 2t)`.
    // 3 decimals is plenty to pin the three band positions.
    it('alpha ≈ 0 at px = 120 (lower band edge)', async () => {
      expect(await alphaAtPx(120)).toBeCloseTo(0, 3);
    });
    it('alpha ≈ 0.5 at px = 140 (band midpoint)', async () => {
      expect(await alphaAtPx(140)).toBeCloseTo(0.5, 3);
    });
    it('alpha ≈ 1 at px = 160 (upper band edge)', async () => {
      expect(await alphaAtPx(160)).toBeCloseTo(1, 3);
    });
  });

  it('runFrame ignores non-Famous sources', () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    // SDSS-source cloud, camera close enough that any planner that walked
    // it would fire on every galaxy.  Expect zero emissions and zero fetches.
    const clouds = new Map([[Source.SDSS, makeFamousCloud(3)]]);
    const out = sys.runFrame(makeInput(clouds, camDistFor(300), makeFamousGalaxiesMeta(3)));
    expect(out.byFamousIdx.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    sys.destroy();
  });

  it('N=9 distinct famous galaxies in the band evict the smallest-recent layer', async () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    texture.initTexture();
    // Resolve every fetch synchronously with the same bitmap — the LRU
    // behaviour we're pinning is on the texture's allocator, not on the
    // bitmap pipeline.
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });

    // 9 distinct famous galaxies, each at a different world Y so their
    // ra/dec differ.  Diameters descending 300 → 220 kpc → apparent px
    // descending in the same order (when camera distance is fixed).
    const count = 9;
    const positions = new Float32Array(count * 3);
    const diameters = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = 10;
      positions[i * 3 + 1] = 0.001 * i;
      positions[i * 3 + 2] = 0;
      // Diameters ascend with i: 220, 230, ..., 300.  Iteration order
      // is also ascending, so i=0..7 fill the 8 layers (smallest first)
      // and i=8 (the largest, 300 kpc) arrives last.  Allocate evicts
      // when the caller is LARGER than the smallest resident, so i=8
      // displaces i=0 (the smallest, 220 kpc) — exactly the LRU
      // invariant under test.
      diameters[i] = 220 + i * 10;
    }
    const cloud: GalaxyCatalog = makeGalaxyCatalog(count, {
      objIDs: new BigUint64Array(count),
      positions,
      magU: new Float32Array(count).fill(20),
      magG: new Float32Array(count).fill(20),
      magR: new Float32Array(count).fill(20),
      magI: new Float32Array(count).fill(20),
      magZ: new Float32Array(count).fill(20),
      axisRatio: new Float32Array(count).fill(0.7),
      positionAngleDeg: new Float32Array(count).fill(45),
      diameterKpc: diameters,
    });
    const clouds = new Map([[Source.FamousGalaxy, cloud]]);
    const meta = makeFamousGalaxiesMeta(count);
    // Camera close enough that every galaxy clears the 120 px gate —
    // pin to the smallest galaxy (i=0, diameter 220 kpc): cam distance
    // such that diameter 220 gives ~210 px (well above the gate and the
    // crossfade band).  Larger diameters give even larger apparent sizes.
    const camDist = camDistFor(210, 220);
    sys.runFrame(makeInput(clouds, camDist, meta));

    expect(texture.layerForKey('0')).toBeUndefined(); // evicted
    expect(texture.layerForKey('8')).toBeDefined(); // new resident
    for (let i = 1; i <= 7; i++) {
      expect(texture.layerForKey(String(i))).toBeDefined();
    }
    sys.destroy();
  });

  it('fetcher null result calls markFailed and skips re-enqueue', async () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    texture.initTexture();
    const markFailedSpy = vi.spyOn(texture, 'markFailed');
    const fetcher = vi.fn(async () => null);
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
    const meta = makeFamousGalaxiesMeta(1);
    const input = makeInput(clouds, camDistFor(230), meta);

    sys.runFrame(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(markFailedSpy).toHaveBeenCalledWith('0');

    // Second frame must not re-enqueue: the failure flag is sticky.
    sys.runFrame(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    sys.destroy();
  });

  it('does not re-fetch after a missing-full.webp failure followed by eviction', async () => {
    // Regression for the 404-retry-storm bug: the texture's `failed`
    // flag lives on a LayerEntry and is dropped on eviction.  The
    // planner now owns a sticky `failedFamousIds` set keyed by the
    // curated asset id, so a galaxy whose `full.webp` is missing does
    // not re-dispatch a fetch every frame after its slot is evicted.
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    texture.initTexture();
    const fetcher = vi.fn(async () => null);
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
    const meta = makeFamousGalaxiesMeta(1);
    const input = makeInput(clouds, camDistFor(230), meta);

    // Frame 1: enters the gate, fetcher dispatched, returns null.
    sys.runFrame(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();

    // Simulate eviction by releasing the layer — this drops the
    // texture-side `failed` flag, the exact condition the bug
    // exploited.  Without the planner-side sticky set, frame 2 would
    // re-allocate and re-dispatch the 404.
    texture.release('0');

    // Frame 2: same galaxy still in the gate.  The planner must
    // recognise the famousId as permanently-failed and skip the fetch.
    sys.runFrame(input);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Frame 3 for good measure — still no retry.
    sys.runFrame(input);
    expect(fetcher).toHaveBeenCalledTimes(1);

    sys.destroy();
  });

  it('only calls fetcher with famousId set for galaxies that have one', async () => {
    // The fetcher's hi-res branch is gated on `famousId` — a missing
    // famousId would silently fall through to SDSS/DSS and pollute the
    // texture array with mis-scaled tiles.
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    texture.initTexture();
    // Typed signature on the mock so `fetcher.mock.calls[*][0]` carries
    // the argument shape (rather than being inferred as never[]).
    const fetcher = vi.fn(
      async (
        _args: import('../../../../src/@types/loading/FetchGalaxyBitmapInput').FetchGalaxyBitmapInput,
      ) => makeFakeBitmap(),
    );
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });

    // 3 distinct famous galaxies, each gated above 120 px.
    const cloud = makeFamousCloud(3, 50);
    // Spread them so each picks up a unique row index.
    cloud.positions[1 * 3 + 1] = 0.001;
    cloud.positions[2 * 3 + 1] = 0.002;
    const clouds = new Map([[Source.FamousGalaxy, cloud]]);
    const meta = makeFamousGalaxiesMeta(3);
    sys.runFrame(makeInput(clouds, camDistFor(230), meta));

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const call of fetcher.mock.calls) {
      const arg = call[0];
      expect(arg.famousId).toBeTruthy();
      expect(arg.fetchHiRes).toBe(true);
      expect(arg.hiResTargetDim).toBe(LAYER_SIDE);
    }
    sys.destroy();
  });

  it('destroy clears the texture evict handler subscription', () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    const setEvictHandlerSpy = vi.spyOn(texture, 'setEvictHandler');
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {} });
    // Constructor wires the handler.
    expect(setEvictHandlerSpy).toHaveBeenCalledTimes(1);
    expect(setEvictHandlerSpy.mock.calls[0]![0]).toBeTypeOf('function');

    sys.destroy();
    expect(setEvictHandlerSpy).toHaveBeenCalledTimes(2);
    expect(setEvictHandlerSpy.mock.calls[1]![0]).toBeUndefined();
  });

  it('lastOutput mirrors the most recent runFrame return', () => {
    const device = makeFakeDevice();
    const texture = createHiResFamousTexture({
      device,
      layerSide: LAYER_SIDE,
      layerCount: LAYER_COUNT,
    });
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const sys = createHiResFamousSubsystem({ texture, requestRender: () => {}, fetcher });
    expect(sys.lastOutput.byFamousIdx.size).toBe(0);
    const clouds = new Map([[Source.FamousGalaxy, makeFamousCloud(1)]]);
    const out = sys.runFrame(makeInput(clouds, camDistFor(230), makeFamousGalaxiesMeta(1)));
    expect(sys.lastOutput).toBe(out);
    expect(sys.lastOutput.byFamousIdx.size).toBe(1);
    sys.destroy();
  });
});
