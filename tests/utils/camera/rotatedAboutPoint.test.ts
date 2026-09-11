import { describe, it, expect } from 'vitest';

import { rotatedAboutPoint } from '../../../src/utils/camera/rotatedAboutPoint';
import { quatFromAxisAngle } from '../../../src/utils/math/quatFromAxisAngle';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('rotatedAboutPoint', () => {
  it('preserves the eye-to-pivot distance under any rotation', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [1, 0, 0],
      eyeRelAnchorM: [1, 0, 0], // eye at [2, 0, 0]
      basisLocal: IDENTITY,
    };
    const pivotM: [number, number, number] = [0, 0, 0];
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    const out = rotatedAboutPoint(pose, q, pivotM);
    const eyeOut: [number, number, number] = [
      out.anchorLocalM[0] + out.eyeRelAnchorM[0],
      out.anchorLocalM[1] + out.eyeRelAnchorM[1],
      out.anchorLocalM[2] + out.eyeRelAnchorM[2],
    ];
    expect(Math.hypot(...eyeOut)).toBeCloseTo(2, 12);
  });

  it('leaves the anchor itself untouched — only the eye orbits the pivot', () => {
    // This is what distinguishes it from anchoredDragRotation's whole-pose
    // rotation: a caller reaching for the wrong one would silently drag the
    // anchor along too.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [1, 0, 0],
      eyeRelAnchorM: [1, 0, 0],
      basisLocal: IDENTITY,
    };
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 2);
    const out = rotatedAboutPoint(pose, q, [0, 0, 0]);
    expect(out.anchorLocalM).toEqual(pose.anchorLocalM);
  });
});
