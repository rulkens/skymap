/**
 * poseFrameConversion — the world arm ↔ body arm round-trip (spec §5.1).
 *
 * Every fixture is a hand-built `CameraPose`; the world eye/forward/screen-up
 * each pose denotes is re-derived HERE with hand-rolled trig plus the shared
 * `imagePlaneBasis`/`frameUp` seam (the derivation `frameContext` runs), never
 * with the functions under test. So a round-trip that silently re-invented the
 * orbit convention — a transposed basis, a flipped roll sign — fails here even
 * though its own two halves would agree with each other.
 */

import { describe, it, expect } from 'vitest';

import { toBodyArm, toWorldArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { updatePosition } from '../../../../src/utils/camera/updatePosition';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { rotXMat3 } from '../../../../src/utils/math/rotXMat3';
import { rotYMat3 } from '../../../../src/utils/math/rotYMat3';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';

// Provider A's floor: the world arm stores the eye as `target + distance·dir`
// in Mpc at heliocentric magnitude, where one f64 ulp ≈ 25 µm. The conversion's
// own error is ~1 nm (measured), so these bounds sit above the GRID, not above
// the arithmetic — a component whose true value straddles a grid step is the
// only way to spend them, and a real inversion error blows past them.
const EYE_FLOOR_M = 5e-5;
// Directions are unit-magnitude and grid-free, so their bound is the eye bound
// above divided by the shortest eye-to-target range in the fixtures (~1e6 m):
// 5e-11, doubled for headroom. Measured error is 7e-13.
const DIR_FLOOR = 1e-10;

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const EARTH_RADIUS_M = 6.371e6;
const MOON_RADIUS_M = 1.7374e6;

const m = (metres: number): number => metres * SCALE_UNITS.M_TO_MPC;
const AU = SCALE_UNITS.AU_TO_MPC;

function bodyState(positionMpc: Vec3, orientation: Mat3): BodyState {
  return { positionMpc, orientation, meanAnomalyRad: 0 };
}

/**
 * The world eye, view direction and screen-up a `CameraPose` denotes, derived
 * independently of the module under test: the orbit convention's spherical
 * decode (`yawPitchToDir`'s formula, written out), rotated into world by
 * `poseBasis`, then the renderer's own image-plane basis over `upBasis`.
 */
function worldPoseOf(
  pose: CameraPose,
  poseBasis: Mat3,
  upBasis: Mat3,
): { eye: Vec3; right: Vec3; up: Vec3; forward: Vec3 } {
  const cp = Math.cos(pose.pitch);
  const dirLocal: Vec3 = [cp * Math.sin(pose.yaw), Math.sin(pose.pitch), cp * Math.cos(pose.yaw)];
  // Column-major tight Mat3: column c occupies indices c*3 .. c*3+2.
  const dirWorld: Vec3 = [
    poseBasis[0] * dirLocal[0] + poseBasis[3] * dirLocal[1] + poseBasis[6] * dirLocal[2],
    poseBasis[1] * dirLocal[0] + poseBasis[4] * dirLocal[1] + poseBasis[7] * dirLocal[2],
    poseBasis[2] * dirLocal[0] + poseBasis[5] * dirLocal[1] + poseBasis[8] * dirLocal[2],
  ];
  const eye: Vec3 = [
    pose.target[0] + dirWorld[0] * pose.distance,
    pose.target[1] + dirWorld[1] * pose.distance,
    pose.target[2] + dirWorld[2] * pose.distance,
  ];
  const aim: Vec3 = [pose.target[0] - eye[0], pose.target[1] - eye[1], pose.target[2] - eye[2]];
  const len = Math.hypot(aim[0], aim[1], aim[2]) || 1;
  const forward: Vec3 = [aim[0] / len, aim[1] / len, aim[2] / len];
  const { right, up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(upBasis));
  return { eye, right, up, forward };
}

// The eye in body-fixed-adjacent metres: subtract the shared heliocentric
// magnitude in Mpc FIRST, exactly as provider A does, so the comparison floor
// is the conversion's error and not the subtraction's.
function eyeRelM(eyeMpc: Vec3, bodyPosMpc: Vec3): Vec3 {
  return [
    (eyeMpc[0] - bodyPosMpc[0]) * SCALE_UNITS.MPC_TO_M,
    (eyeMpc[1] - bodyPosMpc[1]) * SCALE_UNITS.MPC_TO_M,
    (eyeMpc[2] - bodyPosMpc[2]) * SCALE_UNITS.MPC_TO_M,
  ];
}

function expectVec3Near(actual: Vec3, expected: Vec3, tol: number, label: string): void {
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(actual[i]! - expected[i]!), `${label} component ${i}`).toBeLessThan(tol);
  }
}

type Fixture = {
  readonly bodyId: BodyId;
  readonly positionMpc: Vec3;
  readonly orientation: Mat3;
  readonly poseBasis: Mat3;
  readonly upBasis: Mat3;
  readonly radiusM: number;
  readonly pose: CameraPose;
};

// A real (non-identity) rotation: composing two axis rotations exercises every
// matrix element, unlike a single-axis rotation which leaves a row/column at 0/1.
const TILTED_POLE: Mat3 = multiply3x3(rotYMat3(0.6), rotXMat3(0.35));
// `poseBasis` and `upBasis` differ mid-slerp (OrbitCameraInit), so the fixtures
// keep them distinct — a conversion that read one for the other passes with
// equal bases and fails here.
const POSE_FRAME: Mat3 = multiply3x3(rotYMat3(-1.1), rotXMat3(0.9));
const UP_FRAME: Mat3 = multiply3x3(rotYMat3(-1.05), rotXMat3(0.85));

// Each pose's target sits INSIDE the body (offset ≪ radius) and its distance
// puts the eye well outside it, so the screen-centre ray genuinely hits the
// sphere — the case the tilt ceiling leaves reachable at the disengage
// boundary, and the only one in which an orbit pose can carry the forward axis.
const FIXTURES: readonly Fixture[] = [
  {
    bodyId: 'earth',
    positionMpc: [AU, 0, 0],
    orientation: IDENTITY,
    poseBasis: IDENTITY,
    upBasis: IDENTITY,
    radiusM: EARTH_RADIUS_M,
    pose: {
      target: [AU + m(0.9e6), m(-1.0e6), m(0.4e6)],
      yaw: 0.9,
      pitch: 0.4,
      distance: m(9.0e6),
    },
  },
  {
    bodyId: 'earth',
    positionMpc: [0.6 * AU, 0.8 * AU, 0.1 * AU],
    orientation: TILTED_POLE,
    poseBasis: POSE_FRAME,
    upBasis: UP_FRAME,
    radiusM: EARTH_RADIUS_M,
    pose: {
      target: [0.6 * AU + m(1.2e6), 0.8 * AU - m(0.8e6), 0.1 * AU + m(1.1e6)],
      yaw: -2.2,
      pitch: -0.55,
      distance: m(1.1e7),
    },
  },
  {
    bodyId: 'earth',
    positionMpc: [0.6 * AU, 0.8 * AU, 0.1 * AU],
    orientation: TILTED_POLE,
    poseBasis: POSE_FRAME,
    upBasis: UP_FRAME,
    radiusM: EARTH_RADIUS_M,
    pose: {
      target: [0.6 * AU + m(1.2e6), 0.8 * AU - m(0.8e6), 0.1 * AU + m(1.1e6)],
      yaw: 1.4,
      pitch: 0.2,
      distance: m(1.1e7),
      // §12-R1: at nadir the heading has nowhere to go but screen roll, so the
      // world arm must carry it — a conversion that dropped `roll` fails here.
      roll: 0.8,
    },
  },
  {
    // Nothing is Earth-typed: the same conversion at a moon's radius. The id is
    // carried, never interpreted, so any registry body id serves.
    bodyId: 'planet',
    positionMpc: [AU, m(3.8e8), 0],
    orientation: TILTED_POLE,
    poseBasis: POSE_FRAME,
    upBasis: UP_FRAME,
    radiusM: MOON_RADIUS_M,
    pose: {
      target: [AU + m(0.3e6), m(3.8e8) - m(0.2e6), m(0.1e6)],
      yaw: 2.9,
      pitch: -1.1,
      distance: m(2.6e6),
    },
  },
];

const LABELS = [
  'over Earth',
  'over a body with a tilted pole and a non-identity orientation',
  'a rolled pose',
  "at a moon's radius",
];

describe('poseFrameConversion', () => {
  it.each(FIXTURES.map((f, i) => [LABELS[i]!, f] as const))(
    'toWorldArm(toBodyArm(pose)) round-trips eye, forward and screen-up — %s',
    (label, f) => {
      const arm = toBodyArm(
        f.pose,
        f.poseBasis,
        f.upBasis,
        f.bodyId,
        bodyState(f.positionMpc, f.orientation),
      );
      const back = toWorldArm(
        arm,
        bodyState(f.positionMpc, f.orientation),
        f.poseBasis,
        f.upBasis,
        f.radiusM,
      );

      const before = worldPoseOf(f.pose, f.poseBasis, f.upBasis);
      const after = worldPoseOf(back, f.poseBasis, f.upBasis);

      expectVec3Near(
        eyeRelM(after.eye, f.positionMpc),
        eyeRelM(before.eye, f.positionMpc),
        EYE_FLOOR_M,
        `${label} eye`,
      );
      expectVec3Near(after.forward, before.forward, DIR_FLOOR, `${label} forward`);
      expectVec3Near(after.up, before.up, DIR_FLOOR, `${label} screen-up`);
    },
  );

  it.each(FIXTURES.map((f, i) => [LABELS[i]!, f] as const))(
    'toWorldArm targets the NEAR surface point under the screen centre — %s',
    (label, f) => {
      const state = bodyState(f.positionMpc, f.orientation);
      const back = toWorldArm(
        toBodyArm(f.pose, f.poseBasis, f.upBasis, f.bodyId, state),
        state,
        f.poseBasis,
        f.upBasis,
        f.radiusM,
      );

      const targetRelM = eyeRelM(back.target, f.positionMpc);
      const eyeToCentreM = Math.hypot(
        ...eyeRelM(worldPoseOf(f.pose, f.poseBasis, f.upBasis).eye, f.positionMpc),
      );
      expect(Math.hypot(...targetRelM), `${label} target radius`).toBeCloseTo(f.radiusM, 3);
      // Every point on the sphere the eye can SEE is nearer to it than the
      // centre is, so this is what separates the near root from the far one.
      expect(back.distance * SCALE_UNITS.MPC_TO_M, `${label} range`).toBeLessThan(eyeToCentreM);
    },
  );

  it('falls back to the body centre when the sightline misses the body', () => {
    // Eye high above the body, aimed straight away from it: the line still has
    // two roots, but both are BEHIND the eye. Spec §5.1 puts the target at the
    // centre there — the eye survives, the view axis does not, which is why the
    // tilt ceiling keeps this case off the disengage boundary.
    const positionMpc: Vec3 = [AU, 0, 0];
    const state = bodyState(positionMpc, IDENTITY);
    const pose: CameraPose = {
      target: [AU, m(3.0e7), 0],
      yaw: 0,
      pitch: -Math.PI / 2,
      distance: m(1.0e6),
    };
    const back = toWorldArm(
      toBodyArm(pose, IDENTITY, IDENTITY, 'earth', state),
      state,
      IDENTITY,
      IDENTITY,
      EARTH_RADIUS_M,
    );

    expect(back.target).toEqual([...positionMpc]);
    const eyeRel = eyeRelM(worldPoseOf(pose, IDENTITY, IDENTITY).eye, positionMpc);
    expect(back.distance * SCALE_UNITS.MPC_TO_M).toBeCloseTo(Math.hypot(...eyeRel), 3);
    expectVec3Near(
      eyeRelM(worldPoseOf(back, IDENTITY, IDENTITY).eye, positionMpc),
      eyeRel,
      EYE_FLOOR_M,
      'fallback eye',
    );
  });

  it('composes the world eye exactly as updatePosition does', () => {
    // The module re-composes `updatePosition`'s two steps (frame-local decode,
    // rotate by `poseBasis`) out of the same sub-utils rather than calling it,
    // which no round-trip can catch: both halves would share the same drift.
    // `updatePosition` is not under test here, so it is a legal fixture source.
    // With the body at the world origin under the identity orientation,
    // `eyeRelAnchorM` IS the world eye scaled to metres, so the two agree bit
    // for bit or not at all. The target sits near the origin ON PURPOSE: at
    // heliocentric magnitude the f64 grid (~25 µm) swallows any composition
    // difference smaller than a grid step, and this equality would go blind.
    const pose: CameraPose = {
      target: [m(1.2e6), -m(0.8e6), m(1.1e6)],
      yaw: -2.2,
      pitch: -0.55,
      distance: m(1.1e7),
      roll: 0.4,
    };
    const cam: OrbitCamera = {
      ...pose,
      poseBasis: POSE_FRAME,
      upBasis: UP_FRAME,
      fovYRad: 1,
      aspect: 1,
      near: 1,
      far: 2,
      position: [0, 0, 0],
    };
    updatePosition(cam);

    const arm = toBodyArm(pose, POSE_FRAME, UP_FRAME, 'earth', bodyState([0, 0, 0], IDENTITY));
    expect(arm.eyeRelAnchorM).toEqual(cam.position.map((c) => c * SCALE_UNITS.MPC_TO_M));
    // …and this file's own hand-rolled twin of that decode, so a fixture-side
    // convention slip cannot cancel a module-side one.
    expect(worldPoseOf(pose, POSE_FRAME, UP_FRAME).eye).toEqual([...cam.position]);
  });

  it('carries the body id and anchors at the body centre', () => {
    const f = FIXTURES[0]!;
    const arm = toBodyArm(
      f.pose,
      f.poseBasis,
      f.upBasis,
      f.bodyId,
      bodyState(f.positionMpc, f.orientation),
    );
    expect(arm.bodyId).toBe(f.bodyId);
    // Spec §5.3: the first landing anchors at the body centre.
    expect(arm.anchorLocalM).toEqual([0, 0, 0]);
  });

  it('toBodyArm agrees with bodyRelativePose at the same camera', () => {
    // Spec §5.2: provider B replaces A only where it produces the same value.
    for (const f of FIXTURES) {
      const state = bodyState(f.positionMpc, f.orientation);
      const { eye, right, up, forward } = worldPoseOf(f.pose, f.poseBasis, f.upBasis);
      const a = bodyRelativePose({
        camPosMpc: eye,
        camBasisWorld: mat3FromColumns(right, up, forward),
        bodyState: state,
      });
      const b = toBodyArm(f.pose, f.poseBasis, f.upBasis, f.bodyId, state);

      const eyeRelBody: Vec3 = [
        b.anchorLocalM[0] + b.eyeRelAnchorM[0],
        b.anchorLocalM[1] + b.eyeRelAnchorM[1],
        b.anchorLocalM[2] + b.eyeRelAnchorM[2],
      ];
      expectVec3Near(eyeRelBody, a.eyeRelBodyM, EYE_FLOOR_M, 'eyeRelBodyM');
      for (let i = 0; i < 9; i++) {
        expect(Math.abs(b.basisLocal[i]! - a.basisM[i]!), `basis element ${i}`).toBeLessThan(1e-12);
      }
    }
  });
});
