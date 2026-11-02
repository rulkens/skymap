import { describe, expect, it } from 'vitest';

import { easedShiftNdc } from '../../../src/utils/camera/easedShiftNdc';

describe('easedShiftNdc', () => {
  it('snaps from null, approaches with τ = 80 ms, and stays continuous when the target jumps mid-ease', () => {
    expect(easedShiftNdc(null, [0.2, -0.1], 16)).toEqual([0.2, -0.1]);

    const one = easedShiftNdc([0, 0], [0, 0.2], 16);
    expect(one[1]).toBeCloseTo(0.2 * (1 - Math.exp(-16 / 80)), 12);

    // A rotation flips the target mid-ease: the next frame moves one step from
    // where the shift is, never a jump to the new target.
    const flipped = easedShiftNdc(one, [-0.25, 0], 16);
    const k = 1 - Math.exp(-16 / 80);
    expect(flipped[0]).toBeCloseTo(-0.25 * k, 12);
    expect(flipped[1]).toBeCloseTo(one[1] * (1 - k), 12);
  });

  it('lands on the target exactly once inside 1e-4, and an idle gap does not finish the ease', () => {
    expect(easedShiftNdc([0, 0.19995], [0, 0.2], 16)).toEqual([0, 0.2]);
    const woken = easedShiftNdc([0, 0], [0, 0.2], 5000);
    expect(woken[1]).toBeLessThan(0.1);
  });
});
