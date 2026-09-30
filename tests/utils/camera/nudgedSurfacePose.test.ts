import { describe, it, expect } from 'vitest';

import { nudgedSurfacePose } from '../../../src/utils/camera/nudgedSurfacePose';
import { surfaceStep } from '../../../src/services/camera/surfaceStep';
import { canonicalBasisAt } from '../../../src/utils/camera/canonicalBasisAt';
import { eyeFrameOf } from '../../../src/utils/camera/eyeFrameOf';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../src/data/camera/cameraTuning';
import { EMPTY_TILT_MEMORY } from '../../../src/data/camera/emptyTiltMemory';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { SurfaceStepCtx } from '../../../src/@types/camera/SurfaceStepCtx';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 1;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const POLE: Vec3 = [0, 0, 1];
const CTX: SurfaceStepCtx = {
  viewportPx: VIEWPORT,
  fovYRad: FOV,
  bodyRadiusM: R,
  standoffRadii: SURFACE_STANDOFF_RADII,
  groundRadiusAtM: () => R,
  innerBoundRadiusM: R * (1 - 1e-6),
  outerBoundRadiusM: R * (1 + 1e-6),
  sceneUpLocal: POLE,
  focusPivotM: null,
  tuning: TUNING,
};

/** Mid-latitude, oblique and headed off north, so the level settle has work to do. */
const seed: BodyFixedPose = {
  bodyId: 'earth',
  anchorLocalM: [0, 0, 0],
  eyeRelAnchorM: [0.6, -1.2, 1.4],
  basisLocal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};
const POSE: BodyFixedPose = {
  ...seed,
  basisLocal: canonicalBasisAt(eyeFrameOf(seed, 1, POLE)!, 0.7, 0.5),
};

const col = (m: Mat3, i: number): Vec3 => [m[3 * i]!, m[3 * i + 1]!, m[3 * i + 2]!];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('nudgedSurfacePose', () => {
  it('body nudge orbit equals the equivalent orbit-mode drag', () => {
    const [dx, dy] = [10, -6];
    const dragged = surfaceStep(
      { gesture: { mode: 'orbit', anchorRadiusM: R, anchorLocalM: null, prevPixel: [50, 50] } },
      EMPTY_TILT_MEMORY,
      POSE,
      { kind: 'drag', mode: 'orbit', startPx: [50, 50], endPx: [50 + dx, 50 + dy] },
      CTX,
    );
    const k = FOV / VIEWPORT[1];
    const nudged = nudgedSurfacePose(POSE, EMPTY_TILT_MEMORY, { orbit: [dx * k, dy * k] }, CTX);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(nudged.pose.eyeRelAnchorM[i]! - dragged.pose.eyeRelAnchorM[i]!)).toBeLessThan(
        1e-9,
      );
    }
    for (let i = 0; i < 9; i++) {
      expect(Math.abs(nudged.pose.basisLocal[i]! - dragged.pose.basisLocal[i]!)).toBeLessThan(1e-9);
    }
  });

  it('body nudge roll keeps basisLocal orthonormal and survives the settle', () => {
    const { pose } = nudgedSurfacePose(POSE, EMPTY_TILT_MEMORY, { roll: 0.2 }, CTX);
    const b = pose.basisLocal;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(Math.abs(dot(col(b, i), col(b, j)) - (i === j ? 1 : 0))).toBeLessThan(1e-12);
      }
    }
    // The image roll, read off the new up in the pre-pose's right | up plane.
    const up = col(b, 1);
    const roll = Math.atan2(-dot(up, col(POSE.basisLocal, 0)), dot(up, col(POSE.basisLocal, 1)));
    expect(Math.abs(roll - 0.2)).toBeLessThan(1e-9);
  });

  it('an empty delta returns the pose by reference', () => {
    expect(nudgedSurfacePose(POSE, EMPTY_TILT_MEMORY, {}, CTX).pose).toBe(POSE);
  });
});
