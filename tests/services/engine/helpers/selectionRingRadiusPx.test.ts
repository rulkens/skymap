import { describe, it, expect } from 'vitest';
import { selectionRingRadiusPx } from '../../../../src/services/engine/helpers/selectionRingRadiusPx';

// The shared apparent-px formula behind BOTH the selection ring and the
// Milky-Way pick billboard.  These cases pin the exact math the
// selectionRingPass tests already assert (so the extraction stays
// behaviour-identical) plus the two invariants the pick path relies on:
// the radius grows as the camera approaches, and it never drops below the
// point-size floor.
describe('selectionRingRadiusPx', () => {
  it('matches the galaxy ring case (60 kpc galaxy at 100 Mpc, floor wins)', () => {
    // radiusMpc = 60 * 2 / 1000 = 0.12
    // apparentPxRadius = (0.12 / 100) * 720 = 0.864; * 0.5 = 0.432
    // pointSizePx (4) wins; * RING_SIZE_SCALE (6) = 24
    expect(selectionRingRadiusPx(0.12, 100, 720, 4)).toBeCloseTo(24, 5);
  });

  it('matches the galaxy ring case where the apparent radius dominates', () => {
    // Same galaxy at 10 Mpc:
    // apparentPxRadius = (0.12 / 10) * 720 = 8.64; * 0.5 = 4.32 > 4
    // * 6 = 25.92
    expect(selectionRingRadiusPx(0.12, 10, 720, 4)).toBeCloseTo(25.92, 4);
  });

  it('grows monotonically as the camera gets closer', () => {
    const far = selectionRingRadiusPx(0.025, 1.0, 720, 4);
    const near = selectionRingRadiusPx(0.025, 0.1, 720, 4);
    const nearer = selectionRingRadiusPx(0.025, 0.05, 720, 4);
    expect(near).toBeGreaterThan(far);
    expect(nearer).toBeGreaterThan(near);
  });

  it('never drops below the point-size floor (pointSizePx * RING_SIZE_SCALE)', () => {
    const pointSizePx = 3;
    const floor = pointSizePx * 6;
    // A vanishingly small / very distant target: apparent radius → 0.
    expect(selectionRingRadiusPx(0.025, 1e6, 720, pointSizePx)).toBeCloseTo(floor, 5);
    // Even at camDist 0 the result is finite (safeDist clamp) and >= floor.
    expect(selectionRingRadiusPx(0.025, 0, 720, pointSizePx)).toBeGreaterThanOrEqual(floor);
  });
});
