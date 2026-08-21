import { describe, expect, it } from 'vitest';
import { orbitDragDelta } from '../../../../tools/utils/camera/orbitDragDelta';

describe('orbitDragDelta', () => {
  it('scales pointer-delta pixels by the drag speed, sign-preserved on both axes', () => {
    expect(orbitDragDelta(10, -20, 0.005)).toEqual({ dYaw: 0.05, dPitch: -0.1 });
  });

  it('is zero for a zero pointer delta regardless of speed', () => {
    expect(orbitDragDelta(0, 0, 0.006)).toEqual({ dYaw: 0, dPitch: 0 });
  });
});
