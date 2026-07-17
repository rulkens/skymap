import { describe, it, expect } from 'vitest';
import { near0RingRadiusPx } from '../../../../src/services/engine/helpers/near0RingRadiusPx';

// The NEAR0 halo px math: `max(farFloor, 1.5 × apparentRadiusPx)`, where the
// far floor is the SAME fixed-px dot the galaxy helper produces at radius 0
// (`pointSizePx · 6`). These cases pin the two regimes and the exact 1.5×
// factor — a bug that reintroduced the galaxy helper's ×3 net factor (or lost
// the floor) would fail here where no compiler check would.
describe('near0RingRadiusPx', () => {
  it('holds at the fixed-px floor when the sphere is sub-pixel far away', () => {
    // A Sun-radius (~2.06e-16 Mpc) star at 1 Mpc: apparentRadiusPx ≈ 0, so the
    // floor pointSizePx(4) · 6 = 24 wins.
    const radiusMpc = 2.06e-16;
    expect(near0RingRadiusPx(radiusMpc, 1, 720, 4)).toBeCloseTo(24, 6);
  });

  it('tracks 1.5× the apparent radius once the sphere resolves past the floor', () => {
    // Choose radius/dist so apparentRadiusPx = 100 px:
    // (radiusMpc / camDist) * pxPerRad = 100 → radiusMpc/camDist = 100/720.
    const camDist = 0.72;
    const radiusMpc = (100 / 720) * camDist;
    // apparentRadiusPx = 100; 1.5 × 100 = 150 > floor (24).
    expect(near0RingRadiusPx(radiusMpc, camDist, 720, 4)).toBeCloseTo(150, 4);
  });

  it('grows as the camera approaches while both distances resolve past the floor', () => {
    const radiusMpc = 0.01;
    const floor = 4 * 6;
    // far: apparent = (0.01/0.1)*720 = 72; 1.5× = 108.
    const far = near0RingRadiusPx(radiusMpc, 0.1, 720, 4);
    // near: apparent = (0.01/0.05)*720 = 144; 1.5× = 216.
    const near = near0RingRadiusPx(radiusMpc, 0.05, 720, 4);
    expect(far).toBeCloseTo(108, 4);
    expect(near).toBeCloseTo(216, 4);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(floor);
  });
});
