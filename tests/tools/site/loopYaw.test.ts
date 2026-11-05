import { describe, expect, it } from 'vitest';

import { loopYaw } from '../../../tools/site/utils/loopYaw';

// The frame after the last is the first again: that is the whole of a seamless loop.
describe('loopYaw', () => {
  it('an orbit ends one whole turn from where it began', () => {
    expect(loopYaw('orbit', 0)).toBe(0);
    expect(loopYaw('orbit', 1)).toBeCloseTo(2 * Math.PI);
  });

  it('a sway reaches its angle on each side and comes back', () => {
    const sway = { swayDeg: 10 };
    expect(loopYaw(sway, 0.25)).toBeCloseTo((10 * Math.PI) / 180);
    expect(loopYaw(sway, 0.75)).toBeCloseTo((-10 * Math.PI) / 180);
    expect(loopYaw(sway, 1)).toBeCloseTo(loopYaw(sway, 0));
  });
});
