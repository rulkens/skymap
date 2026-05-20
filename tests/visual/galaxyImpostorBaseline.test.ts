/**
 * Visual baseline — post-split galaxy-impostor draw-call sequence.
 *
 * Drives the three new subsystems (galaxyAtlas + proceduralDisk +
 * texturedDisk) through one runFrame each, then asserts the
 * resulting `lastOutput` arrays hash to the same baseline the pre-split
 * snapshot recorded in Task 1.
 *
 * If this test fails after Task 11/12 cut over production: a planner's
 * extraction diverged from the legacy semantics.  Investigate before
 * proceeding.
 *
 * NOTE on `performance.now()` mocking:  the textured-impostor planner
 * derives a per-galaxy `fadeAlpha` from `(now - bitmapReadyTime) / 400ms`.
 * Without a fixed clock the elapsed wall time between bitmap-landing
 * (inside the microtask drain after Frame 1) and `nowMs` read in Frame 2
 * varies across runs, perturbing the rounded hash.  We mock `performance.now`
 * with a synthetic clock advanced by exactly 50 ms between frames so the
 * load-fade lerp lands deterministically on 50/400 = 0.125 — matching the
 * pre-split baseline's recorded value byte-for-byte.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../../src/services/engine/subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../../src/services/engine/subsystems/texturedDiskSubsystem';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog';
import type { OrbitCamera } from '../../src/@types/camera/OrbitCamera';

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

function makeCloud(count: number): GalaxyCatalog {
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
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
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

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function hashInstances(instances: ReadonlyArray<object>): string {
  const parts: string[] = [];
  for (const ins of instances) {
    const rec = ins as Record<string, unknown>;
    const sortedKeys = Object.keys(rec).sort();
    const kv: string[] = [];
    for (const k of sortedKeys) {
      const v = rec[k];
      kv.push(`${k}=${typeof v === 'number' ? round6(v) : String(v)}`);
    }
    parts.push(kv.join('|'));
  }
  return parts.join(';');
}

describe('galaxy-impostor visual baseline (post-split)', () => {
  it('emits the same lastOutput sequence given a fixed fixture', async () => {
    // Synthetic clock — see module docstring for why this is required for
    // deterministic load-fade.  Restored in `finally`.
    let nowFake = 1_000_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowFake);

    try {
      const device = makeFakeDevice();
      const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
      const procSys = createProceduralDiskSubsystem({ decimationFactor: 1 });
      const texSys = createTexturedDiskSubsystem({
        device,
        atlas,
        requestRender: () => {},
        fetcher: async () =>
          ({ width: 128, height: 128, close: () => {} }) as unknown as ImageBitmap,
        decimationFactor: 1,
      });

      const cam = makeCam();
      const catalogs = new Map([[Source.SDSS, makeCloud(8)]]);
      const pxPerRad = 720 / (2 * Math.tan(cam.fovYRad / 2));

      // Frame 1: kick off fetches; bitmaps land via microtask drain.
      procSys.runFrame({ cam, catalogs, visibleSourceMask: 0xffffffff, pxPerRad });
      texSys.runFrame({ cam, catalogs, visibleSourceMask: 0xffffffff, pxPerRad, famousMeta: [] });
      await new Promise((r) => setTimeout(r, 0));

      // Advance synthetic clock by 50 ms — bitmapReadyTime was recorded at
      // nowFake=1_000_000 inside the onResult callback above, so Frame 2
      // sees loadFade = 50/400 = 0.125 deterministically.
      nowFake += 50;

      // Frame 2: bitmaps ready; disk path fires.
      const procOut = procSys.runFrame({ cam, catalogs, visibleSourceMask: 0xffffffff, pxPerRad });
      const texOut = texSys.runFrame({
        cam,
        catalogs,
        visibleSourceMask: 0xffffffff,
        pxPerRad,
        famousMeta: [],
      });

      const summary = {
        procDisks: { count: procOut.instances.length, hash: hashInstances(procOut.instances) },
        texDisks: { count: texOut.disks.length, hash: hashInstances(texOut.disks) },
      };

      expect(summary).toMatchInlineSnapshot(`
        {
          "procDisks": {
            "count": 8,
            "hash": "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.007|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.006|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.005|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.004|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.003|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.002|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.001|z=0;axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0|z=0",
          },
          "texDisks": {
            "count": 8,
            "hash": "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.4375|u1=0.5|v0=0|v1=0.0625|x=10|y=0.007|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.375|u1=0.4375|v0=0|v1=0.0625|x=10|y=0.006|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.3125|u1=0.375|v0=0|v1=0.0625|x=10|y=0.005|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.25|u1=0.3125|v0=0|v1=0.0625|x=10|y=0.004|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.1875|u1=0.25|v0=0|v1=0.0625|x=10|y=0.003|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.125|u1=0.1875|v0=0|v1=0.0625|x=10|y=0.002|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.0625|u1=0.125|v0=0|v1=0.0625|x=10|y=0.001|z=0;axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0|u1=0.0625|v0=0|v1=0.0625|x=10|y=0|z=0",
          },
        }
      `);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
