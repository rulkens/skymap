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

import {
  toBodyArm,
  toWorldArm,
  resolveWorldArm,
} from '../../../../src/services/engine/camera/poseFrameConversion';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { updatePosition } from '../../../../src/utils/camera/updatePosition';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { raySphereRoots } from '../../../../src/utils/math/raySphereRoots';
import { surfaceFloorM } from '../../../../src/utils/camera/surfaceFloorM';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { rotXMat3 } from '../../../../src/utils/math/rotXMat3';
import { rotYMat3 } from '../../../../src/utils/math/rotYMat3';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { BodyFixedPose } from '../../../../src/@types/camera/BodyFixedPose';
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

  it('keeps the target on the forward ray when the sightline misses the body', () => {
    // Eye high above the body, aimed straight away from it: no root ahead, and
    // the closest approach is behind, so the altitude floor sets the range. The
    // pose still denotes the SAME view axis — the retired body-centre fallback
    // turned it by the whole off-nadir angle (180° here).
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

    const before = worldPoseOf(pose, IDENTITY, IDENTITY);
    const after = worldPoseOf(back, IDENTITY, IDENTITY);
    const eyeRel = eyeRelM(before.eye, positionMpc);
    expectVec3Near(after.forward, before.forward, DIR_FLOOR, 'miss-branch forward');
    expectVec3Near(eyeRelM(after.eye, positionMpc), eyeRel, EYE_FLOOR_M, 'miss-branch eye');
    expect(back.distance * SCALE_UNITS.MPC_TO_M).toBeCloseTo(
      Math.hypot(...eyeRel) - EARTH_RADIUS_M,
      3,
    );
  });

  it('floors the range for an eye at the surface looking along the horizon', () => {
    // The sharp case for the floor, and the only one that reaches its `eyeMagM`
    // half: on the surface, exactly tangential. Both roots are 0 and so is the
    // closest approach, so an unfloored range would be the zero vector and
    // `normalize3` would hand NaN yaw/pitch to every consumer. Standing off by
    // the surface arm's own descent floor is what keeps it finite.
    const state = bodyState([0, 0, 0], IDENTITY);
    const forward: Vec3 = [1, 0, 0];
    const { right, up } = imagePlaneBasis(forward, 0, [0, 1, 0]);
    const back = toWorldArm(
      {
        bodyId: 'earth',
        anchorLocalM: [0, 0, 0],
        eyeRelAnchorM: [0, 0, EARTH_RADIUS_M],
        basisLocal: mat3FromColumns(right, up, forward),
      },
      state,
      IDENTITY,
      IDENTITY,
      EARTH_RADIUS_M,
    );

    expect(back.distance * SCALE_UNITS.MPC_TO_M).toBeCloseTo(
      surfaceFloorM(EARTH_RADIUS_M) - EARTH_RADIUS_M,
      6,
    );
    expectVec3Near(
      worldPoseOf(back, IDENTITY, IDENTITY).forward,
      forward,
      DIR_FLOOR,
      'horizon axis',
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

/**
 * The limb crossing (the "Earth pop"). Body at the WORLD ORIGIN under the
 * identity orientation on purpose: at heliocentric magnitude the Mpc f64 grid
 * is ~25 µm and would swallow the metre-scale steps measured here.
 *
 * h/R = 2.665 and R = 6371 km are the reported geometry — eye 23,350 km from
 * the centre, tangency at asin(R/d) = 15.8° off nadir. Before the fix the miss
 * branch re-aimed the pose at the body centre there: 15.8° of direction and
 * 8.9e5 m of range, in one frame.
 */
const LIMB_EYE_M = EARTH_RADIUS_M * (1 + 2.665);
const LIMB_TANGENT_RAD = Math.asin(EARTH_RADIUS_M / LIMB_EYE_M);

// A screen-up rolled OFF the +y pole. At roll 0 screen-up IS the pole and
// `rollFromScreenUp` answers 0 in every branch, which would make the roll
// assertions below pass vacuously — and roll is the term the disengage fold
// bakes into the absolute arm permanently.
const LIMB_ROLL_RAD = 0.3;

/** Eye at `LIMB_EYE_M` on +z, view axis tilted `tiltRad` off nadir in the xz plane. */
function limbPose(tiltRad: number): BodyFixedPose {
  const forward: Vec3 = [Math.sin(tiltRad), 0, -Math.cos(tiltRad)];
  const { right, up } = imagePlaneBasis(forward, LIMB_ROLL_RAD, [0, 1, 0]);
  return {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [0, 0, LIMB_EYE_M],
    basisLocal: mat3FromColumns(right, up, forward),
  };
}

describe('toWorldArm across the limb', () => {
  it('reproduces the view axis and the roll at every tilt through tangency', () => {
    const state = bodyState([0, 0, 0], IDENTITY);
    const SPAN_RAD = 0.02;
    const STEPS = 41;
    let hits = 0;
    for (let i = 0; i < STEPS; i++) {
      const tilt = LIMB_TANGENT_RAD - SPAN_RAD + (2 * SPAN_RAD * i) / (STEPS - 1);
      const arm = limbPose(tilt);
      if (
        raySphereRoots(
          arm.eyeRelAnchorM,
          [Math.sin(tilt), 0, -Math.cos(tilt)],
          [0, 0, 0],
          EARTH_RADIUS_M,
        ) !== null
      )
        hits++;
      const back = toWorldArm(arm, state, IDENTITY, IDENTITY, EARTH_RADIUS_M);
      const { eye, forward } = worldPoseOf(back, IDENTITY, IDENTITY);

      expectVec3Near(forward, [Math.sin(tilt), 0, -Math.cos(tilt)], DIR_FLOOR, `tilt ${tilt} axis`);
      expectVec3Near(
        [
          eye[0] * SCALE_UNITS.MPC_TO_M,
          eye[1] * SCALE_UNITS.MPC_TO_M,
          eye[2] * SCALE_UNITS.MPC_TO_M,
        ],
        [0, 0, LIMB_EYE_M],
        EYE_FLOOR_M,
        `tilt ${tilt} eye`,
      );
      expect(back.roll ?? 0, `tilt ${tilt} roll`).toBeCloseTo(LIMB_ROLL_RAD, 12);
    }
    // Anti-vacuity: the sweep must actually straddle the crossing, or the
    // assertions above only ever exercise one branch.
    expect(hits, 'hitting samples').toBeGreaterThan(0);
    expect(STEPS - hits, 'missing samples').toBeGreaterThan(0);
  });

  /** What the pose does across a step of ±`epsRad` straddling tangency. */
  function jumpAcross(epsRad: number): {
    axisRad: number;
    rangeM: number;
    targetM: number;
    rollRad: number;
  } {
    const state = bodyState([0, 0, 0], IDENTITY);
    const at = (tilt: number): CameraPose =>
      toWorldArm(limbPose(tilt), state, IDENTITY, IDENTITY, EARTH_RADIUS_M);
    const inside = at(LIMB_TANGENT_RAD - epsRad);
    const outside = at(LIMB_TANGENT_RAD + epsRad);
    const a = worldPoseOf(inside, IDENTITY, IDENTITY).forward;
    const b = worldPoseOf(outside, IDENTITY, IDENTITY).forward;
    return {
      axisRad: Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])),
      rangeM: Math.abs(inside.distance - outside.distance) * SCALE_UNITS.MPC_TO_M,
      targetM:
        Math.hypot(
          inside.target[0] - outside.target[0],
          inside.target[1] - outside.target[1],
          inside.target[2] - outside.target[2],
        ) * SCALE_UNITS.MPC_TO_M,
      rollRad: Math.abs((inside.roll ?? 0) - (outside.roll ?? 0)),
    };
  }

  it('crosses tangency continuously — the range gap vanishes with the step', () => {
    // Continuity, not smallness: the range is C⁰ but NOT C¹ here (`√disc` has
    // infinite slope at tangency), so the gap is `√(2·d·R·cosθ·ε)` — 170 m at
    // ε=1e-10, and it must shrink as √ε. A discontinuity holds its size: the
    // body-centre fallback jumped 8.9e5 m at EVERY ε.
    const coarse = jumpAcross(1e-8);
    const fine = jumpAcross(1e-12);
    expect(coarse.rangeM, 'coarse range gap, m').toBeLessThan(2e3);
    expect(fine.rangeM, 'fine range gap, m').toBeLessThan(coarse.rangeM / 50);
    expect(fine.targetM, 'fine target gap, m').toBeLessThan(coarse.targetM / 50);
    // The view axis never moves at all — the target stays on the ray, so the
    // only difference between the two samples is the 2ε of tilt itself.
    expect(coarse.axisRad, 'view-axis jump, rad').toBeLessThan(1e-7);
    // The roll the fold bakes into the absolute arm at disengage is a function
    // of that axis, which is what made a jumping axis a jumping roll.
    expect(coarse.rollRad, 'roll jump, rad').toBeLessThan(1e-7);
  });
});

describe('resolveWorldArm', () => {
  it("returns the absolute arm's pose by reference", () => {
    // The idempotence that makes the per-frame fold free while the camera is in
    // the world arm — a copy here would allocate on every frame and break the
    // `toBe` identity `applyFocusedBodyPivot`'s pass-through relies on.
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.4, pitch: -0.2, distance: 12 };
    const resolved = resolveWorldArm(absoluteArm(pose), new Map(), IDENTITY, IDENTITY);
    expect(resolved).toBe(pose);
  });
});
