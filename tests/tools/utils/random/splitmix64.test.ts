import { describe, expect, it } from 'vitest';

import { splitmix64 } from '../../../../tools/utils/random/splitmix64';

/**
 * splitmix64 is used as the star-taper's identity hash, and the parallel Rust
 * builder must produce bit-identical values. A single reference known-answer
 * vector pins the exact schedule (constants + shift/xor/multiply order): if the
 * BigInt masking or any constant drifts, this vector changes. The value is the
 * canonical `splitmix64(0)` from the reference implementation.
 */
describe('splitmix64', () => {
  it('matches the reference known-answer vector', () => {
    expect(splitmix64(0n)).toBe(0xe220a8397b1dcdafn);
  });
});
