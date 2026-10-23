import { describe, it, expect } from 'vitest';

import { nudgedSurfacePose } from '../../../src/utils/camera/nudgedSurfacePose';
import { surfaceStep } from '../../../src/services/camera/surfaceStep';
import { canonicalBasisAt } from '../../../src/utils/camera/canonicalBasisAt';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
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
    // The world arm's roll convention, so a cross-arm sign slip fails here.
    const expected = imagePlaneBasis(col(POSE.basisLocal, 2), 0.2, col(POSE.basisLocal, 1)).up;
    for (let i = 0; i < 3; i++) expect(Math.abs(col(b, 1)[i]! - expected[i]!)).toBeLessThan(1e-9);
  });

  it('body nudge look+roll still writes tilt memory', () => {
    // Inside the tilt band (h/R 0.03 < tiltFullHR), where a look authors tilt.
    const [x, y, z] = POSE.eyeRelAnchorM;
    const k = 1.03 / Math.hypot(x, y, z);
    const low: BodyFixedPose = { ...POSE, eyeRelAnchorM: [x * k, y * k, z * k] };
    const looked = nudgedSurfacePose(low, EMPTY_TILT_MEMORY, { look: [0, 0.1] }, CTX);
    const rolled = nudgedSurfacePose(low, EMPTY_TILT_MEMORY, { look: [0, 0.1], roll: 0.2 }, CTX);
    expect(looked.tilt.rememberedTiltRad).not.toBe(EMPTY_TILT_MEMORY.rememberedTiltRad);
    expect(rolled.tilt.rememberedTiltRad).toBe(looked.tilt.rememberedTiltRad);
  });

  it('a body orbit nudge slows with altitude, so the ground tracks the drag', () => {
    const angleBetween = (a: Vec3, b: Vec3) =>
      Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)));
    const eyeOf = (p: BodyFixedPose): Vec3 => [
      p.anchorLocalM[0] + p.eyeRelAnchorM[0],
      p.anchorLocalM[1] + p.eyeRelAnchorM[1],
      p.anchorLocalM[2] + p.eyeRelAnchorM[2],
    ];
    const swept = (h: number) => {
      const low: BodyFixedPose = { ...seed, eyeRelAnchorM: [R + h, 0, 0] };
      const pose: BodyFixedPose = {
        ...low,
        basisLocal: canonicalBasisAt(eyeFrameOf(low, 1, POLE)!, 0.3, 0.2),
      };
      const nudged = nudgedSurfacePose(pose, EMPTY_TILT_MEMORY, { orbit: [0.1, 0] }, CTX);
      return angleBetween(eyeOf(pose), eyeOf(nudged.pose));
    };
    // Ground under the eye moves ~θ·h for a screen angle θ (2·tan(fov/2)/fov = 4/π here),
    // so the sweep about the centre is ~θ·h/R — not θ, which would cross the planet.
    expect(swept(0.001)).toBeLessThan(0.1 * 0.001 * 2);
    expect(swept(0.001)).toBeGreaterThan(0);
    expect(swept(0.01) / swept(0.001)).toBeCloseTo(10, 0);
  });

  it('an empty delta returns the pose by reference', () => {
    expect(nudgedSurfacePose(POSE, EMPTY_TILT_MEMORY, {}, CTX).pose).toBe(POSE);
  });
});
