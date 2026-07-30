/**
 * texturedDiskSubsystem — famous-galaxy calibration wiring.
 *
 * The planner overrides catalog geometry with a row's hand-authored
 * `FamousCalibration` for the EMITTED DiskInstance only:
 *   - size scales by `1 / diskRadiusFrac` (a half-frame disk renders a
 *     double-size quad so the disk inside spans the catalog size),
 *   - tilt follows `effectiveTilt` (deprojected → catalog PA + axisRatio,
 *     i.e. the real 3D plane; as-shot → flat),
 *   - the nucleus offset (`nucleusCorner`) slides the quad so the curated
 *     nucleus lands on the catalog point.
 *
 * Only `Source.FamousGalaxy` rows consult the calibration; every other source —
 * and every uncalibrated Famous row — stays bit-identical to the catalog
 * path with a centred ([0, 0]) nucleus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createTexturedDiskSubsystem } from '../../../../src/services/engine/subsystems/texturedDiskSubsystem';
import { createProceduralDiskSubsystem } from '../../../../src/services/engine/subsystems/proceduralDiskSubsystem';
import { createDiskPlannerWalk } from '../../../../src/services/engine/subsystems/diskPlannerWalk';
import { runProceduralSolo, runTexturedSolo } from './diskWalkHarness';
import { paddedRadiusMpc } from '../../../../src/utils/paddedRadiusMpc';
import { fallbackOrientation } from '../../../../src/utils/random/fallbackOrientation';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { FamousCalibration } from '../../../../src/@types/loading/FamousCalibration';
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
    diameterKpc: fill(DKPC),
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

function makeInput(
  catalogs: Map<SourceType, GalaxyCatalog>,
  famousGalaxiesMeta: FamousGalaxyMetaEntry[] = [],
  mask = 0xffffffff,
) {
  const cam = makeCam();
  return {
    cam,
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    famousGalaxiesMeta,
    nowMs: 0,
    // Live surface-brightness sliders, needed by the procedural body's
    // frame input; the textured body ignores them.
    sbScale: 5,
    sbMax: 30,
    brightness: 1,
  };
}

/** One famousGalaxiesMeta record carrying a calibration at local index `idx`. */
function metaWithCalibration(idx: number, calibration: FamousCalibration): FamousGalaxyMetaEntry[] {
  const out: FamousGalaxyMetaEntry[] = [];
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
async function emitOne(
  source: SourceType,
  cloud: GalaxyCatalog,
  famousGalaxiesMeta: FamousGalaxyMetaEntry[],
) {
  const device = makeFakeDevice();
  const fetcher = vi.fn(async () => makeFakeBitmap());
  const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
  const walk = createDiskPlannerWalk({ decimationFactor: 1 });
  const sys = createTexturedDiskSubsystem({
    device,
    atlas,
    fetcher,
  });
  const clouds = new Map([[source, cloud]]);
  runTexturedSolo(walk, sys, makeInput(clouds, famousGalaxiesMeta));
  await new Promise((r) => setTimeout(r, 0));
  const out = runTexturedSolo(walk, sys, makeInput(clouds, famousGalaxiesMeta));
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
      deprojected: false,
    };
    const disks = await emitOne(
      Source.FamousGalaxy,
      makeDenseCloud(1),
      metaWithCalibration(0, cal),
    );
    expect(disks.length).toBe(1);
    expect(disks[0]!.sizeWorld).toBeCloseTo(uncalibratedSize * 2, 10);
  });

  it('uncalibrated rows use catalog size and orientation', async () => {
    const disks = await emitOne(Source.FamousGalaxy, makeDenseCloud(1, 0.7, 45), []);
    expect(disks.length).toBe(1);
    expect(disks[0]!.sizeWorld).toBeCloseTo(uncalibratedSize, 10);
    // Catalog 0.7 round-trips through the Float32Array store, so the
    // backward-compat passthrough lands on Math.fround(0.7), not the literal.
    expect(disks[0]!.axisRatio).toBe(Math.fround(0.7));
    expect(disks[0]!.positionAngleDeg).toBe(45);
    expect(disks[0]!.nucleusOffset).toEqual([0, 0]);
  });

  it('a deprojected entry renders in the catalog 3D plane', async () => {
    // deprojected → the face-on texture re-projects on the galaxy's real
    // plane, so the emitted disk carries the CATALOG ar/pa (here 0.7 / 45),
    // identical to the procedural and uncalibrated paths.  The calibration
    // contributes no orientation.
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      deprojected: true,
    };
    const disks = await emitOne(
      Source.FamousGalaxy,
      makeDenseCloud(1, 0.7, 45),
      metaWithCalibration(0, cal),
    );
    // Catalog 0.7 round-trips through the Float32Array store.
    expect(disks[0]!.axisRatio).toBe(Math.fround(0.7));
    expect(disks[0]!.positionAngleDeg).toBe(45);
  });

  it('an as-shot entry renders flat', async () => {
    // deprojected false → the image already carries the inclination, so
    // the disk renders flat (axisRatio 1, PA 0) — no double-squash.
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      deprojected: false,
    };
    const disks = await emitOne(
      Source.FamousGalaxy,
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
      deprojected: false,
    };
    const disks = await emitOne(
      Source.FamousGalaxy,
      makeDenseCloud(1),
      metaWithCalibration(0, cal),
    );
    expect(disks[0]!.nucleusOffset).toEqual([-0.5, 0]);
  });

  it('calibration only affects Source.FamousGalaxy rows', async () => {
    // A non-Famous source with a same-index meta entry carrying a
    // calibration must be ignored — catalog geometry stands, nucleus
    // stays centred.
    const cal: FamousCalibration = {
      center: [0.25, 0.5],
      diskRadiusFrac: 0.5,
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
    const disks = await emitOne(Source.FamousGalaxy, cloud, []);
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

describe('procedural ↔ textured orientation convergence', () => {
  it('a deprojected textured disk renders in the procedural disk plane', async () => {
    // The headline invariant of the disk-plane unification: a deprojected
    // calibrated row resolves to the SAME (axisRatio, positionAngleDeg) in the
    // textured LOD-2 planner as the procedural LOD-1 impostor uses — both the
    // catalog values — so the crossfade between them shows no orientation pop.
    const cloud = makeDenseCloud(1, 0.7, 45);
    const cal: FamousCalibration = {
      center: [0.5, 0.5],
      diskRadiusFrac: 1,
      deprojected: true,
    };

    const texturedDisks = await emitOne(Source.FamousGalaxy, cloud, metaWithCalibration(0, cal));
    expect(texturedDisks.length).toBe(1);

    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const proc = createProceduralDiskSubsystem();
    const procOut = runProceduralSolo(
      walk,
      proc,
      makeInput(new Map([[Source.FamousGalaxy, cloud]])),
    );
    expect(procOut.instances.length).toBe(1);

    const t = texturedDisks[0]!;
    const p = procOut.instances[0]!;
    // Catalog 0.7 round-trips through the Float32Array store.
    expect(t.axisRatio).toBe(Math.fround(0.7));
    expect(t.positionAngleDeg).toBe(45);
    // Textured deprojected tilt === procedural tilt === catalog tilt.
    expect(p.axisRatio).toBe(t.axisRatio);
    expect(p.positionAngleDeg).toBe(t.positionAngleDeg);
  });
});
