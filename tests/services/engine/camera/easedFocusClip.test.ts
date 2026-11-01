import { describe, it, expect } from 'vitest';
import { easedFocusClip } from '../../../../src/services/engine/camera/easedFocusClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';

describe('easedFocusClip', () => {
  it('honours motion.ease', () => {
    const pose = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0 };
    const data = easedFocusClip({
      from: { ...pose, distance: 10 },
      to: { ...pose, distance: 1000 },
      motion: { style: 'eased', durationMs: 1000, ease: 'linear' },
      frame: 'equatorial',
    });
    expect(evaluateClip(data, 0.5).distance).toBeCloseTo(505, 9);
  });
});
