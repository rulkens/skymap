// 1920 lands on the JPEG's LONG edge: a `min`-for-`max` slip would rescale every
// focal length by the short one. The two cases are one frame, transposed.
import { describe, expect, it } from 'vitest';

import { skraafotoDownsampleScale } from '../../../../tools/utils/skraafoto/skraafotoDownsampleScale';

describe('skraafotoDownsampleScale', () => {
  it('drives the long edge to 1920 whichever axis it is', () => {
    expect(skraafotoDownsampleScale([14144, 10560])).toBe(1920 / 14144);
    expect(skraafotoDownsampleScale([10560, 14144])).toBe(1920 / 14144);
  });
});
