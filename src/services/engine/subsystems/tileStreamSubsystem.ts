/**
 * tileStreamSubsystem — fetch queue streaming payload `T` into the slot store
 * `S` it is handed. Store-agnostic: the galaxy and surface streams pass a
 * `TextureAtlas`; see `TileStreamDeps<T, S>` for the upload/release seam.
 *
 * `isLoaded`/`isFailed` mean "payload is in the store" / "fetch permanently
 * failed", not "the fetch resolved": a key can be evicted mid-fetch, so
 * `upload()` is the single writer of `loadedKeys` — marking a key loaded on
 * resolution instead would suppress retries for a key with no pixels behind
 * it, a dead end nothing revisits.
 */

import type { TileStreamSubsystem } from '../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem';
import type { TileStreamDeps } from '../../../@types/engine/subsystems/TileStreamDeps';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { SlotStore } from '../../../@types/cache/SlotStore';
import { PriorityQueue } from '../../../utils/concurrency/priorityQueue';
import type { TileStreamFetchInput } from '../../../@types/engine/subsystems/tileStreamSubsystem/TileStreamFetchInput';

export function createTileStreamSubsystem<T, S extends SlotStore>(
  deps: TileStreamDeps<T, S>,
): TileStreamSubsystem<T, S> {
  const {
    slots,
    concurrency,
    requestRender,
    upload: uploadPayload,
    release: releasePayload,
  } = deps;

  // `undefined` falls through to the queue's own default, so a caller that
  // has no opinion keeps today's behaviour.
  const queue = new PriorityQueue<T | null>(concurrency);

  // Set membership: "this key's payload landed". No timing — that's the
  // load-fade planner's job, layered above this subsystem.
  const loadedKeys = new Set<string>();
  // Set membership: "this fetch permanently failed; do not retry".
  // Cleared when LRU recycles the key's slot (see setEvictHandler below).
  const failedKeys = new Set<string>();

  let userEvictHandler: ((key: string) => void) | undefined;
  // Wire the store's eviction notification: clear our own membership
  // sets AND forward to the consumer-supplied handler (the LOD-2
  // planner uses that to clear its bitmapReadyTime map).
  slots.setEvictHandler((key) => {
    loadedKeys.delete(key);
    failedKeys.delete(key);
    userEvictHandler?.(key);
  });

  let destroyed = false;

  const subsystem: TileStreamSubsystem<T, S> = {
    slots,
    allocate(key, atFrame) {
      return slots.allocate(key, atFrame);
    },
    touch(key, atFrame) {
      return slots.touch(key, atFrame);
    },
    upload(key, payload) {
      // Re-asked here rather than trusted from allocate time: the caller has
      // been holding this key across a network round trip, and its slot may
      // since have been recycled under a different key.
      const slot = slots.slotOf(key);
      if (slot === undefined) {
        // Nowhere to write this payload — release it exactly as a payload
        // arriving post-destroy does (see `enqueueFetch` below).
        releasePayload(payload);
        return null;
      }
      uploadPayload(slots, slot, payload);
      // The one place `loadedKeys` is written, so "loaded" and "has a
      // payload in the store" are the same fact by construction.
      loadedKeys.add(key);
      return slot;
    },
    enqueueFetch(input: TileStreamFetchInput<T>) {
      // Re-entry guard: don't enqueue keys we've already given up on.
      if (failedKeys.has(input.key)) return;
      queue.enqueue({
        key: input.key,
        priority: input.priority,
        fetcher: input.fetcher,
        onResult: (payload) => {
          if (destroyed) {
            if (payload !== null) releasePayload(payload);
            return;
          }
          if (payload === null) {
            failedKeys.add(input.key);
            requestRender();
            input.onResult(null);
            return;
          }
          // The consumer's hook: uploads via upload() inside this callback
          // (which records the key as loaded) and updates its own load-fade
          // timing. A consumer that declines leaves the key unloaded and so
          // still fetchable.
          input.onResult(payload);
          // Unconditional: an upload needs a frame to show, and a declined one
          // still has to let the keep-ticking predicate re-read inFlightCount.
          requestRender();
        },
      });
    },
    isLoaded(key) {
      return loadedKeys.has(key);
    },
    isFailed(key) {
      return failedKeys.has(key);
    },
    inFlightCount() {
      return queue.inFlightCount();
    },
    occupiedCount() {
      return slots.occupiedCount();
    },
    setEvictHandler(handler) {
      userEvictHandler = handler;
    },
    destroy() {
      destroyed = true;
      // Drop our own store-eviction subscription (the constructor wired
      // it up).  Without this, the underlying store would call back
      // into our set-clearing closure post-destroy.
      slots.setEvictHandler(undefined);
      userEvictHandler = undefined;
      loadedKeys.clear();
      failedKeys.clear();
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
