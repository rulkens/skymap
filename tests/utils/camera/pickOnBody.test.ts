import { describe, it, expect } from 'vitest';

import { pickOnBody } from '../../../src/utils/camera/pickOnBody';

describe('pickOnBody', () => {
  it('rejects a ray whose only intersection lies behind the origin', () => {
    // Eye outside the sphere, looking directly AWAY from it: both
    // ray-sphere roots are negative (the sphere is a mathematical hit only
    // for the backward extension of the ray), which is a miss for a pick.
    const pick = pickOnBody({ originM: [0, 0, 3], dir: [0, 0, 1] }, 1);
    expect(pick).toBeNull();
  });

  it('accepts the near root ahead of the eye', () => {
    const pick = pickOnBody({ originM: [0, 0, 3], dir: [0, 0, -1] }, 1);
    expect(pick).not.toBeNull();
    expect(pick?.pointM[2]).toBeCloseTo(1, 12);
  });
});
