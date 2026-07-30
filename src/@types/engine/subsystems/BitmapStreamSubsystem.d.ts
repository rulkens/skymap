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
   * "None can be evicted" means every slot was claimed earlier in this same
   * frame: taking one would undo work already done this frame, and with a
   * consumer that re-requests a stable set every frame (a stationary camera
   * over an over-subscribed atlas) that yields an unbounded refetch loop
   * rather than a bounded atlas.  Callers skip the refused key and carry on
   * with the rest of the frame's requests.
   */
  allocate(key: string, atFrame: number): number | null;

  /**
   * UV rect `[u0, v0, u1, v1]` for a slot — feeds the renderer instance
   * buffer.
   */
  slotUv(slot: number): readonly [number, number, number, number];

  /**
   * Frame the slot was last allocate()-touched, or undefined if the key holds
   * no slot.  The LRU clock, read out — which is a weaker fact than "is my
   * slot still mine", and not a substitute for it: a key that was evicted and
   * then re-requested reports a fresh frame at a DIFFERENT slot.  Async writers
   * ask `uploadBitmap` instead.
   */
  lastSeenFrame(key: string): number | undefined;

  /**
   * Upload a bitmap into the slot the atlas holds for `key` RIGHT NOW, and
   * record the key as loaded.  Returns that slot, or `null` when the key holds
   * no slot at all — evicted during the fetch's round trip, or never allocated.
   *
   * Keyed rather than slot-indexed because a slot index is a fact about the
   * frame that allocated it (see `TextureAtlas`'s header).  A caller that
   * captured one before awaiting a fetch and passed it back here would write
   * pixels into whichever key has since taken that slot: wrong ground under the
   * other key's UVs, in a slot the atlas believes is already populated and so
   * never refetches.  Resolving the key at the point of use makes that
   * unrepresentable rather than merely guarded against.
   *
   * The `null` return is the consumer's signal to record nothing — no slot, no
   * arrival time, no residency entry — and it subsumes any "is my key still
   * here?" check a caller might otherwise write around this call.
   */
  uploadBitmap(key: string, bitmap: ImageBitmap): number | null;

  /**
   * Idempotent per key.  Re-enqueueing a key that is merely PENDING replaces
   * its entry, so priority tracks the latest ask; re-enqueueing one that is
   * already IN FLIGHT does nothing at all, so the `onResult` that eventually
   * fires is the first one submitted.  That second case is why `onResult` must
   * not close over anything frame-scoped: later frames get no chance to
   * correct it (see `uploadBitmap`).
   */
  enqueueFetch(input: BitmapStreamFetchInput): void;

  /**
   * Reports whether the key's pixels are in the atlas (`isLoaded`, written only
   * by a successful `uploadBitmap`) / whether its fetch permanently failed.
   * Both suppress further fetches, so both must mean what they say.
   */
  isLoaded(key: string): boolean;
  isFailed(key: string): boolean;

  /**
   * Number of in-flight fetches.  Read by the textured-disk
   * subsystem's `hasInFlightWork()` (which the engine's render-on-demand
   * predicate ORs in).
   */
  inFlightCount(): number;

  /** Texture view bound by the LOD-2 renderers (called once at wireSlots). */
  getTextureView(): GPUTextureView;

  /**
   * Optional handler called when LRU evicts a slot.  The
   * `texturedDiskSubsystem` subscribes to clear its bitmapReady /
   * bitmapFailed / bitmapReadyTime entries for the ousted key.
   */
  setEvictHandler(handler: ((key: string) => void) | undefined): void;
};
