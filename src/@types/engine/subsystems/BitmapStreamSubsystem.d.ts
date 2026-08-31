/**
 * BitmapStreamSubsystem — shared GPU texture atlas + bitmap-fetch queue
 * for streaming bitmaps into a fixed-size GPU atlas on demand.
 *
 * ### What this owns
 *
 * The LRU atlas texture (geometry + format supplied by the caller), the
 * LRU clock, the priority-queued bitmap fetcher, failure memoisation, and
 * an eviction notification hook.  It has NO catalog awareness and NO
 * per-frame planning — those live in the caller (e.g. `texturedDiskSubsystem`
 * for the galaxy LOD-2 path), which calls into this atlas to allocate slots
 * and schedule fetches.
 *
 * ### Why a separate subsystem
 *
 * Pre-split, this state lived inline in `thumbnailSubsystem` alongside
 * per-frame planning + render dispatch.  Splitting it out gives each
 * per-frame planner one focused dependency to inject.  Its shape carries
 * no assumption about what kind of image is being streamed or what the
 * atlas's grid geometry is, which is what lets more than one consumer
 * (e.g. the galaxy thumbnail atlas and an Earth surface tile atlas) each
 * configure their own atlas and reuse this machinery unchanged.
 *
 * ### Eviction handler protocol
 *
 * `setEvictHandler` is the seam by which a per-frame planner clears its
 * own parallel maps (e.g. `bitmapReady`, `bitmapFailed`, `bitmapReadyTime`)
 * when the atlas's LRU recycles a slot.  Without this hook, those
 * parallel maps grow without bound.
 */

import type { Destroyable } from '../../rendering/Destroyable';

export type BitmapStreamFetchInput = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<ImageBitmap | null>;
  readonly onResult: (bitmap: ImageBitmap | null) => void;
};

export type BitmapStreamSubsystem = Destroyable & {
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
   * Upload a bitmap into the slot the atlas holds for `key` RIGHT NOW, and
   * record the key as loaded.  Returns that slot, or `null` when the key
   * holds no slot at all — evicted during the fetch's round trip, or never
   * allocated; the caller then records nothing.
   *
   * Keyed rather than slot-indexed: a slot index captured before an async
   * fetch can point at a different key's slot by the time the fetch lands.
   * Resolving the key at the point of use makes that unrepresentable.
   */
  uploadBitmap(key: string, bitmap: ImageBitmap): number | null;

  /**
   * Idempotent per key: re-enqueueing a PENDING key replaces its entry, so
   * priority tracks the latest ask; re-enqueueing an IN-FLIGHT key does
   * nothing, so `onResult` must not close over frame-scoped state — a
   * later frame gets no chance to correct it.
   */
  enqueueFetch(input: BitmapStreamFetchInput): void;

  /**
   * Whether the key's pixels are in the atlas (`isLoaded`) or its fetch
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
