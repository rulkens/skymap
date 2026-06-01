/**
 * texturedDiskSubsystem — famous-galaxy calibration wiring.
 *
 * The planner overrides catalog geometry with a row's hand-authored
 * `FamousCalibration` for the EMITTED DiskInstance only:
 *   - size scales by `1 / diskRadiusFrac` (a half-frame disk renders a
 *     double-size quad so the disk inside spans the catalog size),
 *   - tilt follows `effectiveTilt` (deprojected → PA + axisRatio re-applied;
 *     as-shot → flat),
 *   - the nucleus offset (`nucleusCorner`) slides the quad so the curated
 *     nucleus lands on the catalog point.
 *
 * Only `Source.Famous` rows consult the calibration; every other source —
 * and every uncalibrated Famous row — stays bit-identical to the catalog
 * path with a centred ([0, 0]) nucleus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createTexturedDiskSubsystem } from '../../../../src/services/engine/subsystems/texturedDiskSubsystem';
import { paddedRadiusMpc } from '../../../../src/utils/galaxySize';
import { fallbackOrientation } from '../../../../src/utils/random/fallbackOrientation';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';

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

const DKPC = 50;

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
    diameterKpc: fill(DKPC),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
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

function makeInput(
  catalogs: Map<SourceType, GalaxyCatalog>,
  famousMeta: FamousMetaEntry[] = [],
  mask = 0xffffffff,
) {
  const cam = makeCam();
  return {
    cam,
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    famousMeta,
  };
}

/** One famousMeta record carrying a calibration at local index `idx`. */
function metaWithCalibration(idx: number, calibration: FamousCalibration): FamousMetaEntry[] {
  const out: FamousMetaEntry[] = [];
  for (let i = 0; i <= idx; i++) {
    out[i] = {
      id: `g${i}`,
      names: [],
      description: '',
      type: 'galaxy',
      ...(i === idx ? { calibration } : {}),
    };
  }
  return out;
}

/**
 * Runs the planner twice (enqueue → bitmap → emit) and returns the
 * single emitted DiskInstance.  The harness builds one calibrated row at
 * index 0 of a 1-row cloud so the sort order is unambiguous.
 */
async function emitOne(source: SourceType, cloud: GalaxyCatalog, famousMeta: FamousMetaEntry[]) {
  const device = makeFakeDevice();
  const fetcher = vi.fn(async () => makeFakeBitmap());
  const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
  const sys = createTexturedDiskSubsystem({
    device,
    atlas,
    requestRender: () => {},
    fetcher,
    decimationFactor: 1,
  });
  const clouds = new Map([[source, cloud]]);
  sys.runFrame(makeInput(clouds, famousMeta));
  await new Promise((r) => setTimeout(r, 0));
  const out = sys.runFrame(makeInput(clouds, famousMeta));
  return out.disks;
}

describe('texturedDiskSubsystem famous calibration', () => {
  beforeEach(() => {
    // Each test builds its own device + subsystem via emitOne; nothing
    // shared to reset here, but the hook keeps parity with the sibling
    // suite's structure.
  });

  const uncalibratedSize = paddedRadiusMpc(DKPC) * 2;

  it('calibrated diskRadiusFrac scales the emitted disk', async () => {
    // frac 0.5 → the disk fills half the frame → the quad doubles so the
    // disk inside still spans the catalog size.
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 0.5,
      frameMajorAxisDeg: 0,
      deprojected: false,
    };
    const disks = await emitOne(Source.Famous, makeDenseCloud(1), metaWithCalibration(0, cal));
    expect(disks.length).toBe(1);
    expect(disks[0]!.sizeWorld).toBeCloseTo(uncalibratedSize * 2, 10);
  });

  it('uncalibrated rows use catalog size and orientation', async () => {
    const disks = await emitOne(Source.Famous, makeDenseCloud(1, 0.7, 45), []);
    expect(disks.length).toBe(1);
    expect(disks[0]!.sizeWorld).toBeCloseTo(uncalibratedSize, 10);
    // Catalog 0.7 round-trips through the Float32Array store, so the
    // backward-compat passthrough lands on Math.fround(0.7), not the literal.
    expect(disks[0]!.axisRatio).toBe(Math.fround(0.7));
    expect(disks[0]!.positionAngleDeg).toBe(45);
    expect(disks[0]!.nucleusOffset).toEqual([0, 0]);
  });

  it('a deprojected entry keeps PA + axisRatio tilt', async () => {
    // deprojected → effectiveTilt re-applies the calibration's PA and its
    // axisRatio override (here 0.6, distinct from the catalog 0.7).
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      frameMajorAxisDeg: 37,
      axisRatio: 0.6,
      deprojected: true,
    };
    const disks = await emitOne(
      Source.Famous,
      makeDenseCloud(1, 0.7, 45),
      metaWithCalibration(0, cal),
    );
    expect(disks[0]!.axisRatio).toBe(0.6);
    expect(disks[0]!.positionAngleDeg).toBe(37);
  });

  it('an as-shot entry renders flat', async () => {
    // deprojected false → the image already carries the inclination, so
    // the disk renders flat (axisRatio 1, PA 0) — no double-squash.
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      frameMajorAxisDeg: 37,
      axisRatio: 0.6,
      deprojected: false,
    };
    const disks = await emitOne(
      Source.Famous,
      makeDenseCloud(1, 0.7, 45),
      metaWithCalibration(0, cal),
    );
    expect(disks[0]!.axisRatio).toBe(1);
    expect(disks[0]!.positionAngleDeg).toBe(0);
  });

  it('a calibrated nucleus offsets the emitted instance', async () => {
    // center.x 0.25 → corner.x -0.5; center.y 0.5 → corner.y 0.
    const cal: FamousCalibration = {
      center: [0.25, 0.5],
      diskRadiusFrac: 1,
      frameMajorAxisDeg: 0,
      deprojected: false,
    };
    const disks = await emitOne(Source.Famous, makeDenseCloud(1), metaWithCalibration(0, cal));
    expect(disks[0]!.nucleusOffset).toEqual([-0.5, 0]);
  });

  it('calibration only affects Source.Famous rows', async () => {
    // A non-Famous source with a same-index meta entry carrying a
    // calibration must be ignored — catalog geometry stands, nucleus
    // stays centred.
    const cal: FamousCalibration = {
      center: [0.25, 0.5],
      diskRadiusFrac: 0.5,
      frameMajorAxisDeg: 37,
      axisRatio: 0.6,
      deprojected: true,
    };
    const disks = await emitOne(
      Source.SDSS,
      makeDenseCloud(1, 0.7, 45),
      metaWithCalibration(0, cal),
    );
    expect(disks.length).toBe(1);
    expect(disks[0]!.sizeWorld).toBeCloseTo(uncalibratedSize, 10);
    // Catalog 0.7 round-trips through the Float32Array store, so the
    // backward-compat passthrough lands on Math.fround(0.7), not the literal.
    expect(disks[0]!.axisRatio).toBe(Math.fround(0.7));
    expect(disks[0]!.positionAngleDeg).toBe(45);
    expect(disks[0]!.nucleusOffset).toEqual([0, 0]);
  });

  it('no-calibration disks are bit-identical to the pre-feature catalog path', async () => {
    // Fallback-orientation rows carry deterministic but arbitrary ar/pa that
    // the build pipeline's fallback detector matches by EXACT float equality
    // (see buildFamous's fallbackOrientation comparison).  The calibration
    // path must not perturb an uncalibrated row by even one ULP, or that
    // detector silently stops firing.  Assert every emitted field equals the
    // catalog Float32 value bit-for-bit (toBe, not toBeCloseTo).
    const sentinel = fallbackOrientation(0n, 187.7, 12.4);
    const cloud = makeDenseCloud(1, sentinel.axisRatio, sentinel.positionAngleDeg);
    const disks = await emitOne(Source.Famous, cloud, []);
    expect(disks.length).toBe(1);
    const d = disks[0]!;
    expect(d.x).toBe(cloud.positions[0]);
    expect(d.y).toBe(cloud.positions[1]);
    expect(d.z).toBe(cloud.positions[2]);
    expect(d.sizeWorld).toBe(paddedRadiusMpc(DKPC) * 2);
    expect(d.axisRatio).toBe(cloud.axisRatio[0]);
    expect(d.positionAngleDeg).toBe(cloud.positionAngleDeg[0]);
    expect(d.nucleusOffset).toEqual([0, 0]);
  });
});
