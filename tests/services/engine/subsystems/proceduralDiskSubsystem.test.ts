/**
 * proceduralDiskSubsystem — unit tests for the LOD-1 per-frame planner.
 *
 * Coverage focus:
 *   - emits a ProceduralDiskInstance for every galaxy whose apparent
 *     size is in the (8, ∞) band with finite orientation
 *   - emits nothing for galaxies below 8 px
 *   - emits nothing for galaxies with NaN axisRatio / positionAngleDeg
 *   - respects visibleSourceMask
 *   - stride decimation walks 1/N of the cloud per frame and the
 *     sticky map keeps un-visited galaxies on screen between sweeps
 *   - `lastOutput` is updated each runFrame
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createProceduralDiskSubsystem } from '../../../../src/services/engine/subsystems/proceduralDiskSubsystem';
import type { PointCloud } from '../../../../src/@types/data/PointCloud';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

function makeDenseCloud(count: number, ar = 0.7, pa = 45): PointCloud {
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

function makeInput(clouds: Map<Source, PointCloud>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    clouds,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
  };
}

describe('createProceduralDiskSubsystem', () => {
  it('emits one ProceduralDiskInstance per galaxy above 8 px with finite orientation', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = sys.runFrame(makeInput(clouds));
    expect(out.instances.length).toBe(4);
  });

  it('emits nothing for a cloud whose source bit is clear', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = sys.runFrame(makeInput(clouds, 0));
    expect(out.instances.length).toBe(0);
  });

  it('skips galaxies with NaN orientation', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4, NaN, NaN)]]);
    const out = sys.runFrame(makeInput(clouds));
    expect(out.instances.length).toBe(0);
  });

  it('decimationFactor=2 walks half the cloud per frame, sticky map covers gap', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 2 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out1 = sys.runFrame(makeInput(clouds));
    expect(out1.instances.length).toBe(2);
    const out2 = sys.runFrame(makeInput(clouds));
    // Frame 2: cursor visits the other 2 indices; sticky entries from
    // frame 1 persist, so total stays at 4.
    expect(out2.instances.length).toBe(4);
  });

  it('lastOutput mirrors the most recent runFrame return', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    expect(sys.lastOutput.instances.length).toBe(0);
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);
    sys.runFrame(makeInput(clouds));
    expect(sys.lastOutput.instances.length).toBe(2);
  });
});
