/**
 * Tests for the (sourceCode << 27) | localIdx packed-identity encoding.
 *
 * These cover round-trip correctness, the cleared-pick-texture sentinel
 * convention, and bounds (5-bit source, 27-bit localIdx). The TS↔WESL
 * parity test lives at the bottom and is added in a later task.
 */

import { describe, it, expect } from 'vitest';
import {
  SELECTION_SOURCE_SHIFT,
  SELECTION_LOCAL_IDX_MASK,
  SELECTION_NONE_SENTINEL,
  PICK_SENTINEL_OFFSET,
  packSelection,
  unpackPick,
} from '../../src/data/selectionEncoding';

describe('selectionEncoding', () => {
  it('exposes the canonical encoding constants', () => {
    expect(SELECTION_SOURCE_SHIFT).toBe(27);
    expect(SELECTION_LOCAL_IDX_MASK).toBe(0x07ffffff);
    expect(SELECTION_NONE_SENTINEL).toBe(0xffffffff);
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('packs (source, localIdx) into the documented bit layout', () => {
    // Source code 3 (e.g. SDSS) in bits 27..31, localIdx 42 in bits 0..26.
    // Expected: (3 << 27) | 42 = 0x18000000 | 0x2a = 0x1800002a.
    expect(packSelection(3, 42)).toBe(0x1800002a);
  });

  it('packs source code 0 + localIdx 0 to 0', () => {
    // The picker offsets writes by +1 specifically because this packed
    // value collides with the cleared-pick-texture sentinel. The encoding
    // itself does NOT do the offset — that's the picker's job.
    expect(packSelection(0, 0)).toBe(0);
  });

  it('unpacks a real pick value back to (source, localIdx)', () => {
    // Picker writes `packed + 1`. So a real hit of source=3, localIdx=42
    // arrives as 0x1800002b. unpackPick subtracts 1 from the bottom 27 bits.
    expect(unpackPick(0x1800002b)).toEqual({ source: 3, localIdx: 42 });
  });

  it('unpacks raw == 0 to null (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('round-trips pack → +1 → unpackPick for a variety of identities', () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [0, 0x07fffffe],     // max localIdx that survives the +1 offset
      [1, 0],
      [31, 0],
      [31, 0x07fffffe],
    ];
    for (const [source, localIdx] of cases) {
      const packed = packSelection(source, localIdx);
      const rawPick = (packed + PICK_SENTINEL_OFFSET) >>> 0;
      expect(unpackPick(rawPick)).toEqual({ source, localIdx });
    }
  });

  it('sentinel does not collide with any allocated packed identity', () => {
    // Source codes 0..30 are allocated (5 bits, 32 slots, top slot 31
    // intentionally unallocated). Packing the largest allocated source
    // with the largest localIdx must remain < SELECTION_NONE_SENTINEL.
    const largestAllocated = packSelection(30, SELECTION_LOCAL_IDX_MASK);
    expect(largestAllocated).toBeLessThan(SELECTION_NONE_SENTINEL);
  });
});
