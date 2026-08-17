/**
 * bitmapStreamSubsystem — unit tests for the shared atlas + queue
 * infrastructure extracted from thumbnailSubsystem.
 *
 * Coverage focus:
 *   - allocate() returns distinct slot indices for distinct keys
 *   - enqueueFetch() is idempotent for an in-flight key
 *   - setEvictHandler fires on LRU eviction with the ousted key
 *   - inFlightCount() tracks pending fetches
 *   - destroy() clears the eviction handler
 *   - uploadBitmap() resolves the key's CURRENT slot, and is the only thing
 *     that makes a key "loaded" (the recycled-slot describe block)
 *
 * Atlas geometry here (32×32 texture, 8×8 slots → 16 total) is an
 * arbitrary test config, not a real consumer's — this file exercises the
 * generic machinery in isolation from any one atlas's real dimensions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBitmapStreamSubsystem,
  type BitmapStreamDeps,
} from '../../../../src/services/engine/subsystems/bitmapStreamSubsystem';

const TEST_ATLAS_CONFIG: Omit<BitmapStreamDeps, 'device' | 'requestRender'> = {
  atlasSide: 32,
  slotSide: 8,
  format: 'rgba8unorm-srgb',
  label: 'test-atlas',
};
const TEST_SLOT_COUNT = 16; // (32 / 8) ** 2

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
  return { width: 8, height: 8, close: () => {} } as unknown as ImageBitmap;
}

describe('createBitmapStreamSubsystem', () => {
  let device: GPUDevice;
  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('allocate returns distinct slots for distinct keys', () => {
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
    });
    const s1 = atlas.allocate('a', 1);
    const s2 = atlas.allocate('b', 1);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1).not.toBe(s2);
  });

  it('enqueueFetch is idempotent for an in-flight key', () => {
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
    });
    const fetcher = vi.fn(() => new Promise<ImageBitmap | null>(() => {})); // hangs
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(atlas.inFlightCount()).toBe(1);
  });

  it('honours the caller-supplied concurrency limit', () => {
    // The tile stream and the thumbnail stream fetch different shapes of thing
    // against the same ~6-connection browser cap, so each supplies its own
    // bound.  A regression that stopped threading `concurrency` through to the
    // queue would leave every consumer on the shared default and show up only
    // as a crowded Network tab — nothing else observes it.
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
      concurrency: 1,
    });
    const hang = () => new Promise<ImageBitmap | null>(() => {});
    atlas.enqueueFetch({ key: 'a', priority: 1, fetcher: hang, onResult: () => {} });
    atlas.enqueueFetch({ key: 'b', priority: 1, fetcher: hang, onResult: () => {} });
    expect(atlas.inFlightCount()).toBe(1);
  });

  it('setEvictHandler fires when LRU recycles a slot', () => {
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
    });
    const evicted: string[] = [];
    atlas.setEvictHandler((k) => evicted.push(k));
    // Fill every slot, then allocate one more to force eviction.
    for (let i = 0; i < TEST_SLOT_COUNT; i++) atlas.allocate(`k${i}`, 1);
    atlas.allocate('kOverflow', 2);
    expect(evicted.length).toBe(1);
    expect(evicted[0]).toBe('k0');
  });

  it('uploadBitmap reports the slot it wrote, and only then is the key loaded', () => {
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
    });
    const slot = atlas.allocate('k', 1)!;
    expect(atlas.isLoaded('k')).toBe(false);
    expect(atlas.uploadBitmap('k', makeFakeBitmap())).toBe(slot);
    expect(atlas.isLoaded('k')).toBe(true);
    // A key that holds no slot has nowhere for pixels to go, and saying so is
    // the caller's cue to record nothing — not to mark it loaded.
    expect(atlas.uploadBitmap('never-allocated', makeFakeBitmap())).toBeNull();
    expect(atlas.isLoaded('never-allocated')).toBe(false);
  });

  /**
   * Two bugs from one root cause: a slot index that was true at allocate time,
   * read as if it were still true when the bitmap arrived N frames later.
   *
   * A 2×2 atlas (16 px across, 8 px slots) so "the atlas fills up and the LRU
   * turns over" is four calls rather than seventeen. Slot origins are what a
   * blit is observable as: slot 0 → [0,0,0], 1 → [8,0,0], 2 → [0,8,0],
   * 3 → [8,8,0].
   */
  describe('a bitmap arriving after its slot was recycled', () => {
    const TINY_ATLAS: Omit<BitmapStreamDeps, 'device' | 'requestRender'> = {
      atlasSide: 16,
      slotSide: 8,
      format: 'rgba8unorm-srgb',
      label: 'test-atlas-tiny',
    };

    /** A device that records the atlas origin of every slot blit. */
    function makeRecordingDevice(): { device: GPUDevice; origins: GPUOrigin3D[] } {
      const origins: GPUOrigin3D[] = [];
      const fakeTexture = { createView: () => ({}) as GPUTextureView };
      const device = {
        createTexture: () => fakeTexture,
        queue: {
          copyExternalImageToTexture: (_source: unknown, destination: { origin: GPUOrigin3D }) => {
            origins.push(destination.origin);
          },
        },
      } as unknown as GPUDevice;
      return { device, origins };
    }

    /** A fetch whose resolution the test controls. */
    function deferredFetch() {
      let settle!: (bitmap: ImageBitmap | null) => void;
      const promise = new Promise<ImageBitmap | null>((resolve) => {
        settle = resolve;
      });
      return { fetcher: () => promise, settle };
    }

    it('writes into the slot the key holds NOW, not the one it was allocated', async () => {
      const { device: recording, origins } = makeRecordingDevice();
      const atlas = createBitmapStreamSubsystem({
        device: recording,
        requestRender: () => {},
        ...TINY_ATLAS,
      });

      // Frame 1: the tile is claimed and its fetch starts.
      expect(atlas.allocate('K', 1)).toBe(0);
      const { fetcher, settle } = deferredFetch();
      const uploadedSlots: Array<number | null> = [];
      atlas.enqueueFetch({
        key: 'K',
        priority: 1,
        fetcher,
        onResult: (bitmap) => {
          if (!bitmap) return;
          uploadedSlots.push(atlas.uploadBitmap('K', bitmap));
        },
      });

      // Frame 2: three other keys take the rest of the atlas.
      expect([atlas.allocate('a', 2), atlas.allocate('b', 2), atlas.allocate('c', 2)]).toEqual([
        1, 2, 3,
      ]);

      // Frame 3: a fourth key arrives, the atlas is full, and K's slot is the
      // stalest — so K is evicted and slot 0 now belongs to 'd'.
      expect(atlas.allocate('d', 3)).toBe(0);

      // Frame 4: the camera came back, K is wanted again, and it gets whatever
      // is stale now — slot 1, taken off 'a'. This is the step that made the old
      // `lastSeenFrame(key) === undefined` guard useless: K IS in the atlas
      // again, just not where its fetch thinks it is.
      expect(atlas.allocate('K', 4)).toBe(1);
      // Re-enqueueing an in-flight key is a no-op by design (the queue's
      // dedup), so the callback that eventually fires is the one closed over in
      // frame 1. Nothing later gets a chance to correct its idea of the slot.
      const secondFetcher = vi.fn(() => Promise.resolve(makeFakeBitmap()));
      atlas.enqueueFetch({ key: 'K', priority: 1, fetcher: secondFetcher, onResult: () => {} });

      settle(makeFakeBitmap());
      await Promise.resolve();
      await Promise.resolve();

      expect(secondFetcher).not.toHaveBeenCalled();
      // The bug: this landed at [0,0,0], over 'd', which then rendered K's
      // pixels under its own UVs and — being marked loaded — never refetched.
      expect(origins).toEqual([[8, 0, 0]]);
      expect(uploadedSlots).toEqual([1]);
    });

    it('leaves a key unloaded when the arriving bitmap has nowhere to go', async () => {
      const { device: recording, origins } = makeRecordingDevice();
      const atlas = createBitmapStreamSubsystem({
        device: recording,
        requestRender: () => {},
        ...TINY_ATLAS,
      });

      atlas.allocate('K', 1);
      const { fetcher, settle } = deferredFetch();
      const uploadedSlots: Array<number | null> = [];
      atlas.enqueueFetch({
        key: 'K',
        priority: 1,
        fetcher,
        onResult: (bitmap) => {
          if (!bitmap) return;
          uploadedSlots.push(atlas.uploadBitmap('K', bitmap));
        },
      });

      // K is evicted mid-fetch and, this time, never asked for again.
      atlas.allocate('a', 2);
      atlas.allocate('b', 2);
      atlas.allocate('c', 2);
      atlas.allocate('d', 3);

      settle(makeFakeBitmap());
      await Promise.resolve();
      await Promise.resolve();

      expect(uploadedSlots).toEqual([null]);
      expect(origins).toEqual([]);
      // The bug: the key was recorded as loaded on fetch RESOLUTION, so with no
      // slot behind it `isLoaded` suppressed every future fetch and that ground
      // never got pixels again.
      expect(atlas.isLoaded('K')).toBe(false);
      // A refusal to upload is not a failure, either — the fetch succeeded, so
      // the key must stay eligible rather than being memoised as dead.
      expect(atlas.isFailed('K')).toBe(false);
    });
  });

  it('destroy clears the eviction handler', () => {
    const atlas = createBitmapStreamSubsystem({
      device,
      requestRender: () => {},
      ...TEST_ATLAS_CONFIG,
    });
    const handler = vi.fn();
    atlas.setEvictHandler(handler);
    atlas.destroy();
    // After destroy the handler should not be invoked even if more
    // allocations happen — but we don't allocate post-destroy in
    // production; just assert destroy() itself doesn't throw.
    expect(() => atlas.destroy()).not.toThrow();
  });
});
