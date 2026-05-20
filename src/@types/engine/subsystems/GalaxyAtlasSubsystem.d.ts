/**
 * GalaxyAtlasSubsystem — shared GPU texture atlas + bitmap-fetch queue
 * for the LOD-2 (textured-impostor) galaxy path.
 *
 * ### What this owns
 *
 * The 2048² LRU atlas texture, the LRU clock, the priority-queued bitmap
 * fetcher, failure memoisation, and an eviction notification hook.  It
 * has NO direct connection to per-frame catalog walking — that lives in
 * `texturedDiskSubsystem`, which calls into this atlas to allocate
 * slots and schedule fetches.
 *
 * ### Why a separate subsystem
 *
 * Pre-split, this state lived inline in `thumbnailSubsystem` alongside
 * per-frame planning + render dispatch.  Splitting it out gives the LOD-2
 * planner (`texturedDiskSubsystem`) one focused dependency to inject
 * — and gives future code that wants to read atlas state (debug HUD,
 * memory profilers) a typed surface to consume.
 *
 * ### Eviction handler protocol
 *
 * `setEvictHandler` is the seam by which the LOD-2 planner clears its
 * own parallel maps (`bitmapReady`, `bitmapFailed`, `bitmapReadyTime`)
 * when the atlas's LRU recycles a slot.  Without this hook, those
 * parallel maps grow without bound — a pre-split bug fixed by the
 * `atlas.setEvictHandler` wiring in `thumbnailSubsystem.ts` lines 418-422.
 */

import type { Destroyable } from '../../rendering/Destroyable';

export type GalaxyAtlasFetchInput = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<ImageBitmap | null>;
  readonly onResult: (bitmap: ImageBitmap | null) => void;
};

export type GalaxyAtlasSubsystem = Destroyable & {
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
  enqueueFetch(input: GalaxyAtlasFetchInput): void;

  /** Reports whether the bitmap has landed in the atlas / failed to fetch. */
  isLoaded(key: string): boolean;
  isFailed(key: string): boolean;

  /**
   * Number of in-flight fetches.  Read by the textured-impostor
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
