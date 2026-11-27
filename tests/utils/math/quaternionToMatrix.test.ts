import { describe, it, expect } from 'vitest';
import { quaternionToMatrix } from '../../../src/utils/math/quaternionToMatrix';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../src/data/orientation/orientationFrames';

describe('quaternionToMatrix', () => {
  it('turns each orientation frame quaternion back into its basis, column-major', () => {
    for (const frame of ['equatorial', 'ecliptic', 'galactic', 'supergalactic'] as const) {
      const m = quaternionToMatrix(ORIENTATION_FRAME_QUATERNIONS[frame]);
      m.forEach((cell, i) => expect(cell).toBeCloseTo(ORIENTATION_FRAMES[frame][i]!, 6));
    }
  });
});
