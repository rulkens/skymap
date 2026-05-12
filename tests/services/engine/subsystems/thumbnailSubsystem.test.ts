/**
 * thumbnailSubsystem — unit tests for the per-frame galaxy-thumbnail
 * pipeline.  We mock the GPU device, the ThumbnailRenderer, and the
 * TexturedDiskRenderer with `vi.fn()` stubs so the subsystem can run end-to-
 * end without WebGPU.  The atlas's slot bookkeeping doesn't actually
 * need a device (it only touches `device.queue.copyExternalImageToTexture`
 * inside `uploadBitmap`), so we provide a minimal shim that swallows
 * those calls.
 *
 * Coverage focus:
 *   - retry-storm protection (bitmapFailed stops re-enqueue;
 *     bitmapReady stops re-enqueue; in-flight idempotency at the queue
 *     layer)
 *   - LRU eviction wires to onEvict and clears the parallel maps
 *   - the per-frame draw is gated by source visibility + apparent-size
 *     threshold
 *   - destroy() prevents in-flight callbacks from mutating state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';

// GPUTextureUsage / GPUBufferUsage / GPUShaderStage are populated by
// the shared `tests/setup/webgpuGlobals.ts` setupFile, which runs once
// per worker before any `import` here.
import {
  createThumbnailSubsystem,
  galaxyCacheKey,
} from '../../../../src/services/engine/subsystems/thumbnailSubsystem';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { PointCloud } from '../../../../src/@types/data/PointCloud';
import type { mat4 } from 'gl-matrix';

// ── Shared test fixtures ────────────────────────────────────────────────────

/**
 * Minimal GPUDevice shim — the subsystem only needs `device.queue.write*`
 * and `createTexture` to satisfy the atlas's `initTexture` + `uploadBitmap`
 * codepaths.  Each method is a noop spy so tests can assert call counts.
 */
function makeFakeDevice() {
  const fakeTexture = {
    createView: () => ({}) as GPUTextureView,
  };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return {
    createTexture: vi.fn(() => fakeTexture),
    queue,
  } as unknown as GPUDevice;
}

/**
 * Make a PointCloud with `count` galaxies arranged on the +x axis, each
 * 1 Mpc apart starting at x=10.  All have the same diameter (50 kpc),
 * round axis ratio, position angle 0.  Camera is placed near x=10 so
 * the first galaxy is huge on-screen.
 */
function makeCloud(count: number, diameterKpc = 50): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10 + i * 1; // x
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number) => {
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
    axisRatio: fill(1),
    positionAngleDeg: fill(0),
    diameterKpc: fill(diameterKpc),
  };
}

/**
 * Like `makeCloud`, but packs `count` galaxies tightly enough around
 * (10, 0, 0) Mpc that ALL of them stay above the 24-px apparent-size
 * threshold from the default camera vantage at (9.95, 0, 0).  Each
 * galaxy gets a unique (RA, Dec) pair so `galaxyCacheKey` produces
 * distinct keys and `atlas.allocate` returns distinct slots — without
 * the y-offset, every galaxy on the +x axis collapses to RA=0/Dec=0
 * and the priority queue's per-key dedupe would mask multi-galaxy
 * fetcher counts.
 *
 * Geometry: galaxy i sits at (10, 0.001·i, 0).  RA = atan2(0.001·i, 10)
 * ≈ 0.00573°·i — distinct after rounding to 5 dp.  camDist ≈ 0.05 Mpc
 * for i ≤ 25, giving px ≈ 624 (well above the 24-px gate).
 */
function makeDenseCloud(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number) => {
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
    axisRatio: fill(1),
    positionAngleDeg: fill(0),
    diameterKpc: fill(50),
  };
}

function makeCam(): OrbitCamera {
  // Position at origin, looking toward +x; FOV = 60deg.
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

/** Mock ThumbnailRenderer — only `bindAtlas` and `draw` are called. */
function makeMockThumbnailRenderer() {
  return {
    bindAtlas: vi.fn(),
    draw: vi.fn(),
  } as any;
}

/** Mock TexturedDiskRenderer — same surface as ThumbnailRenderer for our purposes. */
function makeMockTexturedDiskRenderer() {
  return {
    bindAtlas: vi.fn(),
    draw: vi.fn(),
  } as any;
}

/**
 * Mock ProceduralDiskRenderer.  Unlike Quad/TexturedDiskRenderer it doesn't
 * sample the atlas, so no `bindAtlas` — only `draw`.  The subsystem's
 * `bindToRenderers` stash-step writes the reference into a closure
 * variable rather than calling any method on it, so even an empty
 * object would work for tests that don't assert on draws; we keep
 * `draw` as a vi.fn() so future tests can assert per-frame emission
 * without needing a fresh mock factory.
 */
function makeMockProceduralDiskRenderer() {
  return {
    draw: vi.fn(),
  } as any;
}

/** Fake ImageBitmap — only need `close()` and `width/height` properties. */
function makeFakeBitmap(): ImageBitmap {
  return { width: 128, height: 128, close: () => {} } as unknown as ImageBitmap;
}

/** Build a frame-input fixture given clouds and a fetcher injection. */
function makeFrameInput(
  cam: OrbitCamera,
  clouds: Map<Source, PointCloud>,
  visibleMask: number = 0xffffffff,
) {
  const thumbnailRenderer = makeMockThumbnailRenderer();
  const texturedDiskRenderer = makeMockTexturedDiskRenderer();
  return {
    cam,
    clouds,
    visibleSourceMask: visibleMask,
    canvasSize: { width: 1280, height: 720 },
    pass: {} as GPURenderPassEncoder,
    viewProj: new Float32Array(16) as unknown as mat4,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    camPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    thumbnailRenderer,
    texturedDiskRenderer,
    famousMeta: [],
    famousXrefs: {},
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createThumbnailSubsystem', () => {
  let device: GPUDevice;

  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('binds the atlas to both renderers on bindToRenderers()', () => {
    const sys = createThumbnailSubsystem({
      device,
      requestRender: () => {},
      fetcher: async () => null,
    });
    const quad = makeMockThumbnailRenderer();
    const disk = makeMockTexturedDiskRenderer();
    const procDisk = makeMockProceduralDiskRenderer();
    sys.bindToRenderers(quad, disk, procDisk);
    expect(quad.bindAtlas).toHaveBeenCalledTimes(1);
    expect(disk.bindAtlas).toHaveBeenCalledTimes(1);
  });

  it('runFrame is a no-op until bindToRenderers is called (defensive)', () => {
    const sys = createThumbnailSubsystem({
      device,
      requestRender: () => {},
      fetcher: async () => null,
    });
    const cam = makeCam();
    const clouds = new Map([[Source.SDSS, makeCloud(3)]]);
    const input = makeFrameInput(cam, clouds);
    sys.runFrame(input);
    // Neither renderer.draw nor any fetch was issued because we
    // didn't bindToRenderers — the guard fires.
    expect(input.thumbnailRenderer.draw).not.toHaveBeenCalled();
    expect(input.texturedDiskRenderer.draw).not.toHaveBeenCalled();
  });

  it('skips clouds whose source bit is clear in visibleSourceMask', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const sys = createThumbnailSubsystem({
      device,
      requestRender: () => {},
      fetcher,
    });
    sys.bindToRenderers(
      makeMockThumbnailRenderer(),
      makeMockTexturedDiskRenderer(),
      makeMockProceduralDiskRenderer(),
    );
    const cam = makeCam();
    // Two clouds; only Source.SDSS bit is set in the mask.
    const clouds = new Map([
      [Source.SDSS, makeCloud(1)],
      [Source.TwoMRS, makeCloud(1)],
    ]);
    const onlySdss = 1 << Source.SDSS;
    const input = makeFrameInput(cam, clouds, onlySdss);
    sys.runFrame(input);
    // Only SDSS galaxy should have been enqueued.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  describe('retry-storm protection', () => {
    it('a key in bitmapFailed is NOT re-enqueued on subsequent frames', async () => {
      const fetcher = vi.fn(async () => null); // permanent failure
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeCloud(1)]]);

      // Frame 1: enqueue.
      const input1 = makeFrameInput(cam, clouds);
      sys.runFrame(input1);
      // Wait for the in-flight fetch to resolve (and mark failed).
      await new Promise((r) => setTimeout(r, 0));
      // bitmapFailed should now have the key.
      expect(sys.__testGetState().bitmapFailed.size).toBe(1);

      // Frames 2..5: same camera, same clouds — must NOT re-enqueue.
      const callsBefore = fetcher.mock.calls.length;
      for (let f = 0; f < 4; f++) {
        sys.runFrame(makeFrameInput(cam, clouds));
      }
      expect(fetcher.mock.calls.length).toBe(callsBefore);
    });

    it('a key with no bitmap and not in bitmapFailed gets enqueued exactly once', async () => {
      // Use a fetcher that hangs forever — exercises the "in-flight" path.
      const pending: Array<(b: ImageBitmap | null) => void> = [];
      const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeCloud(1)]]);

      // Frame 1: enqueue.
      sys.runFrame(makeFrameInput(cam, clouds));
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Frames 2..5: in-flight. Queue.enqueue is idempotent for in-flight
      // keys — fetcher must NOT be called again.
      for (let f = 0; f < 4; f++) {
        sys.runFrame(makeFrameInput(cam, clouds));
      }
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('a key in bitmapReady does not get re-enqueued', async () => {
      const fetcher = vi.fn(async () => makeFakeBitmap());
      let renderRequests = 0;
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {
          renderRequests++;
        },
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeCloud(1)]]);

      // Frame 1.
      sys.runFrame(makeFrameInput(cam, clouds));
      // Drain queue + microtasks so the bitmap lands.
      await new Promise((r) => setTimeout(r, 0));
      expect(sys.__testGetState().bitmapReady.size).toBe(1);

      // Frames 2..5: bitmap is ready, no re-enqueue, but the per-frame
      // loop now emits a draw.
      const callsBefore = fetcher.mock.calls.length;
      for (let f = 0; f < 4; f++) {
        sys.runFrame(makeFrameInput(cam, clouds));
      }
      expect(fetcher.mock.calls.length).toBe(callsBefore);
      // requestRender called at least once (the onResult callback fires it).
      expect(renderRequests).toBeGreaterThanOrEqual(1);
    });
  });

  describe('LRU eviction wires through onEvict', () => {
    it('clears bitmapReady/Failed/Time entries when the atlas evicts a key', async () => {
      // We need to fill the atlas (256 slots).  Use the cloud-loop path:
      // 256 distinct galaxies → 256 successful fetches → 256 bitmapReady
      // entries → next allocation evicts slot 0.  Opt out of decimation
      // so the single frame visits all 257 indices in one pass — otherwise
      // we'd need 257/stride frames to reach eviction and the test would
      // be exercising round-robin scheduling rather than LRU eviction.
      const fetcher = vi.fn(async () => makeFakeBitmap());
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 1,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      // 257 galaxies — the 257th will evict the LRU slot.
      const cloud = makeCloud(257, 50);
      const clouds = new Map([[Source.SDSS, cloud]]);

      // Frame 1: enqueue everything in one pass.
      sys.runFrame(makeFrameInput(cam, clouds));
      // Drain the queue (256 successful fetches; the 257th key was
      // already allocated to the slot but its fetch was enqueued
      // alongside).  We need multiple ticks because the queue's
      // concurrency cap is 4, so all 257 fetches resolve in waves.
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 0));
      }

      const state = sys.__testGetState();
      // Atlas capped at 256 slots; the eviction handler should have
      // pruned the corresponding bitmapReady entries so they don't
      // exceed the slot count.
      expect(state.bitmapReady.size).toBeLessThanOrEqual(256);
    });
  });

  describe('hasInFlightFetches', () => {
    it('returns true while a fetch is pending and false once it settles', async () => {
      const pending: Array<(b: ImageBitmap | null) => void> = [];
      const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeCloud(1)]]);

      sys.runFrame(makeFrameInput(cam, clouds));
      expect(sys.hasInFlightFetches()).toBe(true);

      // Resolve with null (failure) — neither bitmapReady nor a fade is
      // recorded, so once the queue's inFlightCount drops to 0 the
      // predicate returns false.
      pending[0]!(null);
      await new Promise((r) => setTimeout(r, 0));
      expect(sys.hasInFlightFetches()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('clears state and prevents in-flight onResult from mutating it', async () => {
      const pending: Array<(b: ImageBitmap | null) => void> = [];
      const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeCloud(1)]]);
      sys.runFrame(makeFrameInput(cam, clouds));

      sys.destroy();
      // In-flight fetch resolves AFTER destroy — must not write to
      // bitmapReady (the destroyed flag short-circuits onResult).
      pending[0]!(makeFakeBitmap());
      await new Promise((r) => setTimeout(r, 0));
      expect(sys.__testGetState().bitmapReady.size).toBe(0);
    });
  });

  describe('decimation (round-robin per-frame stride)', () => {
    it('walks 1/N of the cloud per frame in round-robin order', async () => {
      // 16 galaxies all above the apparent-size threshold; decimation = 4.
      // Frame k visits indices [4·k, 4·(k+1)) — exactly 4 fetches per frame.
      // Between frames we drain microtasks so the priority queue's
      // concurrency cap (4 in-flight) doesn't stall newly-enqueued keys.
      const fetcher = vi.fn(async () => null); // permanent failure
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 4,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeDenseCloud(16)]]);

      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetcher).toHaveBeenCalledTimes(4);

      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetcher).toHaveBeenCalledTimes(8);

      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetcher).toHaveBeenCalledTimes(12);

      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetcher).toHaveBeenCalledTimes(16);
    });

    it('round-robin cursor wraps to 0 after a full sweep', async () => {
      const fetcher = vi.fn(async () => null);
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 2,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);

      // Frames 1..2: 2 fetches each → 4 unique galaxies enqueued.
      sys.runFrame(makeFrameInput(cam, clouds));
      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      // All 4 fetches resolved as failures, so all keys are in bitmapFailed.
      expect(sys.__testGetState().bitmapFailed.size).toBe(4);

      // Frame 3 wraps the cursor back to indices 0..1.  Their keys are in
      // bitmapFailed, so the retry-storm guard short-circuits — fetcher
      // count must stay at 4 even though the cursor revisits them.
      sys.runFrame(makeFrameInput(cam, clouds));
      expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it('decimationFactor=1 walks every galaxy each frame (full sweep)', async () => {
      const fetcher = vi.fn(async () => null);
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 1,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockTexturedDiskRenderer(),
        makeMockProceduralDiskRenderer(),
      );
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeDenseCloud(8)]]);

      sys.runFrame(makeFrameInput(cam, clouds));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetcher).toHaveBeenCalledTimes(8);
    });

    it('keeps emitting instances for galaxies whose bitmap is ready but are outside the current stride', async () => {
      // Sticky-state contract: once the cursor has visited every galaxy
      // with its bitmap ready, subsequent frames must keep emitting all
      // visible thumbnails even when the cursor has advanced past them.
      // Without sticky state, decimation would make visible thumbnails
      // blink at 60/N Hz as the cursor sweeps.
      //
      // Bitmap availability lags one sweep cycle behind the cursor:
      //   frame 1: cursor enqueues 0..1 → bitmaps for 0..1 land after
      //            the microtask drain.
      //   frame 2: cursor enqueues 2..3 → bitmaps for 2..3 land.
      //            (Galaxies 0..1 are bitmapReady but cursor doesn't
      //            visit them this frame — sticky-state is empty for
      //            them too because the only path that sets sticky
      //            entries is the inner loop's bitmap-ready branch.)
      //   frame 3: cursor wraps to 0..1; bitmaps ready → sticky set.
      //   frame 4: cursor at 2..3; bitmaps ready → sticky set.
      //   frame 5: cursor at 0..1 — sticky entries from frame 4 for
      //            indices 2..3 must persist into this frame's draw.
      //
      // This is the test that proves persistence across strides.
      const fetcher = vi.fn(async () => makeFakeBitmap());
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 2,
      });
      const quad = makeMockThumbnailRenderer();
      const disk = makeMockTexturedDiskRenderer();
      sys.bindToRenderers(quad, disk, makeMockProceduralDiskRenderer());
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);

      // Two full sweep cycles so every galaxy has been re-visited with
      // its bitmap already in `bitmapReady`.
      for (let f = 0; f < 4; f++) {
        sys.runFrame(makeFrameInput(cam, clouds, 0xffffffff));
        await new Promise((r) => setTimeout(r, 0));
      }
      expect(sys.__testGetState().bitmapReady.size).toBe(4);

      // Frame 5: cursor only touches indices 0..1.  Sticky entries for
      // 2..3 (set on frame 4) must persist and drive the draw.
      const inputF5 = makeFrameInput(cam, clouds);
      sys.runFrame(inputF5);
      const quadsF5 = inputF5.thumbnailRenderer.draw.mock.calls.at(-1)?.[3] ?? [];
      const disksF5 = inputF5.texturedDiskRenderer.draw.mock.calls.at(-1)?.[4] ?? [];
      expect(quadsF5.length + disksF5.length).toBe(4);
    });

    it('drops sticky entries for galaxies whose visibility lapses on revisit', async () => {
      // If a galaxy stops passing the apparent-size cull on a sweep, its
      // sticky entry must be cleared on that visit so the renderer doesn't
      // keep drawing a stale impostor.  We exercise this by hiding the
      // source via visibleSourceMask between frames — every galaxy in that
      // cloud should fall out of the sticky maps when the cursor next
      // touches them.
      const fetcher = vi.fn(async () => makeFakeBitmap());
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
        decimationFactor: 1, // walk the whole cloud every frame for a clean assertion
      });
      const quad = makeMockThumbnailRenderer();
      const disk = makeMockTexturedDiskRenderer();
      sys.bindToRenderers(quad, disk, makeMockProceduralDiskRenderer());
      const cam = makeCam();
      const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

      // Frame 1: SDSS visible; bitmaps land.
      sys.runFrame(makeFrameInput(cam, clouds, 1 << Source.SDSS));
      await new Promise((r) => setTimeout(r, 0));

      // Frame 2: SDSS visible — sticky entries should now feed the draw.
      const inputF2 = makeFrameInput(cam, clouds, 1 << Source.SDSS);
      sys.runFrame(inputF2);
      const f2Total =
        (inputF2.thumbnailRenderer.draw.mock.calls.at(-1)?.[3]?.length ?? 0) +
        (inputF2.texturedDiskRenderer.draw.mock.calls.at(-1)?.[4]?.length ?? 0);
      expect(f2Total).toBeGreaterThanOrEqual(2);

      // Frame 3: hide SDSS → the per-cloud guard skips the loop entirely
      // and the cloud's sticky entries must be cleared so nothing draws.
      const inputF3 = makeFrameInput(cam, clouds, 0);
      sys.runFrame(inputF3);
      const drawCallF3Q = inputF3.thumbnailRenderer.draw.mock.calls.length;
      const drawCallF3D = inputF3.texturedDiskRenderer.draw.mock.calls.length;
      // Either no draw at all, or a draw with zero instances.
      const quadsF3 = inputF3.thumbnailRenderer.draw.mock.calls.at(-1)?.[3] ?? [];
      const disksF3 = inputF3.texturedDiskRenderer.draw.mock.calls.at(-1)?.[4] ?? [];
      expect(quadsF3.length).toBe(0);
      expect(disksF3.length).toBe(0);
      // Touching mock variables to satisfy the no-unused-variable lint.
      void drawCallF3Q;
      void drawCallF3D;
    });
  });

  it('exposes a galaxyCacheKey helper that round-trips RA/Dec to 5 dp', () => {
    expect(galaxyCacheKey(123.456789, -10.123456)).toBe('123.45679_-10.12346');
    // Same precision yields the same key (deduplication).
    expect(galaxyCacheKey(123.456789, -10.123456)).toBe(galaxyCacheKey(123.456789, -10.123456));
  });
});
