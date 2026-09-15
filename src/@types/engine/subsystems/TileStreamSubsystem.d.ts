/**
 * TileStreamSubsystem<T> — shared GPU texture atlas + fetch queue for
 * streaming payload `T` into a fixed-size atlas on demand. Owns the LRU
 * atlas, the priority-queued fetcher, failure memoisation and an eviction
 * hook; has no catalog awareness, per-frame planning, or opinion about
 * what `T` is — see `TileStreamDeps<T>` for the payload-specific seam.
 */

import type { Destroyable } from '../../rendering/Destroyable';

export type TileStreamFetchInput<T> = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<T | null>;
  readonly onResult: (payload: T | null) => void;
};

export type TileStreamSubsystem<T> = Destroyable & {
  /**
   * Allocate or refresh an LRU slot.  Returns slot index, or null when
   * every slot is in use AND none can be evicted.  Bumps the LRU clock
   * for an existing key.
   *
   * "None can be evicted" means every slot was claimed earlier this same
   * frame — taking one would undo work already done. Callers skip the
   * refused key and carry on with the rest of the frame's requests.
   */
  allocate(key: string, atFrame: number): number | null;

  /**
   * Refresh a resident key's LRU stamp without allocating. Returns its slot,
   * or `null` if `key` holds no slot — callers use that to collect the plan's
   * misses for a second pass, so a miss elsewhere in the same plan can never
   * evict a resident this call would otherwise have kept alive.
   */
  touch(key: string, atFrame: number): number | null;

  /**
   * UV rect `[u0, v0, u1, v1]` for a slot — feeds the renderer instance
   * buffer.
   */
  slotUv(slot: number): readonly [number, number, number, number];

  /**
   * Write `payload` into the slot the atlas holds for `key` RIGHT NOW (via
   * `TileStreamDeps.upload`), and record the key as loaded.  Returns that
   * slot, or `null` when the key holds no slot at all — evicted during the
   * fetch's round trip, or never allocated; `payload` is then handed to
   * `TileStreamDeps.release` instead (the caller records nothing).
   *
   * Keyed rather than slot-indexed: a slot index captured before an async
   * fetch can point at a different key's slot by the time the fetch lands.
   * Resolving the key at the point of use makes that unrepresentable.
   */
  upload(key: string, payload: T): number | null;

  /**
   * Idempotent per key: re-enqueueing a PENDING key replaces its entry, so
   * priority tracks the latest ask; re-enqueueing an IN-FLIGHT key does
   * nothing, so `onResult` must not close over frame-scoped state — a
   * later frame gets no chance to correct it.
   */
  enqueueFetch(input: TileStreamFetchInput<T>): void;

  /**
   * Whether the key's payload is in the atlas (`isLoaded`) or its fetch
   * permanently failed (`isFailed`). Both suppress further fetches.
   */
  isLoaded(key: string): boolean;
  isFailed(key: string): boolean;

  /**
   * Number of in-flight fetches.  Read by the textured-disk
   * subsystem's `hasInFlightWork()` (which the engine's render-on-demand
   * predicate ORs in).
   */
  inFlightCount(): number;

  /**
   * Atlas slots currently claimed by a key (loaded or still in flight) — the
   * atlas's own ground truth for a "used / capacity" debug readout, as
   * opposed to a caller's parallel bookkeeping going stale under eviction.
   */
  occupiedCount(): number;

  /** Texture view bound by the LOD-2 renderers (called once at wireSlots). */
  getTextureView(): GPUTextureView;

  /**
   * Optional handler called when LRU evicts a slot.  The
   * `texturedDiskSubsystem` subscribes to clear its bitmapReady /
   * bitmapFailed / bitmapReadyTime entries for the ousted key.
   */
  setEvictHandler(handler: ((key: string) => void) | undefined): void;
};
