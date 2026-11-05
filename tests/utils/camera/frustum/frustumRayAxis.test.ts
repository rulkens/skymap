import { describe, it, expect } from 'vitest';

import { frustumRayAxis } from '../../../../src/utils/camera/frustum/frustumRayAxis';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const S = Math.SQRT1_2;
// Off the world axes, so a swapped term can't hide behind a zero component.
const FORWARD: Vec3 = [S, 0, -S];
const RIGHT: Vec3 = [S, 0, S];
const UP: Vec3 = [0, 1, 0];

describe('frustumRayAxis', () => {
  it('tilts toward the shifted window centre', () => {
    const frustum = { tanLeft: -0.5, tanRight: 1.5, tanDown: -1, tanUp: 1 };
    const out = frustumRayAxis(FORWARD, RIGHT, UP, frustum, [0, 0, 0]);
    out.forEach((v, i) => expect(v).toBeCloseTo(FORWARD[i]! + 0.5 * RIGHT[i]!, 12));
  });
});
