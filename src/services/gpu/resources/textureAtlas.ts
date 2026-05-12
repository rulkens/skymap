/**
 * GPU texture atlas for galaxy thumbnails.
 *
 * Layout: a single 2048×2048 RGBA texture sliced into a 16×16 grid of
 * 128×128 slots — 256 thumbnails total. Each slot is keyed by a string
 * (typically `${ra},${dec}` so the same galaxy across frames hits the same
 * slot).
 *
 * Why a fixed-size atlas? WebGPU caps simultaneously-bound textures at ~16,
 * and a per-galaxy GPUTexture would thrash the resource allocator at scale.
 * One atlas + one bind group = one draw call for thousands of textured
 * galaxies.
 *
 * Eviction is LRU by `lastSeenFrame`: when full, the slot with the oldest
 * `lastSeenFrame` is replaced. The engine calls `touch(key, frame)` every
 * frame the galaxy is on screen so visible thumbnails stay alive.
 *
 * This file only handles slot bookkeeping.  The GPU-side methods
 * (createTexture, uploadBitmap, getTextureView) land in Task 5.  Until
 * then the constructor accepts the device and stashes it for later — the
 * state-machine path doesn't touch the device, which is what makes this
 * task unit-testable without a GPU mock.
 */

import type { Vec4 } from '../../../@types/math/Vec4';

export const ATLAS_SIDE = 2048;
export const SLOT_SIDE = 128;
const SLOTS_PER_ROW = ATLAS_SIDE / SLOT_SIDE; // 16
export const SLOT_COUNT = SLOTS_PER_ROW * SLOTS_PER_ROW; // 256

type SlotEntry = { key: string; lastSeenFrame: number };

import type { AtlasEvictHandler } from '../../../@types/rendering/AtlasEvictHandler';

export class TextureAtlas {
  // The GPU device is needed only by uploadBitmap (Task 5). Slot management
  // works without it, which is what the unit tests exercise.
  private readonly device: GPUDevice;

  // Index in [0, SLOT_COUNT) → entry occupying that slot, or undefined if free.
  private readonly slots: Array<SlotEntry | undefined> = new Array(SLOT_COUNT).fill(undefined);

  // Reverse lookup: key → slot index. Lets us idempotently allocate the same
  // key without scanning the slots array.
  private readonly keyToSlot = new Map<string, number>();

  // Optional eviction callback — see AtlasEvictHandler.  Stored as a single
  // function (not an array) because the atlas has exactly one consumer at
  // present (the thumbnail subsystem).  If we ever grow a second consumer,
  // promoting this to an array of handlers is a one-line change.
  private onEvict: AtlasEvictHandler | undefined;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Register a callback fired when LRU eviction overwrites an existing
   * slot's contents.  See `AtlasEvictHandler` for the rationale; the
   * thumbnail subsystem uses this to keep its `bitmapReady` /
   * `bitmapFailed` maps in sync with the atlas's actual contents.
   *
   * Pass `undefined` to clear.  Calling more than once replaces the
   * previous handler — the last writer wins, intentionally, because we
   * want a clean tear-down path on engine destroy.
   */
  setEvictHandler(handler: AtlasEvictHandler | undefined): void {
    this.onEvict = handler;
  }

  // ── GPU resource lifecycle ──────────────────────────────────────────────
  //
  // The atlas's slot bookkeeping (above) works without a GPU.  These three
  // methods are the GPU side: a single 2048×2048 RGBA8 texture, plus
  // per-slot copyExternalImageToTexture calls when bitmaps land, plus a
  // view-getter for the quad pipeline's bind group.
  //
  // `initTexture` is separate from the constructor so unit tests can
  // construct the class without a real GPU device — see Task 4's tests.
  // In production code the engine calls initTexture exactly once after
  // constructing the atlas.

  private texture: GPUTexture | undefined;

  /**
   * Create the underlying 2048×2048 RGBA8 texture.  Must be called once
   * after construction, before uploadBitmap or getTextureView.  Separate
   * from the constructor so unit tests can construct without a GPU device
   * and exercise the slot state machine.
   *
   * Idempotent: a second call is a no-op.  Useful if the engine ever
   * recreates its render pipeline without recreating the atlas.
   */
  initTexture(): void {
    if (this.texture) return;
    this.texture = this.device.createTexture({
      label: 'galaxy-atlas',
      size: [ATLAS_SIDE, ATLAS_SIDE, 1],
      format: 'rgba8unorm',
      // TEXTURE_BINDING — the quad pass samples this texture in fs.
      // COPY_DST       — uploadBitmap writes new slots in.
      // RENDER_ATTACHMENT — lets us clear / re-render the atlas if we ever
      //                    add a "loading…" placeholder pass.  Optional now,
      //                    cheap to keep so we don't have to recreate the
      //                    texture later if we add that feature.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /**
   * Upload an ImageBitmap into the given slot.  The bitmap must be exactly
   * SLOT_SIDE × SLOT_SIDE (128×128) — the fetcher is responsible for
   * resizing during decode via
   * `createImageBitmap(blob, { resizeWidth: SLOT_SIDE, resizeHeight: SLOT_SIDE })`.
   *
   * Why `copyExternalImageToTexture` rather than `writeTexture`?  The
   * former takes an ImageBitmap directly without us having to read the
   * pixel data into a CPU buffer first.  The browser's GPU integration
   * does the bitmap→texture copy on its own, often without a round-trip
   * through main memory.
   *
   * `flipY: false` because our quad shader's UVs already follow the
   * convention that v=0 is the top of the atlas, which matches the
   * ImageBitmap's natural orientation.  Flipping would put galaxies
   * upside-down on screen.
   */
  uploadBitmap(slotIdx: number, bitmap: ImageBitmap): void {
    if (!this.texture) throw new Error('TextureAtlas: call initTexture() first.');
    const col = slotIdx % SLOTS_PER_ROW;
    const row = Math.floor(slotIdx / SLOTS_PER_ROW);
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture: this.texture, origin: [col * SLOT_SIDE, row * SLOT_SIDE, 0] },
      [SLOT_SIDE, SLOT_SIDE, 1],
    );
  }

  /**
   * Returns the texture view for binding into the quad pass pipeline.
   * The view is recreated on each call (cheap; just a small wrapper
   * struct), which means the caller doesn't have to track lifetime —
   * each frame's bind group can fetch a fresh view.
   */
  getTextureView(): GPUTextureView {
    if (!this.texture) throw new Error('TextureAtlas: call initTexture() first.');
    return this.texture.createView({ label: 'galaxy-atlas-view' });
  }

  /**
   * Get the slot for `key`, allocating one if needed. Sets `lastSeenFrame`.
   * If the atlas is full and `key` is new, evicts the LRU slot.
   * Returns the slot index (callers use it to compute UVs).
   */
  allocate(key: string, frame: number): number {
    const existing = this.keyToSlot.get(key);
    if (existing !== undefined) {
      this.slots[existing]!.lastSeenFrame = frame;
      return existing;
    }
    // Find a free slot first.
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this.slots[i] === undefined) {
        this.slots[i] = { key, lastSeenFrame: frame };
        this.keyToSlot.set(key, i);
        return i;
      }
    }
    // Atlas full — evict LRU.
    let lruIdx = 0;
    let lruFrame = this.slots[0]!.lastSeenFrame;
    for (let i = 1; i < SLOT_COUNT; i++) {
      const f = this.slots[i]!.lastSeenFrame;
      if (f < lruFrame) {
        lruIdx = i;
        lruFrame = f;
      }
    }
    const evictedKey = this.slots[lruIdx]!.key;
    this.keyToSlot.delete(evictedKey);
    // Fire the eviction handler BEFORE we overwrite the slot, so the
    // handler can read any state keyed on `evictedKey` and safely clear
    // its own bookkeeping.  Wrapped in try/catch because a thrown
    // handler must not corrupt the atlas's invariants — log and proceed.
    if (this.onEvict) {
      try {
        this.onEvict(evictedKey);
      } catch (err) {
        console.error('[TextureAtlas] onEvict handler threw:', err);
      }
    }
    this.slots[lruIdx] = { key, lastSeenFrame: frame };
    this.keyToSlot.set(key, lruIdx);
    return lruIdx;
  }

  /** Update `lastSeenFrame` for a slot known to exist. No-op if key not present. */
  touch(key: string, frame: number): void {
    const idx = this.keyToSlot.get(key);
    if (idx !== undefined) this.slots[idx]!.lastSeenFrame = frame;
  }

  /** Manually free a slot (e.g. after a fetch failed permanently). */
  release(key: string): void {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return;
    this.slots[idx] = undefined;
    this.keyToSlot.delete(key);
  }

  /** Returns the last-seen frame for `key`, or undefined if not in the atlas. */
  lastSeenFrame(key: string): number | undefined {
    const idx = this.keyToSlot.get(key);
    return idx === undefined ? undefined : this.slots[idx]!.lastSeenFrame;
  }

  /**
   * UV rectangle [u0, v0, u1, v1] for a slot, in [0,1] texture coords.
   * Slots are laid out row-major: slot N is at column (N % 16), row (N / 16).
   */
  slotUv(slotIdx: number): Vec4 {
    const col = slotIdx % SLOTS_PER_ROW;
    const row = Math.floor(slotIdx / SLOTS_PER_ROW);
    const slotNorm = SLOT_SIDE / ATLAS_SIDE;
    const u0 = col * slotNorm;
    const v0 = row * slotNorm;
    return [u0, v0, u0 + slotNorm, v0 + slotNorm];
  }
}
