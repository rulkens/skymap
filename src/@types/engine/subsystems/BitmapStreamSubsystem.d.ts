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
   */
  allocate(key: string, atFrame: number): number | null;

  /**
   * UV rect `[u0, v0, u1, v1]` for a slot — feeds the renderer instance
   * buffer.
   */
  slotUv(slot: number): readonly [number, number, number, number];

  /**
   * Frame the slot was last allocate()-touched, or undefined if evicted.
   * Lets fetchers detect "my slot got reassigned during the network
   * round-trip".
   */
  lastSeenFrame(key: string): number | undefined;

  /** Upload a bitmap into a previously-allocated slot. */
  uploadBitmap(slot: number, bitmap: ImageBitmap): void;

  /** Idempotent — re-enqueueing an in-flight key only refreshes priority. */
  enqueueFetch(input: BitmapStreamFetchInput): void;

  /** Reports whether the bitmap has landed in the atlas / failed to fetch. */
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
