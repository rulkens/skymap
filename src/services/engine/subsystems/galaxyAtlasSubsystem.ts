/**
 * galaxyAtlasSubsystem — the shared LOD-2 atlas + queue infrastructure.
 *
 * Extracted from `thumbnailSubsystem.ts` as part of the 2026-05-12
 * impostor-subsystem split.  Owns the 2048² GPU texture atlas, the LRU
 * clock, the priority-queued bitmap fetcher, the failure-memoisation
 * pair (handled here for "did the fetch land at all?" — separate from
 * the load-fade bookkeeping which lives in `texturedDiskSubsystem`),
 * and the eviction notification hook.
 *
 * No catalog awareness; no per-frame planning; no GPU dispatch.  This
 * file's API surface is exactly the `GalaxyAtlasSubsystem` type in
 * `@types/engine/subsystems/GalaxyAtlasSubsystem.d.ts`.
 *
 * ### Why `bitmapReady` and `bitmapFailed` (not just `bitmapReadyTime`)
 *
 * The legacy `thumbnailSubsystem` carried three parallel maps:
 *   - `bitmapReady`     — set membership: did this bitmap land?
 *   - `bitmapFailed`    — set membership: did this fetch permanently fail?
 *   - `bitmapReadyTime` — Map<key, ms>: when did it land (drives load-fade)?
 *
 * The first two are pure "did the fetch succeed?" state — exactly the
 * shape that lives here.  The third is load-fade state and belongs in
 * `texturedDiskSubsystem`, which owns the fade-window decisions.
 * The eviction handler (`setEvictHandler`) is what lets the LOD-2 planner
 * keep its parallel `bitmapReadyTime` map in sync without re-implementing
 * the LRU clock.
 */

import type {
  GalaxyAtlasFetchInput,
  GalaxyAtlasSubsystem,
} from '../../../@types/engine/subsystems/GalaxyAtlasSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import { TextureAtlas } from '../../gpu/resources/textureAtlas';
import { PriorityQueue } from '../../../utils/concurrency/priorityQueue';

// Geometry of the galaxy thumbnail atlas: a single 2048×2048 texture
// sliced into a 16×16 grid of 128×128 slots (256 thumbnails total).
// `GALAXY_ATLAS_SLOT_SIDE` is exported because the bitmap fetcher
// (fetchGalaxyBitmap) resizes network images to exactly this size during
// decode, so the two must stay in lockstep.
const GALAXY_ATLAS_SIDE = 2048;
export const GALAXY_ATLAS_SLOT_SIDE = 128;
const GALAXY_ATLAS_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';

export type GalaxyAtlasDeps = {
  readonly device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame.  Called when a
   * fetch completes (so the thumbnail can render) and when a fetch
   * fails (so the still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
};

export function createGalaxyAtlasSubsystem(deps: GalaxyAtlasDeps): GalaxyAtlasSubsystem {
  const { device, requestRender } = deps;

  const atlas = new TextureAtlas(device, {
    atlasSide: GALAXY_ATLAS_SIDE,
    slotSide: GALAXY_ATLAS_SLOT_SIDE,
    format: GALAXY_ATLAS_FORMAT,
    label: 'galaxy-atlas',
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

  const subsystem: GalaxyAtlasSubsystem = {
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
    enqueueFetch(input: GalaxyAtlasFetchInput) {
      // Re-entry guard: don't enqueue keys we've already given up on.
      // (The legacy code at thumbnailSubsystem.ts:714 also gated on
      // bitmapFailed before calling queue.enqueue; we preserve that.)
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
