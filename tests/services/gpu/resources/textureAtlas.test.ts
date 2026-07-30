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

  it('release() frees a slot for re-use', () => {
    const a = newAtlas();
    const slot = a.allocate('obj-z', 1);
    a.release('obj-z');
    expect(a.lastSeenFrame('obj-z')).toBeUndefined();
    expect(a.allocate('obj-w', 2)).toBe(slot); // reuses freed slot
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

  it('slotUv returns the [u0,v0,u1,v1] rectangle for a slot in [0,1] coords', () => {
    const a = newAtlas();
    expect(a.slotUv(0)).toEqual([0, 0, SLOT_SIDE / ATLAS_SIDE, SLOT_SIDE / ATLAS_SIDE]);
    // Slot 16 = row 1, col 0 (since 16 slots per row).
    const uvRow1 = a.slotUv(16);
    expect(uvRow1[1]).toBeCloseTo(SLOT_SIDE / ATLAS_SIDE);
  });
});
