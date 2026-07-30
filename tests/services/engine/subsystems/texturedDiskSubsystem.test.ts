/**
 * texturedDiskSubsystem — unit tests for the LOD-2 per-frame planner.
 *
 * Coverage focus:
 *   - allocates an atlas slot per visible-large-enough galaxy
 *   - schedules a fetch (idempotent on in-flight keys)
 *   - emits a DiskInstance when orientation is finite (px > 24 path)
 *   - emits a ThumbnailInstance when orientation is NaN
 *   - hasInFlightWork() flips with queue activity AND with the load-fade
 *     window
 *   - the atlas-eviction handler clears bitmapReadyTime
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createTexturedDiskSubsystem } from '../../../../src/services/engine/subsystems/texturedDiskSubsystem';
import { createDiskPlannerWalk } from '../../../../src/services/engine/subsystems/diskPlannerWalk';
import { runTexturedSolo } from './diskWalkHarness';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type {
  HiResFamousFrameOutput,
  HiResFamousPerGalaxyState,
  HiResFamousSubsystem,
} from '../../../../src/@types/engine/subsystems/HiResFamousSubsystem';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeFakeBitmap(): ImageBitmap {
  return { width: 128, height: 128, close: () => {} } as unknown as ImageBitmap;
}

function makeDenseCloud(count: number, ar = 0.7, pa = 45): GalaxyCatalog {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
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
    axisRatio: fill(ar),
    positionAngleDeg: fill(pa),
    diameterKpc: fill(50),
  });
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function makeInput(catalogs: Map<SourceType, GalaxyCatalog>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    famousGalaxiesMeta: [],
    nowMs: 0,
  };
}

describe('createTexturedDiskSubsystem', () => {
  let device: GPUDevice;
  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('emits a DiskInstance per finite-orientation galaxy once bitmap is ready', async () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = runTexturedSolo(walk, sys, makeInput(clouds));
    expect(out.disks.length).toBe(2);
  });

  it('emits no disks for NaN-orientation galaxies', async () => {
    // Production bins always carry finite orientation (the build
    // pipeline fills in a deterministic fallback). Synthetic NaN here
    // exercises the disks-only defensive guard.
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2, NaN, NaN)]]);
    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = runTexturedSolo(walk, sys, makeInput(clouds));
    expect(out.disks.length).toBe(0);
  });

  it('hasInFlightWork is true during fetch and false after it settles', async () => {
    const pending: Array<(b: ImageBitmap | null) => void> = [];
    const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    runTexturedSolo(walk, sys, makeInput(clouds));
    expect(sys.hasInFlightWork()).toBe(true);
    pending[0]!(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(sys.hasInFlightWork()).toBe(false);
  });

  // ── Hi-res LOD fold-in ──────────────────────────────────────────────
  // The planner emits two extra fields per DiskInstance:
  // `hiResLayerIdx` (sentinel -1 = no hi-res layer assigned) and
  // `hiResCrossfadeAlpha` (smoothstep ramp 0 → 1). Non-Famous sources
  // get -1 / 0 unconditionally (defensive — the shader gates the hi-res
  // sample on `hiResLayerIdx >= 0` anyway). For Famous-source rows the
  // planner reads per-galaxy state from the optional `hiResFamous` dep
  // keyed by catalog-local index `i`.

  function makeStubHiResFamous(
    byFamousIdx: ReadonlyMap<number, HiResFamousPerGalaxyState>,
  ): HiResFamousSubsystem {
    const lastOutput: HiResFamousFrameOutput = { byFamousIdx };
    return {
      runFrame: () => lastOutput,
      get lastOutput() {
        return lastOutput;
      },
      destroy: () => {},
    };
  }

  it('emits hiResLayerIdx -1 and hiResCrossfadeAlpha 0 by default (no hi-res dep)', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = runTexturedSolo(walk, sys, makeInput(clouds));
    expect(out.disks.length).toBe(2);
    for (const d of out.disks) {
      expect(d.hiResLayerIdx).toBe(-1);
      expect(d.hiResCrossfadeAlpha).toBe(0);
    }
  });

  it('with hiResFamous dep, Famous-source DiskInstance gets per-galaxy hi-res state', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const hiResFamous = makeStubHiResFamous(
      new Map([[0, { hiResLayerIdx: 2, hiResCrossfadeAlpha: 0.7 }]]),
    );
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
      hiResFamous,
    });
    const clouds = new Map([[Source.FamousGalaxy, makeDenseCloud(2)]]);

    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = runTexturedSolo(walk, sys, makeInput(clouds));

    // Row 0 carries the stubbed hi-res state; row 1 (missing from the
    // map) falls back to the -1 / 0 sentinel.
    expect(out.disks.length).toBe(2);
    // Planner sorts back-to-front; recover each instance via the
    // y-coordinate baked into makeDenseCloud (y = 0.001*i).
    const byIdx = new Map(out.disks.map((d) => [Math.round(d.y / 0.001), d]));
    expect(byIdx.get(0)?.hiResLayerIdx).toBe(2);
    expect(byIdx.get(0)?.hiResCrossfadeAlpha).toBeCloseTo(0.7);
    expect(byIdx.get(1)?.hiResLayerIdx).toBe(-1);
    expect(byIdx.get(1)?.hiResCrossfadeAlpha).toBe(0);
  });

  it('with hiResFamous dep, non-Famous-source DiskInstance still defaults to -1 / 0', async () => {
    // Defensive: byFamousIdx is keyed by Famous-source local index
    // only — even when an index happens to overlap a non-Famous
    // catalog's row, the planner must not fold it in.
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const hiResFamous = makeStubHiResFamous(
      new Map([[0, { hiResLayerIdx: 5, hiResCrossfadeAlpha: 1 }]]),
    );
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
      hiResFamous,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = runTexturedSolo(walk, sys, makeInput(clouds));
    expect(out.disks.length).toBe(2);
    for (const d of out.disks) {
      expect(d.hiResLayerIdx).toBe(-1);
      expect(d.hiResCrossfadeAlpha).toBe(0);
    }
  });

  it('setHiResFamous swaps the planner reference used by the next frame', async () => {
    // Tier-change contract: on tier flip the engine destroys the old
    // hi-res texture + planner pair and recreates them at the new
    // layerSide. Rebuilding the entire texturedDiskSubsystem would
    // invalidate sticky disk state and load-fade timing for ALL
    // galaxies, not just famous ones — instead the subsystem exposes a
    // setter that swaps just the planner reference, so the next
    // runFrame reads the new planner's byFamousIdx.
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const initial = makeStubHiResFamous(
      new Map([[0, { hiResLayerIdx: 1, hiResCrossfadeAlpha: 0.25 }]]),
    );
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
      hiResFamous: initial,
    });
    const clouds = new Map([[Source.FamousGalaxy, makeDenseCloud(1)]]);
    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));

    // Pre-swap: row 0 reflects the initial planner's state.
    const before = runTexturedSolo(walk, sys, makeInput(clouds)).disks;
    expect(before[0]?.hiResLayerIdx).toBe(1);
    expect(before[0]?.hiResCrossfadeAlpha).toBeCloseTo(0.25);

    // Swap the planner reference (simulates the tier-change rebuild).
    const next = makeStubHiResFamous(
      new Map([[0, { hiResLayerIdx: 6, hiResCrossfadeAlpha: 0.9 }]]),
    );
    sys.setHiResFamous(next);

    const after = runTexturedSolo(walk, sys, makeInput(clouds)).disks;
    expect(after[0]?.hiResLayerIdx).toBe(6);
    expect(after[0]?.hiResCrossfadeAlpha).toBeCloseTo(0.9);

    // setHiResFamous(undefined) detaches — emits the -1 / 0 sentinel.
    sys.setHiResFamous(undefined);
    const detached = runTexturedSolo(walk, sys, makeInput(clouds)).disks;
    expect(detached[0]?.hiResLayerIdx).toBe(-1);
    expect(detached[0]?.hiResCrossfadeAlpha).toBe(0);
  });

  it('skips fetches for already-failed keys (retry-storm guard)', async () => {
    const fetcher = vi.fn(async () => null);
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    runTexturedSolo(walk, sys, makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const callsBefore = fetcher.mock.calls.length;
    for (let f = 0; f < 5; f++) runTexturedSolo(walk, sys, makeInput(clouds));
    expect(fetcher.mock.calls.length).toBe(callsBefore);
  });
});
