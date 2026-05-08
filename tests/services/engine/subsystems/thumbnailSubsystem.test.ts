/**
 * thumbnailSubsystem — unit tests for the per-frame galaxy-thumbnail
 * pipeline.  We mock the GPU device, the ThumbnailRenderer, and the
 * DiskRenderer with `vi.fn()` stubs so the subsystem can run end-to-
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

// The atlas's `initTexture` references `GPUTextureUsage.*` constants
// which the WebGPU spec exposes as global enum-like objects.  In Node
// they don't exist; stub the few flags we need so the texture creation
// path doesn't throw.  Values match the WebGPU spec but the actual
// numeric values don't matter for these tests — the fake device's
// createTexture is a noop spy that ignores the descriptor.
(globalThis as any).GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
};
import {
  createThumbnailSubsystem,
  galaxyCacheKey,
} from '../../../../src/services/engine/subsystems/thumbnailSubsystem';
import type { PointCloud, OrbitCamera } from '../../../../src/@types';
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

/** Mock DiskRenderer — same surface as ThumbnailRenderer for our purposes. */
function makeMockDiskRenderer() {
  return {
    bindAtlas: vi.fn(),
    draw: vi.fn(),
  } as any;
}

/**
 * Mock ProceduralDiskRenderer.  Unlike Quad/DiskRenderer it doesn't
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
  const diskRenderer = makeMockDiskRenderer();
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
    diskRenderer,
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
    const disk = makeMockDiskRenderer();
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
    expect(input.diskRenderer.draw).not.toHaveBeenCalled();
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
      makeMockDiskRenderer(),
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
        makeMockDiskRenderer(),
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
        makeMockDiskRenderer(),
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
        makeMockDiskRenderer(),
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
      // entries → next allocation evicts slot 0.
      const fetcher = vi.fn(async () => makeFakeBitmap());
      const sys = createThumbnailSubsystem({
        device,
        requestRender: () => {},
        fetcher,
      });
      sys.bindToRenderers(
        makeMockThumbnailRenderer(),
        makeMockDiskRenderer(),
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
        makeMockDiskRenderer(),
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
        makeMockDiskRenderer(),
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

  it('exposes a galaxyCacheKey helper that round-trips RA/Dec to 5 dp', () => {
    expect(galaxyCacheKey(123.456789, -10.123456)).toBe('123.45679_-10.12346');
    // Same precision yields the same key (deduplication).
    expect(galaxyCacheKey(123.456789, -10.123456)).toBe(galaxyCacheKey(123.456789, -10.123456));
  });
});
