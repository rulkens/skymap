import { describe, it, expect, vi } from 'vitest';
import { SlotPool } from '../../../src/utils/cache/slotPool';

// The galaxy thumbnail atlas's capacity (2048/128 squared); the state machine
// under test is agnostic to the actual number.
const SLOT_COUNT = 256;

describe('SlotPool slot state machine', () => {
  const newPool = () => new SlotPool(SLOT_COUNT);

  it('returns the same slot for the same key (idempotent)', () => {
    const a = newPool();
    const slot = a.allocate('obj-x', 1);
    expect(a.allocate('obj-x', 2)).toBe(slot);
    expect(a.allocate('obj-x', 99)).toBe(slot);
  });

  it('evicts the LRU slot when full', () => {
    const a = newPool();
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
    const a = newPool();
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
    it('a thrown handler does not break atlas invariants', () => {
      const a = newPool();
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
  });

  // A consumer whose wanted set exceeds the pool (the Earth tile planner asks
  // for ~107 tiles against 64 slots) claims every slot within a single frame
  // and then keeps asking. Evicting there would recycle a slot claimed moments
  // earlier in the SAME frame, and since the consumer re-requests a stable set
  // every frame from a stationary camera, that repeats forever: the evicted key
  // is refetched next frame only to be evicted again. The pool has to say
  // "full" instead, which is what the `number | null` return exists for.
  describe('over-budget within a single frame', () => {
    // Deliberately tiny so "wanted set exceeds capacity" is a handful of
    // calls rather than hundreds.
    const SMALL_SLOT_COUNT = 4;
    const newSmallPool = () => new SlotPool(SMALL_SLOT_COUNT);
    // Twice capacity, so the back half is always over budget.
    const WANTED = Array.from({ length: SMALL_SLOT_COUNT * 2 }, (_, i) => `tile-${i}`);

    it('returns null rather than evicting a slot claimed earlier in the same frame', () => {
      const a = newSmallPool();
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
      const a = newSmallPool();
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
      const a = newSmallPool();
      const onEvict = vi.fn();
      a.setEvictHandler(onEvict);

      for (let i = 0; i < SMALL_SLOT_COUNT; i++) a.allocate(`tile-${i}`, 1);
      // Frame 2: every resident slot is now a frame behind, so the pool is free
      // to recycle the oldest for a genuinely new key.
      expect(a.allocate('tile-new', 2)).toBe(0);
      expect(onEvict).toHaveBeenCalledWith('tile-0');
    });
  });
});
