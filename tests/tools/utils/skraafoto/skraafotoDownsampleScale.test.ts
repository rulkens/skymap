/**
 * The scale is the contract between the harvested JPEG's pixel size and the
 * pose intrinsics that describe it, so what matters is that `proj:shape` is
 * read as [rows, cols] and the LONGER edge lands on 1920 — a transposed read
 * silently mis-scales every focal length on a non-square frame.
 */
import { describe, expect, it } from 'vitest';

import { skraafotoDownsampleScale } from '../../../../tools/utils/skraafoto/skraafotoDownsampleScale';

describe('skraafotoDownsampleScale', () => {
  it('drives the long edge to 1920 whichever axis it is', () => {
    // Portrait ([rows, cols]) and landscape, same numbers transposed.
    expect(skraafotoDownsampleScale([14144, 10560])).toBe(1920 / 14144);
    expect(skraafotoDownsampleScale([10560, 14144])).toBe(1920 / 14144);
  });

  it('handles a square frame', () => {
    expect(skraafotoDownsampleScale([4096, 4096])).toBe(1920 / 4096);
  });
});
