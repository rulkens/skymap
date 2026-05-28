/**
 * HiResFamousTexture — GPU resource handle for the hi-res famous-galaxy
 * `texture_2d_array`.
 *
 * One fixed-capacity texture array (default 8 layers) holds decoded
 * bitmaps for whichever famous galaxies are currently large enough
 * on screen to deserve them. Each layer is a full 2D image — 512² on
 * the small tier, 1024² on medium / large.
 *
 * Why a `texture_2d_array` instead of a second TextureAtlas? See
 * ADR 0002: a 1024² slot inside the 2048² atlas would consume 25 % of
 * the atlas for a single thumbnail and starve every other galaxy. An
 * 8-layer 1024² array bounds the budget (~32 MB worst case) without
 * contending with the atlas's LRU.
 *
 * LRU policy is by *recent apparent diameter in pixels*, not by
 * `lastSeenFrame` (what `TextureAtlas` uses): the galaxy with the
 * smallest recorded diameter is the one the camera is moving away from
 * fastest, so it loses first. See ADR 0002's "eviction policy" and the
 * design spec's "LRU eviction during crossfade" edge case.
 *
 * Owns:
 *   - the GPUTexture (one 2d-array texture of `layerCount` layers)
 *   - layer ↔ key bookkeeping (LRU map + free list)
 *   - a `dimension: '2d-array'` GPUTextureView (needed for the WGSL
 *     `texture_2d_array<f32>` binding to resolve)
 *
 * Does NOT own the bind-group layout: per `feedback_webgpu_auto_layout_trap`,
 * auto-derived BGLs are pipeline-specific, so BGL ownership lives in
 * `texturedDiskRenderer.ts` where the consuming pipeline is built.
 */
export type HiResFamousTexture = {
  /** Creates the underlying GPUTexture. Must be called once before
   *  `uploadBitmap` or `getTextureView`. Idempotent — repeat calls
   *  no-op so a renderer recreating its pipeline does not have to
   *  recreate the layer texture. */
  initTexture(): void;

  /** Returns the layer index for `key`, allocating one via LRU if
   *  absent. Returns -1 if the array is full and no existing entry
   *  has a smaller recent apparent diameter than the caller (i.e. the
   *  caller is not "more deserving" than any current layer). */
  allocate(key: string, recentApparentDiameterPx: number): number;

  /** Update `recentApparentDiameterPx` for an existing entry. No-op
   *  if `key` is not present. Mirrors `TextureAtlas.touch` but the
   *  signal is diameter, not frame index. */
  touch(key: string, recentApparentDiameterPx: number): void;

  /** Free the layer for `key`. */
  release(key: string): void;

  /** Has a bitmap been successfully uploaded into the layer? */
  isLoaded(key: string): boolean;

  /** Did the fetch fail permanently for this key? Sticky across
   *  `release` so the engine can re-allocate the layer for someone
   *  else but still avoid retrying the failed key. */
  isFailed(key: string): boolean;

  /** Record a permanent fetch failure for `key`. Does NOT release the
   *  layer — the engine decides whether to release. */
  markFailed(key: string): void;

  /** Layer index for an existing key, or undefined if not present. */
  layerForKey(key: string): number | undefined;

  /** Upload `bitmap` into `layerIdx` via `copyExternalImageToTexture`
   *  and mark the entry loaded. The bitmap must already be sized to
   *  `layerSide × layerSide` (the fetcher uses `createImageBitmap`'s
   *  `resizeWidth` / `resizeHeight` for this). */
  uploadBitmap(layerIdx: number, bitmap: ImageBitmap): void;

  /** Returns a `dimension: '2d-array'` GPUTextureView. Cheap to call
   *  — recreated each call, so the caller does not track lifetime. */
  getTextureView(): GPUTextureView;

  /** Per-layer edge length in pixels (the value passed to the factory).
   *  Exposed so the planner subsystem can pass it as `hiResTargetDim`
   *  without threading the constant separately — single source of truth. */
  getLayerSide(): number;

  /** Register a callback fired immediately BEFORE LRU eviction
   *  overwrites a layer's bookkeeping. Same invariant as
   *  `TextureAtlas.setEvictHandler`: the handler can safely clear its
   *  own per-key tracking before the layer's old contents are gone.
   *  Pass `undefined` to clear. */
  setEvictHandler(handler: ((evictedKey: string) => void) | undefined): void;

  /** Destroy the GPUTexture and clear bookkeeping. After `destroy()`
   *  the handle is unusable; `allocate` / `getTextureView` will throw. */
  destroy(): void;
};

export type CreateHiResFamousTextureArgs = {
  device: GPUDevice;
  /** Per-tier edge length of a layer in pixels — 512 (small) or 1024
   *  (medium / large). Sourced from `HI_RES_LAYER_SIDE_BY_TIER` in
   *  `src/data/sources.ts`. */
  layerSide: number;
  /** Number of layers in the array. Pass `HI_RES_LAYER_COUNT` from
   *  `src/data/sources.ts`. */
  layerCount: number;
};
