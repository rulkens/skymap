import { describe, expect, it } from 'vitest';

import { frustumCornerMagnification } from '../../../src/utils/camera/frustumCornerMagnification';

describe('frustumCornerMagnification', () => {
  it('reads the farther edge on each axis of an off-centre frustum', () => {
    // Bug caught: a signed or left/down-only read, which under-reaches the
    // wide side of an asymmetric (dome or headset) frustum.
    const frustum = { tanLeft: -0.5, tanRight: 2, tanDown: -1.5, tanUp: 0.25 };
    expect(frustumCornerMagnification(frustum)).toBeCloseTo(1 + 4 + 2.25, 12);
  });
});
