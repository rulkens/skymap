import { describe, expect, it } from 'vitest';

import { poseMismatch } from '../../../../tools/utils/capture/poseMismatch';

describe('poseMismatch', () => {
  it('treats a yaw a full turn away as a match', () => {
    const yaw = 3.8408163993487223;
    expect(
      poseMismatch(
        { yaw, pitch: 0, distance: 1 },
        { yaw: yaw - 2 * Math.PI, pitch: 0, distance: 1 },
      ),
    ).toEqual([]);
  });

  it('catches a sub-metre distance mismatch by relative error', () => {
    expect(
      poseMismatch(
        { yaw: 0, pitch: 0, distance: 6.55e-22 },
        { yaw: 0, pitch: 0, distance: 7.0e-22 },
      ),
    ).toEqual(['distance']);
    expect(
      poseMismatch(
        { yaw: 0, pitch: 0, distance: 6.55e-22 },
        { yaw: 0, pitch: 0, distance: 6.5503e-22 },
      ),
    ).toEqual([]);
  });

  it('reports pitch outside tolerance', () => {
    expect(
      poseMismatch({ yaw: 0, pitch: 0.0992, distance: 1 }, { yaw: 0, pitch: 0.11, distance: 1 }),
    ).toEqual(['pitch']);
  });
});
