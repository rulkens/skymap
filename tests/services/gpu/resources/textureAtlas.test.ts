import { describe, it, expect, vi } from 'vitest';
import { TextureAtlas } from '../../../../src/services/gpu/resources/textureAtlas';

// Test-local geometry, standing in for a real consumer's configuration
// (e.g. the galaxy thumbnail atlas's 2048/128 or an Earth tile atlas's
// own values). The state machine under test is agnostic to the actual
// numbers, so any square grid exercises it.
const ATLAS_SIDE = 2048;
const SLOT_SIDE = 128;
const SLOT_COUNT = (ATLAS_SIDE / SLOT_SIDE) * (ATLAS_SIDE / SLOT_SIDE);

describe('TextureAtlas slot state machine', () => {
  // Construct without a real GPU device — pass `null as any`. The
  // state-machine path doesn't touch the device until we call uploadBitmap.
  const newAtlas = () =>
    new TextureAtlas(null as unknown as GPUDevice, {
      atlasSide: ATLAS_SIDE,
      slotSide: SLOT_SIDE,
      format: 'rgba8unorm-srgb',
      label: 'test-atlas',
    });

  it('allocates sequential slots starting at 0', () => {
    const a = newAtlas();
    expect(a.allocate('obj-1', 1)).toBe(0);
    expect(a.allocate('obj-2', 1)).toBe(1);
    expect(a.allocate('obj-3', 1)).toBe(2);
  });

  it('returns the same slot for the same key (idempotent)', () => {
    const a = newAtlas();
    const slot = a.allocate('obj-x', 1);
    expect(a.allocate('obj-x', 2)).toBe(slot);
    expect(a.allocate('obj-x', 99)).toBe(slot);
  });

  it('records the frame the slot was last seen', () => {
    const a = newAtlas();
    a.allocate('obj-y', 5);
    a.touch('obj-y', 17);
    expect(a.lastSeenFrame('obj-y')).toBe(17);
  });

  it('evicts the LRU slot when full', () => {
    const a = newAtlas();
    // Fill all SLOT_COUNT slots, each with a distinct lastSeenFrame
    for (let i = 0; i < SLOT_COUNT; i++) {
      a.allocate(`obj-${i}`, i);
    }
    // The next allocation must evict 'obj-0' (smallest lastSeenFrame).
    const evicted = a.allocate('obj-new', 9999);
    expect(evicted).toBe(0); // slot 0 reused
    expect(a.lastSeenFrame('obj-0')).toBeUndefined();
    expect(a.lastSeenFrame('obj-new')).toBe(9999);
  });

  // The bug this reproduces: a bitmap fetched for a key that was evicted and
  // then re-requested landed in the slot the FIRST allocation returned, painting
  // it over whichever key had taken that slot meanwhile. `slotOf` is what an
  // async writer asks instead, so it has to track the re-allocation and not the
  // original.
  it('slotOf follows a key across an evict-and-return, rather than its first slot', () => {
    const a = newAtlas();
    for (let i = 0; i < SLOT_COUNT; i++) a.allocate(`obj-${i}`, i);
    const firstSlot = a.slotOf('obj-0');

    // Frame 9999 evicts obj-0 (the LRU) and hands its slot to the newcomer.
    a.allocate('usurper', 9999);
    expect(a.slotOf('obj-0')).toBeUndefined();
    expect(a.slotOf('usurper')).toBe(firstSlot);

    // obj-0 comes back and gets whatever is stale NOW — obj-1's slot, not its own.
    const secondSlot = a.allocate('obj-0', 10000);
    expect(secondSlot).not.toBe(firstSlot);
    expect(a.slotOf('obj-0')).toBe(secondSlot);
  });

  describe('onEvict handler', () => {
    it('fires onEvict with the evicted key when LRU kicks an old slot', () => {
      const a = newAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);
      // Fill the atlas with distinct lastSeenFrame values; obj-0 will be LRU.
      for (let i = 0; i < SLOT_COUNT; i++) {
        a.allocate(`obj-${i}`, i);
      }
      expect(onEvict).not.toHaveBeenCalled();
      // Allocating a new key forces eviction of obj-0.
      a.allocate('obj-new', 9999);
      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith('obj-0');
    });

    it('does NOT fire onEvict on free-slot allocation or refresh', () => {
      const a = newAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);
      // Allocations into free slots — no eviction.
      a.allocate('obj-1', 1);
      a.allocate('obj-2', 1);
      // Re-allocate same key — idempotent, no eviction.
      a.allocate('obj-1', 5);
      expect(onEvict).not.toHaveBeenCalled();
    });

    it('a thrown handler does not break atlas invariants', () => {
      const a = newAtlas();
      a.setEvictHandler(() => {
        throw new Error('handler boom');
      });
      // Suppress the expected console.error from the catch block so the
      // test output stays clean.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let i = 0; i < SLOT_COUNT; i++) a.allocate(`obj-${i}`, i);
      // Eviction must still complete — the new key replaces the LRU slot.
      const slot = a.allocate('obj-new', 9999);
      expect(slot).toBe(0);
      expect(a.lastSeenFrame('obj-0')).toBeUndefined();
      expect(a.lastSeenFrame('obj-new')).toBe(9999);
      errSpy.mockRestore();
    });

    it('setEvictHandler(undefined) clears the handler', () => {
      const a = newAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);
      a.setEvictHandler(undefined);
      for (let i = 0; i < SLOT_COUNT; i++) a.allocate(`obj-${i}`, i);
      a.allocate('obj-new', 9999);
      expect(onEvict).not.toHaveBeenCalled();
    });
  });

  // A consumer whose wanted set exceeds the atlas (the Earth tile planner asks
  // for ~107 tiles against 64 slots) claims every slot within a single frame
  // and then keeps asking. Evicting there would recycle a slot claimed moments
  // earlier in the SAME frame, and since the consumer re-requests a stable set
  // every frame from a stationary camera, that repeats forever: the evicted key
  // is refetched next frame only to be evicted again. The atlas has to say
  // "full" instead, which is what the `number | null` return exists for.
  describe('over-budget within a single frame', () => {
    // Deliberately tiny (2×2) so "wanted set exceeds capacity" is a handful of
    // calls rather than hundreds.
    const SMALL_SIDE = 256;
    const SMALL_SLOT_COUNT = (SMALL_SIDE / SLOT_SIDE) * (SMALL_SIDE / SLOT_SIDE);
    const newSmallAtlas = () =>
      new TextureAtlas(null as unknown as GPUDevice, {
        atlasSide: SMALL_SIDE,
        slotSide: SLOT_SIDE,
        format: 'rgba8unorm-srgb',
        label: 'test-atlas-small',
      });
    // Twice capacity, so the back half is always over budget.
    const WANTED = Array.from({ length: SMALL_SLOT_COUNT * 2 }, (_, i) => `tile-${i}`);

    it('returns null rather than evicting a slot claimed earlier in the same frame', () => {
      const a = newSmallAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);

      const slots = WANTED.map((key) => a.allocate(key, 1));

      expect(slots.slice(0, SMALL_SLOT_COUNT)).toEqual([...Array(SMALL_SLOT_COUNT).keys()]);
      expect(slots.slice(SMALL_SLOT_COUNT)).toEqual(new Array<null>(SMALL_SLOT_COUNT).fill(null));
      expect(onEvict).not.toHaveBeenCalled();
      // The keys that DID win slots keep them, unmolested by the over-budget tail.
      expect(a.lastSeenFrame('tile-0')).toBe(1);
    });

    it('reaches a steady state when the same over-budget set repeats every frame', () => {
      const a = newSmallAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);

      for (const frame of [1, 2, 3]) {
        for (const key of WANTED) a.allocate(key, frame);
      }

      // A stationary camera asking for the same tiles must stop churning: any
      // eviction here is a slot recycled inside the frame that claimed it, and
      // the consumer would refetch it on the next frame, forever.
      expect(onEvict).not.toHaveBeenCalled();
      expect(a.lastSeenFrame('tile-0')).toBe(3);
    });

    it('still evicts across a frame boundary — a slot last seen earlier is stale', () => {
      const a = newSmallAtlas();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);

      for (let i = 0; i < SMALL_SLOT_COUNT; i++) a.allocate(`tile-${i}`, 1);
      // Frame 2: every resident slot is now a frame behind, so the atlas is free
      // to recycle the oldest for a genuinely new key.
      expect(a.allocate('tile-new', 2)).toBe(0);
      expect(onEvict).toHaveBeenCalledWith('tile-0');
    });
  });

  it('slotUv returns the [u0,v0,u1,v1] rectangle for a slot in [0,1] coords', () => {
    const a = newAtlas();
    expect(a.slotUv(0)).toEqual([0, 0, SLOT_SIDE / ATLAS_SIDE, SLOT_SIDE / ATLAS_SIDE]);
    // Slot 16 = row 1, col 0 (since 16 slots per row).
    const uvRow1 = a.slotUv(16);
    expect(uvRow1[1]).toBeCloseTo(SLOT_SIDE / ATLAS_SIDE);
  });
});
