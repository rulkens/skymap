/**
 * frameAlignedRoll — the world-arm frame-transition ride (ruling 8, round 3).
 *
 * Angle assertions only: roll is O(1) whatever the heliocentric magnitudes,
 * so real Earth at J2000 is an honest fixture here (the blind-assertion trap
 * is positional). The same-pose fixed point of the ride IS the curve target,
 * so converging in place is the test's oracle for T(pose) — no duplicated
 * blend arithmetic.
 */

import { describe, it, expect } from 'vitest';

import { frameAlignedRoll } from '../../../../src/services/engine/camera/frameAlignedRoll';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENT_DECAY } from '../../../../src/data/camera/orientDecay';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SURFACE_REGIME } from '../../../../src/data/camera/surfaceRegime';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { orbitAnglesLookingAlong } from '../../../../src/utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH = BODIES.get('earth')!;

/** Eye at h/R over Earth, looking at its centre, with the given roll. */
function poseAtHR(hr: number, roll: number, yaw = 0.7, pitch = 0.3): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw,
    pitch,
    distance: SCENE_EARTH.radiusM * (1 + hr) * SCALE_UNITS.M_TO_MPC,
    roll,
  };
}

/** Converge in place: the fixed point of the same-pose step is the target. */
function convergedRoll(pose: CameraPose, frame: Readonly<Mat3>, iterations = 200): number {
  let p = pose;
  for (let i = 0; i < iterations; i += 1) {
    p = { ...p, roll: frameAlignedRoll(p, p, BODIES, frame, frame) };
  }
  return p.roll ?? 0;
}

/** Angle between the pose's screen-up (in `frame`) and a world direction. */
function screenUpOffset(pose: CameraPose, frame: Readonly<Mat3>, worldDir: Vec3): number {
  const eye = eyeMpcOf(pose, frame);
  const forward = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const { up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(frame));
  const vert = forward[0]! * worldDir[0]! + forward[1]! * worldDir[1]! + forward[2]! * worldDir[2]!;
  const horiz = normalize3([
    worldDir[0]! - forward[0]! * vert,
    worldDir[1]! - forward[1]! * vert,
    worldDir[2]! - forward[2]! * vert,
  ] as Vec3);
  const dot = up[0]! * horiz[0]! + up[1]! * horiz[1]! + up[2]! * horiz[2]!;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

const EARTH_POLE = rotateVec3ByTightMat3([0, 0, 1], EARTH.orientation);

describe('frameAlignedRoll', () => {
  it('aligns screen-up with the body pole at the band floor', () => {
    // Deep in the band the blend is pole-dominated; the small scene-up share
    // (1 − authority ≈ 4e-4 at h/R 0.1) is the tolerance.
    const pose = poseAtHR(0.1, 1.4);
    const misaligned = screenUpOffset(pose, B, EARTH_POLE);
    expect(misaligned).toBeGreaterThan(0.5); // the fixture really is off
    const settled = { ...pose, roll: convergedRoll(pose, B) };
    expect(screenUpOffset(settled, B, EARTH_POLE)).toBeLessThan(0.02);
  });

  it('above the band, leftover roll drains toward the scene up, capped (round 7)', () => {
    // The (D) drain: the singular-locus rotation is intrinsic (~π across a
    // 2–4 notch band crossing), so ride debt surviving the disengage bake
    // MUST spend itself up here — deviation-only capped decay toward roll 0,
    // never a ride (the target is static above the band). Ruled cost: a
    // deep-space arrival roll now bleeds on notches too.
    const stepped = frameAlignedRoll(poseAtHR(5, 1.4), poseAtHR(5.5, 1.4), BODIES, B, B);
    expect(stepped).toBeCloseTo(1.4 - ORIENT_DECAY.capRad, 12);

    let roll = 2.0; // worst-cell-class residual
    let hr = 3.6;
    let notches = 0;
    while (Math.abs(roll) >= 1e-2 && notches < 40) {
      const nextHR = hr * 1.15;
      roll = frameAlignedRoll(poseAtHR(hr, roll), poseAtHR(nextHR, roll), BODIES, B, B);
      hr = nextHR;
      notches += 1;
    }
    expect(Math.abs(roll)).toBeLessThan(1e-2);
    expect(notches).toBeLessThanOrEqual(30);
  });

  it('a recession rides the target to exactly the global up at the band top', () => {
    // The round-3 ruling: the curve defines the roll TARGET (pole ↔ scene up
    // blend) and a recession notch rides the target's change IN FULL — the
    // share-decay step it replaces froze the band roll verbatim above the
    // band (measured: −0.259 rad at h/R 4.9, zero return). Riding from an
    // aligned start, no notch moves more than that notch's own target delta,
    // and the first above-band pose is at roll 0 — the configured up.
    let hr = 1.0;
    let roll = convergedRoll(poseAtHR(hr, 0), B, 300);
    expect(Math.abs(roll)).toBeGreaterThan(0.1); // the band really bent it
    while (hr <= SURFACE_REGIME.disengageHR) {
      const nextHR = hr * 1.15;
      const pre = poseAtHR(hr, roll);
      const post = poseAtHR(nextHR, roll);
      const next = frameAlignedRoll(pre, post, BODIES, B, B);
      // The notch's own target delta, measured off the ride's fixed points —
      // above the band the target is 0 structurally (the probe is inert there).
      const targetPost =
        nextHR > SURFACE_REGIME.disengageHR ? 0 : convergedRoll(poseAtHR(nextHR, roll), B, 300);
      const targetDelta = Math.abs(targetPost - convergedRoll(pre, B, 300));
      expect(Math.abs(next - roll)).toBeLessThanOrEqual(targetDelta + 1e-9);
      roll = next;
      hr = nextHR;
    }
    expect(hr).toBeGreaterThan(SURFACE_REGIME.disengageHR);
    expect(Math.abs(roll)).toBeLessThan(1e-9);
  });

  it('the target follows the CONFIGURED scene up, not a hardcoded frame', () => {
    // Same geometry, two orientation frames: the converged band roll must
    // differ (roll is frame-relative), and receding to the band top must land
    // screen-up on EACH frame's own up. A hardcoded reference would produce
    // frame-independent rolls and misalign the non-default frame.
    const alt = ORIENTATION_FRAMES.galactic;
    const deepB = convergedRoll(poseAtHR(0.1, 0), B);
    const deepAlt = convergedRoll(poseAtHR(0.1, 0), alt);
    expect(Math.abs(deepB - deepAlt)).toBeGreaterThan(0.05);

    let hr = 1.0;
    let roll = convergedRoll(poseAtHR(hr, 0), alt, 300);
    while (hr <= SURFACE_REGIME.disengageHR) {
      const nextHR = hr * 1.15;
      roll = frameAlignedRoll(poseAtHR(hr, roll), poseAtHR(nextHR, roll), BODIES, alt, alt);
      hr = nextHR;
    }
    expect(Math.abs(roll)).toBeLessThan(1e-9);
    const settled = { ...poseAtHR(hr, roll) };
    // Screen-up sits on the galactic frame's own up — not its negation, not
    // a perpendicular.
    expect(screenUpOffset(settled, alt, frameUp(alt) as Vec3)).toBeLessThan(1e-6);
  });

  it('the anti-parallel knot rides continuity-bounded, no single-notch flip (round 6)', () => {
    // R5-2's locus: at yaw 0 / pitch −1.40 in the default frame the blend's
    // raw terms cancel across the band, `normalize` reverses, and the
    // pre-round-6 ride applied the π flip in one notch (measured 3.1416 rad).
    // The continuity bound treats the excess as unauthored; parking at a
    // stable altitude afterwards converges fully by the capped decay.
    let roll = convergedRoll(poseAtHR(1.2, 0, 0, -1.4), B, 300);
    let hr = 1.2;
    let maxStep = 0;
    while (hr < SURFACE_REGIME.disengageHR - 0.2) {
      const nextHR = hr * 1.1;
      const next = frameAlignedRoll(
        poseAtHR(hr, roll, 0, -1.4),
        poseAtHR(nextHR, roll, 0, -1.4),
        BODIES,
        B,
        B,
      );
      maxStep = Math.max(maxStep, Math.abs(next - roll));
      roll = next;
      hr = nextHR;
    }
    expect(maxStep).toBeLessThanOrEqual(ORIENT_DECAY.rideBoundRad + ORIENT_DECAY.capRad + 1e-9);

    // Park in-band: the target is stable, so the deviation decays to it.
    let pose = poseAtHR(hr, roll, 0, -1.4);
    const settled = convergedRoll(pose, B, 300);
    pose = { ...pose, roll: settled };
    const drift = Math.abs(frameAlignedRoll(pose, pose, BODIES, B, B) - settled);
    expect(drift).toBeLessThan(1e-9); // genuinely at the fixed point — converged
  });

  it('a view near the spin axis converges to the scene up — no projection chase', () => {
    // The user's "completely different up vector": with the pole projection
    // NORMALIZED, a view 2° off the spin axis chased the near-degenerate
    // direction to −1.49 rad of roll (measured at the previous HEAD). The
    // raw-projection blend hands the target to the scene up there instead.
    const tiltRad = (2 * Math.PI) / 180;
    const perp: Vec3 = Math.abs(EARTH_POLE[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dir = normalize3([
      EARTH_POLE[0]! + tiltRad * perp[0]!,
      EARTH_POLE[1]! + tiltRad * perp[1]!,
      EARTH_POLE[2]! + tiltRad * perp[2]!,
    ] as Vec3);
    const { yaw, pitch } = orbitAnglesLookingAlong(
      [-dir[0]!, -dir[1]!, -dir[2]!] as Vec3,
      [...B] as Mat3,
    );

    // In-band settle: bounded and near the scene up (the raw-weighted pole
    // term is only sin 2° strong; the old chase converged 1.4 rad off).
    let pose = poseAtHR(1.0, 0, yaw, pitch);
    let maxStep = 0;
    for (let i = 0; i < 60; i += 1) {
      const next = frameAlignedRoll(pose, pose, BODIES, B, B);
      maxStep = Math.max(maxStep, Math.abs(next - (pose.roll ?? 0)));
      pose = { ...pose, roll: next };
    }
    expect(maxStep).toBeLessThanOrEqual(0.1 + 1e-9); // every step capped
    expect(screenUpOffset(pose, B, frameUp(B) as Vec3)).toBeLessThan(0.5);

    // Recede past the band top: the ride lands screen-up on the configured
    // global up — not its negation, not a perpendicular.
    let hr = 1.0;
    while (hr <= SURFACE_REGIME.disengageHR) {
      const nextHR = hr * 1.15;
      const next = frameAlignedRoll(
        poseAtHR(hr, pose.roll ?? 0, yaw, pitch),
        poseAtHR(nextHR, pose.roll ?? 0, yaw, pitch),
        BODIES,
        B,
        B,
      );
      maxStep = Math.max(maxStep, Math.abs(next - (pose.roll ?? 0)));
      pose = poseAtHR(nextHR, next, yaw, pitch);
      hr = nextHR;
    }
    expect(maxStep).toBeLessThanOrEqual(0.35); // no π flip anywhere on the path
    expect(screenUpOffset(pose, B, frameUp(B) as Vec3)).toBeLessThan(1e-6);
  });
});
