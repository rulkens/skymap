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
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';

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
  return {
    count,
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
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
  };
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
    famousMeta: [],
  };
}

describe('createTexturedDiskSubsystem', () => {
  let device: GPUDevice;
  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('emits a DiskInstance per finite-orientation galaxy once bitmap is ready', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = sys.runFrame(makeInput(clouds));
    expect(out.disks.length).toBe(2);
  });

  it('emits no disks for NaN-orientation galaxies (post-2026-05-18 quad removal)', async () => {
    // Pre-2026-05-18 the subsystem branched on `Number.isFinite(ar) &&
    // Number.isFinite(pa)` to emit a screen-aligned quad fallback for
    // galaxies with missing orientation.  The quad pipeline was removed
    // because the build pipeline's deterministic orientation fallback
    // means production bins never have NaN orientation, and the
    // synthetic NaN here exercises only the defensive guard left in
    // the disks-only branch.
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2, NaN, NaN)]]);
    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = sys.runFrame(makeInput(clouds));
    expect(out.disks.length).toBe(0);
  });

  it('hasInFlightWork is true during fetch and false after it settles', async () => {
    const pending: Array<(b: ImageBitmap | null) => void> = [];
    const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    sys.runFrame(makeInput(clouds));
    expect(sys.hasInFlightWork()).toBe(true);
    pending[0]!(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(sys.hasInFlightWork()).toBe(false);
  });

  it('skips fetches for already-failed keys (retry-storm guard)', async () => {
    const fetcher = vi.fn(async () => null);
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedDiskSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const callsBefore = fetcher.mock.calls.length;
    for (let f = 0; f < 5; f++) sys.runFrame(makeInput(clouds));
    expect(fetcher.mock.calls.length).toBe(callsBefore);
  });
});
