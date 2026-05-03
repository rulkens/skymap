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

export const ATLAS_SIDE = 2048;
export const SLOT_SIDE = 128;
const SLOTS_PER_ROW = ATLAS_SIDE / SLOT_SIDE; // 16
export const SLOT_COUNT = SLOTS_PER_ROW * SLOTS_PER_ROW; // 256

type SlotEntry = { key: string; lastSeenFrame: number };

export class TextureAtlas {
  // The GPU device is needed only by uploadBitmap (Task 5). Slot management
  // works without it, which is what the unit tests exercise.
  private readonly device: GPUDevice;

  // Index in [0, SLOT_COUNT) → entry occupying that slot, or undefined if free.
  private readonly slots: Array<SlotEntry | undefined> = new Array(SLOT_COUNT).fill(undefined);

  // Reverse lookup: key → slot index. Lets us idempotently allocate the same
  // key without scanning the slots array.
  private readonly keyToSlot = new Map<string, number>();

  constructor(device: GPUDevice) {
    this.device = device;
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
  slotUv(slotIdx: number): [number, number, number, number] {
    const col = slotIdx % SLOTS_PER_ROW;
    const row = Math.floor(slotIdx / SLOTS_PER_ROW);
    const slotNorm = SLOT_SIDE / ATLAS_SIDE;
    const u0 = col * slotNorm;
    const v0 = row * slotNorm;
    return [u0, v0, u0 + slotNorm, v0 + slotNorm];
  }
}
