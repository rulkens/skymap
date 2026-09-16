import { describe, it, expect } from 'vitest';

import { bodyFixedEyeM } from '../../../src/utils/camera/bodyFixedEyeM';
import { flooredBodyPose } from '../../../src/utils/camera/flooredBodyPose';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('flooredBodyPose', () => {
  it('leaves an eye exactly at the centre alone rather than dividing by zero', () => {
    // The push direction is undefined at the centre; the guard against
    // `scale = floorM / 0` is what keeps this NaN-free rather than merely
    // "usually works".
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 0],
      basisLocal: IDENTITY,
    };
    const out = flooredBodyPose(pose, () => 1, SURFACE_STANDOFF_RADII, null);
    expect(out).toBe(pose);
  });

  it('pushes an eye below the floor out to the floor radius', () => {
    // Anchored on the surface, eye below the floor relative to it: the floor is
    // on |anchor + eyeRelAnchor|, so an implementation flooring `eyeRelAnchorM`
    // alone would push the eye to 2.4e-6 of the centre here instead.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 1],
      eyeRelAnchorM: [0, 0, -0.5],
      basisLocal: IDENTITY,
    };
    const out = flooredBodyPose(pose, () => 1, SURFACE_STANDOFF_RADII, null);
    // Exactly the floor radius, not merely "further out": a push that
    // overshoots or undershoots is the bug this guards.
    expect(Math.hypot(...bodyFixedEyeM(out))).toBeCloseTo(
      surfaceFloorM(1, SURFACE_STANDOFF_RADII),
      12,
    );
  });

  it('lifts about a served point without letting it leave the sightline', () => {
    // The hand-back case: the eye arrives below the arm's floor with a rover
    // centred. The radial push reaches the same floor but slides the rover
    // 5e-2 rad off the sightline, and the settle then pivots about a point the
    // eye no longer looks at — which is what walked the rover off screen.
    const R = 1000;
    const STANDOFF = 1.01;
    const pivot: Vec3 = [0, 0, R];
    const eye: Vec3 = [0, 100, R];
    const forward: Vec3 = [0, -1, 0];
    const { right, up } = imagePlaneBasis(forward, 0, [0, 0, 1]);
    const pose: BodyFixedPose = {
      bodyId: 'planet',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: eye,
      basisLocal: mat3FromColumns(right as Vec3, up as Vec3, forward),
    };

    const out = flooredBodyPose(pose, () => R, STANDOFF, pivot);
    const lifted = bodyFixedEyeM(out);
    expect(Math.hypot(...lifted)).toBeCloseTo(surfaceFloorM(R, STANDOFF), 9);
    // Constant range about the pivot — the lift is a turn, not a push.
    expect(
      Math.hypot(lifted[0] - pivot[0], lifted[1] - pivot[1], lifted[2] - pivot[2]),
    ).toBeCloseTo(100, 9);
    const b = out.basisLocal;
    const toPivot = normalize3([pivot[0] - lifted[0], pivot[1] - lifted[1], pivot[2] - lifted[2]]);
    expect(b[6] * toPivot[0] + b[7] * toPivot[1] + b[8] * toPivot[2]).toBeCloseTo(1, 12);
  });
});
