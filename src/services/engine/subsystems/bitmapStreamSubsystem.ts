/**
 * bitmapStreamSubsystem — the shared atlas + queue infrastructure for
 * streaming bitmaps into a GPU texture atlas.
 *
 * Extracted from `thumbnailSubsystem.ts` as part of the 2026-05-12
 * impostor-subsystem split.  Owns the GPU texture atlas (geometry and
 * format supplied by the caller), the LRU clock, the priority-queued
 * bitmap fetcher, the failure-memoisation pair (handled here for "did the
 * fetch land at all?" — separate from the load-fade bookkeeping which
 * lives one layer up, e.g. in `texturedDiskSubsystem`), and the eviction
 * notification hook.
 *
 * No catalog awareness; no atlas-shape awareness beyond what the caller
 * passes in; no per-frame planning; no GPU dispatch.  This file's API
 * surface is exactly the `BitmapStreamSubsystem` type in
 * `@types/engine/subsystems/BitmapStreamSubsystem.d.ts`.  Callers that
 * want a concrete atlas — e.g. the galaxy thumbnail atlas in
 * `galaxyAtlasSubsystem.ts` — supply their own geometry/format constants
 * and construct one of these per atlas.
 *
 * ### Why `bitmapReady` and `bitmapFailed` (not just `bitmapReadyTime`)
 *
 * The legacy `thumbnailSubsystem` carried three parallel maps:
 *   - `bitmapReady`     — set membership: did this bitmap land?
 *   - `bitmapFailed`    — set membership: did this fetch permanently fail?
 *   - `bitmapReadyTime` — Map<key, ms>: when did it land (drives load-fade)?
 *
 * The first two are pure "did the fetch succeed?" state — exactly the
 * shape that lives here.  The third is load-fade state and belongs one
 * layer up, with whatever planner owns the fade-window decisions.
 * The eviction handler (`setEvictHandler`) is what lets that planner
 * keep its parallel `bitmapReadyTime` map in sync without re-implementing
 * the LRU clock.
 */

import type {
  BitmapStreamFetchInput,
  BitmapStreamSubsystem,
} from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import { TextureAtlas } from '../../gpu/resources/textureAtlas';
import { PriorityQueue } from '../../../utils/concurrency/priorityQueue';

export type BitmapStreamDeps = {
  readonly device: GPUDevice;
  /** Side length, in pixels, of the square atlas texture. */
  readonly atlasSide: number;
  /** Side length, in pixels, of each square slot within the atlas. */
  readonly slotSide: number;
  /** Pixel format of the underlying GPUTexture. */
  readonly format: GPUTextureFormat;
  /** GPU debug label for the atlas texture (see `TextureAtlas`). */
  readonly label: string;
  /**
   * Wake the engine's render loop for the next frame.  Called when a
   * fetch completes (so the bitmap can render) and when a fetch
   * fails (so the still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
};

export function createBitmapStreamSubsystem(deps: BitmapStreamDeps): BitmapStreamSubsystem {
  const { device, atlasSide, slotSide, format, label, requestRender } = deps;

  const atlas = new TextureAtlas(device, {
    atlasSide,
    slotSide,
    format,
    label,
  });
  atlas.initTexture();

  const queue = new PriorityQueue();

  // Set membership: "this bitmap landed".  No timing — that's the
  // load-fade planner's job, layered above this subsystem.
  const bitmapReady = new Set<string>();
  // Set membership: "this fetch permanently failed; do not retry".
  // Cleared when LRU recycles the key's slot (see setEvictHandler below).
  const bitmapFailed = new Set<string>();

  let userEvictHandler: ((key: string) => void) | undefined;
  // Wire the atlas's eviction notification: clear our own membership
  // sets AND forward to the consumer-supplied handler (the LOD-2
  // planner uses that to clear its bitmapReadyTime map).
  atlas.setEvictHandler((key) => {
    bitmapReady.delete(key);
    bitmapFailed.delete(key);
    userEvictHandler?.(key);
  });

  let destroyed = false;

  const subsystem: BitmapStreamSubsystem = {
    allocate(key, atFrame) {
      return atlas.allocate(key, atFrame);
    },
    slotUv(slot) {
      return atlas.slotUv(slot);
    },
    lastSeenFrame(key) {
      return atlas.lastSeenFrame(key);
    },
    uploadBitmap(slot, bitmap) {
      atlas.uploadBitmap(slot, bitmap);
      // The caller's key is what landed; the subsystem doesn't have
      // the key at this entry point (uploadBitmap takes a slot index),
      // so isLoaded() is driven by the enqueueFetch wrapper below
      // which DOES have the key.  Production callers always pair
      // uploadBitmap with the wrapper, so this split is fine.
    },
    enqueueFetch(input: BitmapStreamFetchInput) {
      // Re-entry guard: don't enqueue keys we've already given up on.
      if (bitmapFailed.has(input.key)) return;
      queue.enqueue({
        key: input.key,
        priority: input.priority,
        fetcher: input.fetcher,
        onResult: (bitmap) => {
          if (destroyed) {
            bitmap?.close();
            return;
          }
          if (!bitmap) {
            bitmapFailed.add(input.key);
            requestRender();
            input.onResult(null);
            return;
          }
          bitmapReady.add(input.key);
          // `onResult` is the consumer's hook — they upload via
          // uploadBitmap() inside this callback and update their
          // own load-fade timing.
          input.onResult(bitmap);
          requestRender();
        },
      });
    },
    isLoaded(key) {
      return bitmapReady.has(key);
    },
    isFailed(key) {
      return bitmapFailed.has(key);
    },
    inFlightCount() {
      return queue.inFlightCount();
    },
    getTextureView() {
      return atlas.getTextureView();
    },
    setEvictHandler(handler) {
      userEvictHandler = handler;
    },
    destroy() {
      destroyed = true;
      // Drop our own atlas-eviction subscription (the constructor wired
      // it up).  Without this, the underlying atlas would call back
      // into our set-clearing closure post-destroy.
      atlas.setEvictHandler(undefined);
      userEvictHandler = undefined;
      bitmapReady.clear();
      bitmapFailed.clear();
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
