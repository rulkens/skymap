/**
 * HiResFamousTexture — GPU resource handle for the hi-res famous-galaxy
 * `texture_2d_array`.
 *
 * One small fixed-capacity texture array (default 8 layers) holds the
 * high-resolution decoded bitmaps for whichever famous galaxies are
 * currently large enough on screen to deserve them.  Each layer is a full
 * 2D image — either 512² (mobile / "small" tier) or 1024² (desktop /
 * "medium" and "large").
 *
 * Why a `texture_2d_array` instead of a second TextureAtlas?  See
 * ADR 0002: a 1024×1024 slot inside the 2048×2048 atlas would consume
 * 25 % of the atlas for a single thumbnail and starve every other
 * galaxy of slots.  An 8-layer 1024² array keeps the budget bounded
 * (~32 MB worst case) without contending with the existing atlas's
 * LRU.
 *
 * LRU policy is by *recent apparent diameter in pixels*, NOT by
 * `lastSeenFrame` (which is what `TextureAtlas` uses).  The galaxy
 * with the SMALLEST recorded apparent diameter wins eviction first —
 * i.e. the camera is moving AWAY from it the fastest, so it is the
 * least valuable layer to keep.  See ADR 0002's "eviction policy"
 * section and the design spec's "LRU eviction during crossfade" edge
 * case.
 *
 * This handle owns:
 *   - the GPUTexture (one 2d-array texture of `layerCount` layers)
 *   - the layer ↔ key bookkeeping (LRU map + free list)
 *   - the GPUTextureView with `dimension: '2d-array'` (required so the
 *     WGSL `texture_2d_array<f32>` binding resolves)
 *
 * It does NOT own the bind-group layout: per the
 * `feedback_webgpu_auto_layout_trap` memory, auto-derived BGLs are
 * pipeline-specific, so the BGL ownership lives in
 * `texturedDiskRenderer.ts` (where the pipeline that consumes this
 * view is built).
 */
export type HiResFamousTexture = {
  /** Creates the underlying GPUTexture.  Must be called once before
   *  `uploadBitmap` or `getTextureView`.  Idempotent — repeat calls
   *  are no-ops so a renderer recreating its pipeline does not have to
   *  recreate the layer texture. */
  initTexture(): void;

  /** Returns the layer index for `key`, allocating one via LRU if
   *  absent.  Returns -1 if the array is full AND no existing entry
   *  has a smaller recent-apparent-diameter than the caller (i.e. the
   *  caller is not "more deserving" than any current layer).
   *  The recency signal is `recentApparentDiameterPx` rather than a
   *  frame counter — see the module header for why. */
  allocate(key: string, recentApparentDiameterPx: number): number;

  /** Update `recentApparentDiameterPx` for an existing entry.  No-op
   *  if `key` is not present.  Mirrors `TextureAtlas.touch` in spirit
   *  but the signal is diameter, not frame index. */
  touch(key: string, recentApparentDiameterPx: number): void;

  /** Free the layer for `key` (e.g. after a fetch fails permanently
   *  and the engine no longer wants it). */
  release(key: string): void;

  /** Has a bitmap been successfully uploaded into the layer? */
  isLoaded(key: string): boolean;

  /** Did the fetch fail permanently for this key?  The failure flag
   *  is sticky across `release` (intentionally, so the engine can
   *  re-allocate the layer for someone else but still avoid retrying
   *  the failed key on the next frame). */
  isFailed(key: string): boolean;

  /** Record a permanent fetch failure for `key`.  Does NOT release
   *  the layer — the engine decides whether to release. */
  markFailed(key: string): void;

  /** Layer index for an existing key, or undefined if not present. */
  layerForKey(key: string): number | undefined;

  /** Upload `bitmap` into `layerIdx` via `copyExternalImageToTexture`.
   *  Marks the entry as loaded.  The bitmap must already be sized to
   *  `layerSide × layerSide` (the fetcher uses `createImageBitmap`'s
   *  `resizeWidth`/`resizeHeight` for this). */
  uploadBitmap(layerIdx: number, bitmap: ImageBitmap): void;

  /** Returns a GPUTextureView with `dimension: '2d-array'`.  Cheap to
   *  call — the view is recreated on each call, so the caller does
   *  not have to track lifetime. */
  getTextureView(): GPUTextureView;

  /** Register a callback fired immediately BEFORE LRU eviction
   *  overwrites a layer's bookkeeping.  Same invariant as
   *  `TextureAtlas.setEvictHandler`: the handler can safely clear
   *  its own per-key tracking before the layer's old contents are
   *  considered gone.  Pass `undefined` to clear. */
  setEvictHandler(handler: ((evictedKey: string) => void) | undefined): void;

  /** Destroy the GPUTexture and clear all bookkeeping.  After
   *  `destroy()` the handle is unusable; calling `allocate` or
   *  `getTextureView` will throw. */
  destroy(): void;
};

export type CreateHiResFamousTextureArgs = {
  device: GPUDevice;
  /** Per-tier edge length of a layer in pixels — 512 (small) or 1024
   *  (medium / large).  Sourced from `HI_RES_LAYER_SIDE_BY_TIER` in
   *  `src/data/sources.ts`. */
  layerSide: number;
  /** Number of layers in the array.  Pass `HI_RES_LAYER_COUNT` from
   *  `src/data/sources.ts`. */
  layerCount: number;
};
