import { describe, expect, it } from 'vitest';

import { clockLoopYaw } from '../../../tools/site/utils/clockLoopYaw';

describe('clockLoopYaw', () => {
  it('leaves a camera alone when the film has no camera motion', () => {
    expect(clockLoopYaw({}, 0.3)).toBe(0);
  });

  it('a sway on a running clock comes back to where it began, so the loop has no seam', () => {
    const film = { swayDeg: 6 };
    expect(clockLoopYaw(film, 0.25)).toBeCloseTo((6 * Math.PI) / 180);
    expect(clockLoopYaw(film, 1)).toBeCloseTo(clockLoopYaw(film, 0));
  });

  it('adds whole turns to a sway', () => {
    expect(clockLoopYaw({ orbitTurns: 1, swayDeg: 6 }, 0.25)).toBeCloseTo(
      Math.PI / 2 + (6 * Math.PI) / 180,
    );
  });
});
