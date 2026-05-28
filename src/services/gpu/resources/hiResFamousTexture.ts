/**
 * Hi-res famous-galaxy texture-array resource.
 *
 * One small fixed-capacity GPUTexture (default 8 layers, 512² or 1024²
 * each) holds the high-resolution decoded bitmaps for the famous
 * galaxies currently large enough on screen to deserve the extra
 * detail. The runtime gates entry into this array via the disk's
 * apparent diameter — when a galaxy's procedural disk grows past the
 * hi-res threshold the engine asks 'allocate()' for a layer, then
 * enqueues a hi-res fetch.
 *
 * Why a 'texture_2d_array' instead of a second TextureAtlas? See ADR 0002.
 * A 1024² slot inside the 2048² atlas would burn 25% of the atlas on a
 * single thumbnail, starving every other galaxy. An 8-layer 1024² array
 * bounds the worst-case memory at ~32 MB while letting the existing atlas
 * keep serving the thousands of smaller thumbnails it was sized for.
 *
 * Eviction policy: LRU by *recent apparent diameter*, NOT by frame counter.
 * The smallest-diameter resident is the one the camera is moving away
 * from fastest. LRU-by-frame would evict exactly the wrong layer when
 * the camera oscillates between two large galaxies (both "recently seen",
 * the third much-smaller layer would survive).
 *
 * This file owns the GPUTexture + view + bookkeeping ONLY. It does NOT
 * own the bind-group layout — auto-derived BGLs are pipeline-specific
 * (see the 'feedback_webgpu_auto_layout_trap' memory); the BGL lives
 * in 'texturedDiskRenderer.ts'.
 */

import type {
  HiResFamousTexture,
  CreateHiResFamousTextureArgs,
} from '../../../@types/rendering/HiResFamousTexture';

/**
 * Per-layer bookkeeping. 'recentPx' drives eviction (see module header).
 * 'loaded' and 'failed' are independent because a fetch can be pending,
 * succeed, or fail permanently and the engine needs all three states
 * distinct.
 */
type LayerEntry = {
  key: string;
  layerIdx: number;
  recentPx: number;
  loaded: boolean;
  failed: boolean;
};

export function createHiResFamousTexture(
  args: CreateHiResFamousTextureArgs,
): HiResFamousTexture {
  const { device, layerSide, layerCount } = args;

  // The entry carries its own layerIdx so 'layerForKey' is O(1) without
  // a second map.
  const entries = new Map<string, LayerEntry>();

  // Initialised to [0..layerCount-1] so 'allocate' hands them out in
  // order on a fresh handle — matches the sequential-indices contract
  // the tests pin.
  const freeList: number[] = [];
  for (let i = 0; i < layerCount; i++) freeList.push(i);

  let texture: GPUTexture | undefined;
  let destroyed = false;
  let onEvict: ((evictedKey: string) => void) | undefined;

  // ── GPU resource lifecycle ──────────────────────────────────────

  function initTexture(): void {
    if (texture) return;
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    texture = device.createTexture({
      label: 'hi-res-famous-array',
      dimension: '2d',
      size: [layerSide, layerSide, layerCount],
      format: 'rgba8unorm-srgb',
      // TEXTURE_BINDING   — fragment shader samples as 'texture_2d_array<f32>'.
      // COPY_DST          — uploadBitmap writes layers in.
      // RENDER_ATTACHMENT — required by 'copyExternalImageToTexture' even when
      //                     we never draw into the texture; the implementation
      //                     may use an internal render pass for sRGB encoding
      //                     and unpremul-to-premul conversion when copying
      //                     from an ImageBitmap source. Omitting this flag
      //                     trips a WebGPU validation error at upload time.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function uploadBitmap(layerIdx: number, bitmap: ImageBitmap): void {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    if (!texture) throw new Error('HiResFamousTexture: call initTexture() first.');
    device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture, origin: [0, 0, layerIdx] },
      [layerSide, layerSide, 1],
    );
    // Mark the entry that owns this layer as loaded. O(N) scan, N=8 —
    // the caller passed an index, not a key.
    for (const entry of entries.values()) {
      if (entry.layerIdx === layerIdx) {
        entry.loaded = true;
        break;
      }
    }
  }

  function getLayerSide(): number {
    return layerSide;
  }

  function getTextureView(): GPUTextureView {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    if (!texture) throw new Error('HiResFamousTexture: call initTexture() first.');
    // 'dimension: 2d-array' on the VIEW is what makes the WGSL
    // 'texture_2d_array<f32>' binding resolve. Without it WebGPU
    // infers a 'texture_2d' view (single layer 0) and bind-group
    // creation fails at pipeline time with a "view dimension mismatch".
    return texture.createView({
      label: 'hi-res-famous-view',
      dimension: '2d-array',
    });
  }

  // ── Slot bookkeeping ────────────────────────────────────────────

  function allocate(key: string, recentApparentDiameterPx: number): number {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    const existing = entries.get(key);
    if (existing !== undefined) {
      existing.recentPx = recentApparentDiameterPx;
      return existing.layerIdx;
    }

    // Free layer available — take it.
    if (freeList.length > 0) {
      const layerIdx = freeList.shift()!;
      entries.set(key, {
        key,
        layerIdx,
        recentPx: recentApparentDiameterPx,
        loaded: false,
        failed: false,
      });
      return layerIdx;
    }

    // Find the eviction victim by smallest recentPx. If the smallest
    // resident is already larger than the caller's diameter, the caller
    // is less deserving and we refuse with -1 — the "cannot evict" half
    // of the contract.
    // O(N) scan, N=8 (layerCount); a heap would be appropriate above ~64.
    let victim: LayerEntry | undefined;
    for (const entry of entries.values()) {
      if (victim === undefined || entry.recentPx < victim.recentPx) {
        victim = entry;
      }
    }
    if (victim === undefined) return -1; // unreachable: freeList empty ⇒ entries non-empty
    if (victim.recentPx >= recentApparentDiameterPx) return -1;

    // Fire the handler BEFORE mutating state — matches the TextureAtlas
    // invariant that at handler-call time the evicted key's layer
    // mapping is still queryable. Catching keeps the array consistent
    // (one entry removed but the new one never inserted) on a thrown
    // handler.
    if (onEvict) {
      try {
        onEvict(victim.key);
      } catch (err) {
        console.error('[HiResFamousTexture] onEvict handler threw:', err);
      }
    }

    const reclaimedLayer = victim.layerIdx;
    entries.delete(victim.key);
    entries.set(key, {
      key,
      layerIdx: reclaimedLayer,
      recentPx: recentApparentDiameterPx,
      loaded: false,
      failed: false,
    });
    return reclaimedLayer;
  }

  function touch(key: string, recentApparentDiameterPx: number): void {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    const entry = entries.get(key);
    if (entry !== undefined) entry.recentPx = recentApparentDiameterPx;
  }

  function release(key: string): void {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    const entry = entries.get(key);
    if (entry === undefined) return;
    entries.delete(key);
    // Push to the FRONT (LIFO) so a just-released layer is the next one
    // handed out — matches the natural expectation that
    // 'release(k); allocate(k2)' re-uses the same slot, and keeps test
    // assertions about layer indices stable.
    freeList.unshift(entry.layerIdx);
  }

  function isLoaded(key: string): boolean {
    return entries.get(key)?.loaded === true;
  }

  function isFailed(key: string): boolean {
    return entries.get(key)?.failed === true;
  }

  function markFailed(key: string): void {
    if (destroyed) throw new Error('HiResFamousTexture: handle is destroyed.');
    const entry = entries.get(key);
    if (entry !== undefined) entry.failed = true;
  }

  function layerForKey(key: string): number | undefined {
    return entries.get(key)?.layerIdx;
  }

  function setEvictHandler(handler: ((evictedKey: string) => void) | undefined): void {
    onEvict = handler;
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (texture) {
      texture.destroy();
      texture = undefined;
    }
    entries.clear();
    freeList.length = 0;
    onEvict = undefined;
  }

  return {
    initTexture,
    allocate,
    touch,
    release,
    isLoaded,
    isFailed,
    markFailed,
    layerForKey,
    uploadBitmap,
    getTextureView,
    getLayerSide,
    setEvictHandler,
    destroy,
  };
}
