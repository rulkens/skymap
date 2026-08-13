/**
 * mipLevelCount3d — the 3-argument generalisation of `mipLevelCount`
 * (`generateMipChain.ts`): `floor(log2(max(w,h,d))) + 1`. Pinned with
 * hand-computed values, per `testing.md` — computing the expectation via
 * `Math.log2` in the test would just mirror the implementation.
 */

import { describe, it, expect } from 'vitest';
import { mipLevelCount3d } from '../../../../src/services/gpu/lib/generateMipChain3d';

describe('mipLevelCount3d', () => {
  it('returns 9 for 178x300x182', () => {
    // floor(log2(300)) + 1 = floor(8.229...) + 1 = 9 — driven by the largest
    // axis (height), not width or depth.
    expect(mipLevelCount3d(178, 300, 182)).toBe(9);
  });

  it('returns 4 for an asymmetric small case, 3x11x2', () => {
    // floor(log2(11)) + 1 = floor(3.459...) + 1 = 4 — the largest axis is the
    // middle argument, exercising that the max isn't accidentally taken over
    // just the first/last argument.
    expect(mipLevelCount3d(3, 11, 2)).toBe(4);
  });

  it('returns 1 for a single-voxel cube (nothing to downsample)', () => {
    expect(mipLevelCount3d(1, 1, 1)).toBe(1);
  });
});
