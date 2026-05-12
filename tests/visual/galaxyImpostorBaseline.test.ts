/**
 * Visual baseline — galaxy impostor draw-call sequence.
 *
 * Captures the per-frame sequence of renderer.draw() invocations the
 * legacy `thumbnailSubsystem.runFrame` produces given a fixed fixture.
 * Any refactor that re-arranges, re-orders, or alters the instance
 * payload of these draw calls flips this test red.  See tests/visual/
 * README.md for the rationale on hash-based snapshotting vs. pixel
 * readback.
 */

import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';

import { Source } from '../../src/data/sources';
import { createThumbnailSubsystem } from '../../src/services/engine/subsystems/thumbnailSubsystem';
import type { PointCloud } from '../../src/@types/data/PointCloud';
import type { OrbitCamera } from '../../src/@types/camera/OrbitCamera';
import type { TexturedQuadRenderer } from '../../src/@types/rendering/TexturedQuadRenderer';
import type { TexturedDiskRenderer } from '../../src/@types/rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../src/@types/rendering/ProceduralDiskRenderer';

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

function makeCloud(count: number): PointCloud {
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
    target: new Float32Array([10, 0, 0]),
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

function roundTo6dp(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function hashInstances(instances: ReadonlyArray<object>): string[] {
  // Stable: sort keys, round numeric fields to 6 dp.  Returns one entry
  // per instance so vitest array-diffs each instance on its own line —
  // a single renamed field surfaces as a one-line red/green diff rather
  // than a 1.5 KB string blob.
  const parts: string[] = [];
  for (const ins of instances) {
    const rec = ins as Record<string, unknown>;
    const sortedKeys = Object.keys(rec).sort();
    const kv: string[] = [];
    for (const k of sortedKeys) {
      const v = rec[k];
      kv.push(`${k}=${typeof v === 'number' ? roundTo6dp(v) : String(v)}`);
    }
    parts.push(kv.join('|'));
  }
  return parts;
}

type DrawRecord = { renderer: string; count: number; hashes: readonly string[] };

describe('galaxy-impostor visual baseline', () => {
  it('emits the same draw sequence given a fixed camera + cloud fixture', async () => {
    // Pin performance.now() to a synthetic clock.  The legacy subsystem
    // derives a per-quad `fadeAlpha` from `(performance.now() - bitmapReadyTime) / LOAD_FADE_MS`;
    // without a fixed clock the wall-clock gap between Frame 1 fetch
    // completion and Frame 2's `nowMs` read varies across runs (warm
    // module cache vs cold, GC pauses, host load), changing fadeAlpha
    // by ~5-10 ULP at 6-dp rounding.  We advance the clock by exactly
    // 50 ms between frames so the load-fade lerp lands on a stable value
    // (50/400 = 0.125 of the load-fade ramp).  Restored in `finally`.
    let nowFake = 1_000_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowFake);

    const device = makeFakeDevice();
    const quadDraw = vi.fn();
    const diskDraw = vi.fn();
    const procDraw = vi.fn();
    // `as unknown as <RendererType>` (not `as any`) so a future signature
    // change on any of the three renderer handles breaks type-check at
    // this site — that's the whole point of these baselines.
    const quad = {
      bindAtlas: vi.fn(),
      draw: quadDraw,
      label: 'texturedQuadRenderer',
    } as unknown as TexturedQuadRenderer;
    const disk = {
      bindAtlas: vi.fn(),
      draw: diskDraw,
      label: 'texturedDiskRenderer',
    } as unknown as TexturedDiskRenderer;
    const procDisk = {
      draw: procDraw,
      label: 'proceduralDiskRenderer',
    } as unknown as ProceduralDiskRenderer;

    const sys = createThumbnailSubsystem({
      device,
      requestRender: () => {},
      fetcher: async () => ({ width: 128, height: 128, close: () => {} } as unknown as ImageBitmap),
      decimationFactor: 1,
    });
    sys.bindToRenderers(quad, disk, procDisk);

    const cam = makeCam();
    const clouds = new Map([[Source.SDSS, makeCloud(8)]]);
    const input = {
      cam,
      clouds,
      visibleSourceMask: 0xffffffff,
      canvasSize: { width: 1280, height: 720 },
      pass: {} as GPURenderPassEncoder,
      viewProj: new Float32Array(16) as unknown as mat4,
      pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
      camPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
        [number, number, number]
      >,
      texturedQuadRenderer: quad,
      texturedDiskRenderer: disk,
      famousMeta: [],
      famousXrefs: {},
    };

    // Frame 1: kicks off fetches; bitmaps land via microtask drain.
    sys.runFrame(input);
    await new Promise((r) => setTimeout(r, 0));

    // Advance the synthetic clock by 50 ms — bitmapReadyTime was
    // recorded at nowFake=1_000_000 inside the onResult callback above,
    // so the next frame sees loadFade = 50/400 = 0.125 deterministically.
    nowFake += 50;

    // Frame 2: bitmaps ready; the disk/quad paths fire.
    quadDraw.mockClear();
    diskDraw.mockClear();
    procDraw.mockClear();
    sys.runFrame(input);

    const records: DrawRecord[] = [];
    if (quadDraw.mock.calls.length > 0) {
      // texturedQuadRenderer.draw(pass, viewProj, viewportPx, instances, camPosWorld, pxPerRad)
      // — instances is positional arg 3.
      const instances = quadDraw.mock.calls[0]![3] as ReadonlyArray<object>;
      records.push({
        renderer: 'texturedQuadRenderer',
        count: instances.length,
        hashes: hashInstances(instances),
      });
    }
    if (diskDraw.mock.calls.length > 0) {
      // texturedDiskRenderer.draw(pass, viewProj, viewportPx, camPos, instances)
      // — instances is positional arg 4 (camPos comes before instances here,
      // unlike the thumbnail/procedural signatures).
      const instances = diskDraw.mock.calls[0]![4] as ReadonlyArray<object>;
      records.push({
        renderer: 'texturedDiskRenderer',
        count: instances.length,
        hashes: hashInstances(instances),
      });
    }
    if (procDraw.mock.calls.length > 0) {
      // proceduralDiskRenderer.draw(pass, viewProj, viewport, camPosWorld, pxPerRad, instances)
      // — instances is positional arg 5 (trails camPos + pxPerRad).
      const instances = procDraw.mock.calls[0]![5] as ReadonlyArray<object>;
      records.push({
        renderer: 'proceduralDiskRenderer',
        count: instances.length,
        hashes: hashInstances(instances),
      });
    }

    try {
      expect(records).toMatchInlineSnapshot(`
        [
          {
            "count": 8,
            "hashes": [
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.4375|u1=0.5|v0=0|v1=0.0625|x=10|y=0.007|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.375|u1=0.4375|v0=0|v1=0.0625|x=10|y=0.006|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.3125|u1=0.375|v0=0|v1=0.0625|x=10|y=0.005|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.25|u1=0.3125|v0=0|v1=0.0625|x=10|y=0.004|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.1875|u1=0.25|v0=0|v1=0.0625|x=10|y=0.003|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.125|u1=0.1875|v0=0|v1=0.0625|x=10|y=0.002|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0.0625|u1=0.125|v0=0|v1=0.0625|x=10|y=0.001|z=0",
              "axisRatio=0.7|fadeAlpha=0.125|positionAngleDeg=45|sizeWorld=0.2|u0=0|u1=0.0625|v0=0|v1=0.0625|x=10|y=0|z=0",
            ],
            "renderer": "texturedDiskRenderer",
          },
          {
            "count": 8,
            "hashes": [
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.007|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.006|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.005|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.004|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.003|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.002|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0.001|z=0",
              "axisRatio=0.7|colourIndex=0|crossfadeAlpha=1|positionAngleDeg=45|sizeWorldMpc=0.2|x=10|y=0|z=0",
            ],
            "renderer": "proceduralDiskRenderer",
          },
        ]
      `);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
