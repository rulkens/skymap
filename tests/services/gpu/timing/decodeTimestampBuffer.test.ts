/**
 * decodeTimestampBuffer — pure-function unit coverage.
 *
 * Feeds synthetic BigUint64 arrays through the decoder and verifies:
 *   1. Slots with both timestamps non-zero produce (end-begin) * period / 1e6.
 *   2. Slots with (begin, end) both 0n are skipped (sentinel for "pass
 *      didn't run" — a fully-zeroed staging-buffer slot from
 *      explicit zero-init).
 *   3. Negative deltas (end < begin) are clamped to 0 — defends against
 *      driver wrap-around on GPUs that reset their tick counter.
 *   4. `timestampPeriod` is correctly applied (1 ns/tick → 0.001 ms/tick;
 *      coarse periods like 38.5 ns/tick should still multiply linearly).
 */

import { describe, it, expect } from 'vitest';
import { decodeTimestampBuffer } from '../../../../src/services/gpu/timing/decodeTimestampBuffer';

/** Build a 32-slot u64 buffer with the listed slot pairs filled in. */
function buildBuffer(pairs: ReadonlyArray<readonly [number, bigint, bigint]>): ArrayBuffer {
  const buf = new ArrayBuffer(32 * 8);
  const u64 = new BigUint64Array(buf);
  for (const [pairIdx, begin, end] of pairs) {
    u64[pairIdx * 2 + 0] = begin;
    u64[pairIdx * 2 + 1] = end;
  }
  return buf;
}

describe('decodeTimestampBuffer', () => {
  it('decodes one filled slot to (end-begin) * period / 1e6 ms', () => {
    const buf = buildBuffer([[0, 0n, 2_000_000n]]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.size).toBe(1);
    expect(out.get('point-sprites')).toBeCloseTo(2.0, 6);
  });

  it('skips slots whose (begin, end) are both 0 (pass-did-not-run sentinel)', () => {
    const buf = buildBuffer([[0, 100n, 1_000_100n]]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.has('point-sprites')).toBe(true);
    expect(out.has('pick')).toBe(false);
  });

  it('clamps negative deltas (end < begin) to 0', () => {
    // Pair index 2 = textured-disks (u64 slots 4/5), inherited from
    // the legacy `textured-impostors` slot.
    const buf = buildBuffer([[2, 5_000_000n, 1_000_000n]]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.get('textured-disks')).toBe(0);
  });

  it('applies a non-unit timestampPeriod correctly', () => {
    // Pair index 3 = filaments (u64 slots 6/7).
    const buf = buildBuffer([[3, 0n, 100_000n]]);
    const out = decodeTimestampBuffer(buf, 38.5);

    expect(out.get('filaments')).toBeCloseTo(3.85, 6);
  });

  it('decodes all 9 slots independently', () => {
    const buf = buildBuffer([
      [0, 0n, 1_000_000n], // point-sprites
      [1, 0n, 2_000_000n], // procedural-disks
      [2, 0n, 3_000_000n], // textured-disks
      [3, 0n, 500_000n], //   filaments
      [4, 0n, 4_000_000n], // scalar-volume
      [5, 0n, 600_000n], //   milky-way
      [6, 0n, 100_000n], //   tone-map
      [7, 0n, 100_000n], //   ui-overlay
      [8, 0n, 200_000n], //   pick
    ]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.get('point-sprites')).toBeCloseTo(1.0, 6);
    expect(out.get('procedural-disks')).toBeCloseTo(2.0, 6);
    expect(out.get('textured-disks')).toBeCloseTo(3.0, 6);
    expect(out.get('filaments')).toBeCloseTo(0.5, 6);
    expect(out.get('scalar-volume')).toBeCloseTo(4.0, 6);
    expect(out.get('milky-way')).toBeCloseTo(0.6, 6);
    expect(out.get('tone-map')).toBeCloseTo(0.1, 6);
    expect(out.get('ui-overlay')).toBeCloseTo(0.1, 6);
    expect(out.get('pick')).toBeCloseTo(0.2, 6);
  });
});
