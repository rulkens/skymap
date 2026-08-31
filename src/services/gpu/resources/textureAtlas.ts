/**
 * GPU texture atlas for square thumbnail/tile grids.
 *
 * Layout: a single atlasSide×atlasSide RGBA texture sliced into a square
 * grid of slotSide×slotSide slots. Each slot is keyed by a string (the
 * galaxy atlas keys by `${ra},${dec}` so the same galaxy across frames
 * hits the same slot; other consumers pick their own key shape).
 *
 * Why a fixed-size atlas? WebGPU caps simultaneously-bound textures at ~16,
 * and a per-item GPUTexture would thrash the resource allocator at scale.
 * One atlas + one bind group = one draw call for thousands of textured
 * items.
 *
 * Eviction is LRU by `lastSeenFrame`: when full, the slot with the oldest
 * `lastSeenFrame` is replaced — unless that slot was claimed on the frame
 * doing the asking, in which case `allocate` returns null instead of eating
 * its own work (see its docstring). The caller calls `touch(key, frame)` every
 * frame the item is on screen so visible thumbnails stay alive.
 *
 * A slot index is a fact about the frame that produced it, not a property of
 * the key: an evicted key is dropped from the key→slot map entirely, so
 * re-requesting it later assigns a different slot. Code holding an index
 * across an await (a bitmap fetch) must re-resolve it through `slotOf` before
 * writing pixels, or it writes into whichever key has since taken that slot.
 *
 * Geometry (atlasSide, slotSide) and pixel format are constructor
 * configuration, not constants, because more than one atlas exists in the
 * renderer — e.g. the galaxy thumbnail atlas and an Earth surface tile
 * atlas — each with its own grid size and format. `slotsPerRow` and
 * `slotCount` are derived from `atlasSide / slotSide` rather than passed
 * in, since they're not independent facts.
 */

import type { Vec4 } from '../../../@types/math/Vec4';

type SlotEntry = { key: string; lastSeenFrame: number };

type TextureAtlasConfig = {
  /** Side length, in pixels, of the square atlas texture. */
  readonly atlasSide: number;
  /** Side length, in pixels, of each square slot within the atlas. */
  readonly slotSide: number;
  /** Pixel format of the underlying GPUTexture. */
  readonly format: GPUTextureFormat;
  /**
   * GPU debug label for this atlas, e.g. `'galaxy-atlas'`. Surfaces in
   * devtools and validation errors, which matters once more than one atlas
   * is live at once (see the "more than one atlas exists" note above) — a
   * hardcoded label would misattribute every other consumer's texture. The
   * texture view derives `${label}-view` from this.
   */
  readonly label: string;
};

import type { AtlasEvictHandler } from '../../../@types/rendering/AtlasEvictHandler';

export class TextureAtlas {
  // The GPU device is needed only by uploadBitmap and initTexture. Slot
  // management works without it, which is what the unit tests exercise.
  private readonly device: GPUDevice;

  private readonly atlasSide: number;
  private readonly slotSide: number;
  private readonly format: GPUTextureFormat;
  private readonly label: string;

  // Derived from atlasSide / slotSide — not independent inputs.
  private readonly slotsPerRow: number;
  private readonly slotCount: number;

  // Index in [0, slotCount) → entry occupying that slot, or undefined if free.
  private readonly slots: Array<SlotEntry | undefined>;

  // Reverse lookup: key → slot index. Lets us idempotently allocate the same
  // key without scanning the slots array.
  private readonly keyToSlot = new Map<string, number>();

  // Optional eviction callback — see AtlasEvictHandler.  Stored as a single
  // function (not an array) because a given atlas has exactly one consumer
  // at present (e.g. the thumbnail subsystem for the galaxy atlas).  If an
  // atlas ever grows a second consumer, promoting this to an array of
  // handlers is a one-line change.
  private onEvict: AtlasEvictHandler | undefined;

  constructor(device: GPUDevice, config: TextureAtlasConfig) {
    this.device = device;
    this.atlasSide = config.atlasSide;
    this.slotSide = config.slotSide;
    this.format = config.format;
    this.label = config.label;
    this.slotsPerRow = this.atlasSide / this.slotSide;
    this.slotCount = this.slotsPerRow * this.slotsPerRow;
    this.slots = new Array(this.slotCount).fill(undefined);
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
  // methods are the GPU side: a single atlasSide×atlasSide texture, plus
  // per-slot copyExternalImageToTexture calls when bitmaps land, plus a
  // view-getter for the quad pipeline's bind group.
  //
  // `initTexture` is separate from the constructor so unit tests can
  // construct the class without a real GPU device.  In production code
  // the engine calls initTexture exactly once after constructing the atlas.

  private texture: GPUTexture | undefined;

  /**
   * Create the underlying atlasSide×atlasSide texture.  Must be called once
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
      label: this.label,
      size: [this.atlasSide, this.atlasSide, 1],
      format: this.format,
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
   * slotSide × slotSide — the fetcher is responsible for resizing during
   * decode via
   * `createImageBitmap(blob, { resizeWidth: slotSide, resizeHeight: slotSide })`.
   *
   * The slot is taken on trust — nothing here can tell a deliberate write from
   * a stale index. A caller holding a KEY resolves it through `slotOf`
   * immediately before calling this (see `bitmapStreamSubsystem.uploadBitmap`).
   *
   * Why `copyExternalImageToTexture` rather than `writeTexture`?  The
   * former takes an ImageBitmap directly without us having to read the
   * pixel data into a CPU buffer first.  The browser's GPU integration
   * does the bitmap→texture copy on its own, often without a round-trip
   * through main memory.
   *
   * `flipY: false` because our quad shader's UVs already follow the
   * convention that v=0 is the top of the atlas, which matches the
   * ImageBitmap's natural orientation.  Flipping would put the image
   * upside-down on screen.
   */
  uploadBitmap(slotIdx: number, bitmap: ImageBitmap): void {
    if (!this.texture) throw new Error('TextureAtlas: call initTexture() first.');
    const col = slotIdx % this.slotsPerRow;
    const row = Math.floor(slotIdx / this.slotsPerRow);
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture: this.texture, origin: [col * this.slotSide, row * this.slotSide, 0] },
      [this.slotSide, this.slotSide, 1],
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
    return this.texture.createView({ label: `${this.label}-view` });
  }

  /**
   * Get the slot for `key`, allocating one if needed. Sets `lastSeenFrame`.
   * Returns the slot index (callers use it to compute UVs), or `null` when the
   * atlas is full of slots already claimed on THIS frame.
   *
   * A resident key always gets its slot back. Only a NEW key can be refused,
   * and only when every slot carries `lastSeenFrame === frame`.
   *
   * Why refuse rather than evict? A consumer (e.g. the Earth tile planner,
   * whose demand scales with screen area and pyramid depth) can want more
   * items than the atlas holds, claim every slot early in the frame, and keep
   * asking. Evicting there would recycle a slot claimed moments earlier in the
   * SAME frame — and because a stationary camera re-requests a stable set
   * every frame, it would repeat forever: evict, refetch, evict. The bounded
   * answer is to serve what fits (planners order largest-on-screen-first) and
   * tell the rest the atlas is full. A slot last seen on an EARLIER frame is
   * genuinely stale and LRU recycles it as usual.
   */
  allocate(key: string, frame: number): number | null {
    const touched = this.touch(key, frame);
    if (touched !== null) return touched;
    // Find a free slot first.
    for (let i = 0; i < this.slotCount; i++) {
      if (this.slots[i] === undefined) {
        this.slots[i] = { key, lastSeenFrame: frame };
        this.keyToSlot.set(key, i);
        return i;
      }
    }
    // Atlas full — evict LRU.
    let lruIdx = 0;
    let lruFrame = this.slots[0]!.lastSeenFrame;
    for (let i = 1; i < this.slotCount; i++) {
      const f = this.slots[i]!.lastSeenFrame;
      if (f < lruFrame) {
        lruIdx = i;
        lruFrame = f;
      }
    }
    // Even the least-recently-used slot was claimed this frame, so every slot
    // is spoken for and there is nothing to take. See the docstring for why
    // taking one anyway is a refetch loop rather than a cache miss.
    if (lruFrame === frame) return null;

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

  /**
   * Refresh `lastSeenFrame` for a resident key and return its slot, or `null`
   * without touching anything if `key` holds no slot. `allocate`'s existing-key
   * branch delegates here; a caller that only wants to keep a resident alive
   * (never allocate a new one) calls this directly.
   */
  touch(key: string, frame: number): number | null {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return null;
    this.slots[idx]!.lastSeenFrame = frame;
    return idx;
  }

  /**
   * The slot `key` occupies right now, or undefined if it occupies none — the
   * question an async writer must ask instead of trusting `allocate`'s return
   * value (see the module header). Kept read-only: resolving a key that is no
   * longer resident must not resurrect it.
   */
  slotOf(key: string): number | undefined {
    return this.keyToSlot.get(key);
  }

  /** Returns the last-seen frame for `key`, or undefined if not in the atlas. */
  lastSeenFrame(key: string): number | undefined {
    const idx = this.keyToSlot.get(key);
    return idx === undefined ? undefined : this.slots[idx]!.lastSeenFrame;
  }

  /** Number of slots currently claimed by a key — a debug-readout convenience,
   *  not read by any render path. */
  occupiedCount(): number {
    return this.keyToSlot.size;
  }

  /**
   * UV rectangle [u0, v0, u1, v1] for a slot, in [0,1] texture coords.
   * Slots are laid out row-major: slot N is at column (N % slotsPerRow),
   * row (N / slotsPerRow).
   */
  slotUv(slotIdx: number): Vec4 {
    const col = slotIdx % this.slotsPerRow;
    const row = Math.floor(slotIdx / this.slotsPerRow);
    const slotNorm = this.slotSide / this.atlasSide;
    const u0 = col * slotNorm;
    const v0 = row * slotNorm;
    return [u0, v0, u0 + slotNorm, v0 + slotNorm];
  }
}
