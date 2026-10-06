/**
 * The follow is what turns a stepping wheel into a gliding picture. If it
 * overshoots, the film runs backwards for a moment after every scroll; if its
 * step is not exact, a slow frame makes it explode.
 */
import { describe, expect, it } from 'vitest';

import { followDamped } from '../../../packages/website/src/utils/followDamped';

describe('followDamped', () => {
  it('reaches a stepped target without ever passing it, whatever the frame time', () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 10, 2]) {
      let state = { value: 0, velocity: 0 };
      let last = 0;
      for (let t = 0; t < 3; t += dt) {
        state = followDamped(state.value, state.velocity, 1, 14, dt);
        expect(state.value).toBeGreaterThanOrEqual(last);
        expect(state.value).toBeLessThanOrEqual(1);
        last = state.value;
      }
      expect(state.value).toBeCloseTo(1, 6);
    }
  });

  it('starts from rest: the first frame after a step moves far less than a plain ease would', () => {
    const { value } = followDamped(0, 0, 1, 14, 1 / 60);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.03);
  });
});
