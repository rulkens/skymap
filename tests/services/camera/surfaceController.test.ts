/**
 * surfaceController — the body arm's gestures (spec §6).
 *
 * Fixtures are a unit-radius body with the eye a couple of radii out and a 90°
 * FOV, so every pick, angle and rotation below is a closed form written out by
 * hand: at Earth magnitudes the same assertions would be blind to everything
 * but a total failure.
 */

import { describe, it, expect } from 'vitest';

import { createSurfaceController } from '../../../src/services/camera/surfaceController';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
import { cursorRayBodyLocal } from '../../../src/utils/camera/cursorRayBodyLocal';
import { maxTiltRad } from '../../../src/utils/camera/maxTiltRad';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 1;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2; // tan(FOV/2) = 1 — one NDC unit is one eye-distance

/** Columns right | up | forward. Nadir: at +Z looking down, screen-up = +Y. */
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

function poseAt(eyeM: Vec3, basisLocal: Mat3): BodyFixedPose {
  return { bodyId: 'earth', anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeM, basisLocal };
}

function drag(mode: 'orbit' | 'pan', startPx: Vec2, endPx: Vec2): InputStep {
  return { kind: 'drag', mode, startPx, endPx };
}

function eyeOf(pose: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = pose;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}

function angleBetween(a: Vec3, b: Vec3): number {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/**
 * Right | up | forward for heading 0, tilt `theta` from nadir, at an eye on
 * the +Z axis — the same closed form `ceilingEnforcedPose` reconstructs, so
 * these fixtures can place a pose at an exact tilt without going through a
 * gesture drag to get there.
 */
function basisAtTilt(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [1, 0, 0, 0, c, s, 0, s, -c];
}

/** One step through the controller with the fixture's viewport / FOV / radius. */
function apply(
  controller: ReturnType<typeof createSurfaceController>,
  pose: BodyFixedPose,
  step: InputStep,
): BodyFixedPose {
  return controller.apply(pose, step, VIEWPORT, FOV, R);
}

describe('surfaceController', () => {
  it('latches the mode at gesture start and keeps it for the gesture', () => {
    // The press grazes the limb (|ray·normal| = 0.03 at x = 78.85 px), so the
    // gesture strafes. Dragging back toward the middle of the disc, where the
    // incidence is steep, must NOT promote it to an anchored pan: strafe only
    // ever translates, so a re-decided mode shows up as a rotated basis.
    const c = createSurfaceController();
    c.onGestureStart();
    let pose = poseAt([0, 0, 2], NADIR);
    pose = apply(c, pose, drag('orbit', [78.85, 50], [70, 50]));
    pose = apply(c, pose, drag('orbit', [70, 50], [65, 50]));

    expect(pose.basisLocal).toEqual(NADIR);
    // Not vacuous: the strafe did move the camera.
    expect(eyeOf(pose)[0]).not.toBe(0);
  });

  it('ignores a trackpad inertial burst after pointerup (FW-C)', () => {
    const c = createSurfaceController();
    c.onGestureStart();
    const start = poseAt([0, 0, 2], NADIR);
    const dragged = apply(c, start, drag('orbit', [50, 50], [60, 50]));
    expect(dragged).not.toBe(start);

    c.onGestureEnd();
    // The burst replays drag runs with no gesture around them: nothing moves,
    // and nothing latches — the next real gesture still decides for itself.
    let coasted = dragged;
    for (const x of [70, 80, 90]) coasted = apply(c, coasted, drag('orbit', [x - 10, 50], [x, 50]));
    expect(coasted).toBe(dragged);

    c.onGestureStart();
    expect(apply(c, dragged, drag('orbit', [50, 50], [60, 50]))).not.toBe(dragged);
  });

  it('keeps the rate currency bounded and single-signed across the limb (FW-D)', () => {
    // The limb sits at x ≈ 78.9 px from [0,0,2] with a 90° FOV. Walking a drag
    // through it degrades pan → trackball once, and the currency must not
    // alternate: every step turns the same way, none of them jumps.
    const c = createSurfaceController();
    c.onGestureStart();
    let pose = poseAt([0, 0, 2], NADIR);
    const walk = [50, 60, 70, 76, 82, 90];

    for (let i = 1; i < walk.length; i += 1) {
      const before = eyeOf(pose);
      pose = apply(c, pose, drag('orbit', [walk[i - 1]!, 50], [walk[i]!, 50]));
      const after = eyeOf(pose);
      const stepped = angleBetween(before, after);
      expect(stepped).toBeGreaterThan(0);
      expect(stepped).toBeLessThan(0.6);
      // Dragging right carries the ground right, so the eye swings the other
      // way — on every step, in both modes.
      expect(after[0]).toBeLessThan(before[0]);
      expect(Math.hypot(...after)).toBeCloseTo(2, 12);
    }
  });

  it('tilts about the already-yawed east, not a fixed screen axis', () => {
    // Anchor = the screen-centre pick [0,0,1]; the eye orbits it by heading ψ
    // about the local up, THEN by tilt −α about the yawed east — negated at
    // the input mapping so drag-down tilts the view UP toward the horizon
    // (Google Earth's right-drag convention). Closed form:
    // eye = anchor + R(q1·east, −α)·R(up, ψ)·(eye − anchor)
    //     = [−sinψ·sinα, cosψ·sinα, 1 + cosα].
    // The fixed-axis order leaves x at 0 — that is the whole difference.
    const c = createSurfaceController();
    c.onGestureStart();
    const psi = (20 / 100) * FOV;
    const alpha = (10 / 100) * FOV;
    const pose = apply(c, poseAt([0, 0, 2], NADIR), drag('pan', [50, 50], [70, 60]));

    const eye = eyeOf(pose);
    expect(eye[0]).toBeCloseTo(-Math.sin(psi) * Math.sin(alpha), 12);
    expect(eye[1]).toBeCloseTo(Math.cos(psi) * Math.sin(alpha), 12);
    expect(eye[2]).toBeCloseTo(1 + Math.cos(alpha), 12);
    // The basis turned with the eye: right ends on the yawed east.
    expect(pose.basisLocal.slice(0, 3)).toEqual([
      expect.closeTo(Math.cos(psi), 12),
      expect.closeTo(Math.sin(psi), 12),
      expect.closeTo(0, 12),
    ]);
  });

  it('leaves the eye bit-identical under free-look while the heading turns', () => {
    // Pitched 30° up at 0.2 R, so the camera's own up is NOT the local
    // vertical: yawing about the wrong one of the two rolls the horizon.
    const c = createSurfaceController();
    const cos30 = Math.cos(Math.PI / 6);
    const start = poseAt([0, 0, 1.2], [1, 0, 0, 0, -0.5, cos30, 0, cos30, 0.5]);
    c.onGestureStart();
    const pose = apply(c, start, drag('orbit', [50, 25], [70, 25]));

    expect(pose.anchorLocalM).toEqual(start.anchorLocalM);
    expect(pose.eyeRelAnchorM).toEqual(start.eyeRelAnchorM);
    // Forward swung by exactly the subtended angle about the LOCAL vertical:
    // the heading is live, the pitch is untouched, and up keeps its vertical
    // component — the horizon stayed level.
    const gamma = (20 / 100) * FOV;
    expect(pose.basisLocal[6]).toBeCloseTo(-cos30 * Math.sin(gamma), 12);
    expect(pose.basisLocal[7]).toBeCloseTo(cos30 * Math.cos(gamma), 12);
    expect(pose.basisLocal[8]).toBeCloseTo(0.5, 12);
    expect(pose.basisLocal[5]).toBeCloseTo(cos30, 12);
  });

  it('floors every position write at the surface', () => {
    // A tilt orbits the anchor, so it holds |eye − anchor|, not |eye|: from
    // 0.05 R up, 120° of it swings the eye past horizontal and under the
    // ground. `anchoredZoomStep` carries the only other floor in the engaged
    // path; spec §6(c)'s "the floor already forbids that" has to hold for the
    // drag modes too.
    const c = createSurfaceController();
    c.onGestureStart();
    const tilted = apply(c, poseAt([0, 0, 1.05], NADIR), drag('pan', [50, 50], [50, 183.3]));

    expect(Math.hypot(...eyeOf(tilted))).toBeCloseTo(surfaceFloorM(R), 12);
    // Radial push, so the view direction is untouched — no jerk to rotate out.
    expect(tilted.basisLocal).not.toEqual(NADIR);
  });

  it('re-picks the zoom anchor after the eye overshoots its tangent plane', () => {
    // Tilt hard about the picked anchor until the eye is BELOW its tangent
    // plane — the anchor is now behind the horizon, so zooming toward it would
    // carry the camera backwards through it (C §6.7). The anchor is the same
    // ray-sphere pick `latchFor` makes, computed here rather than hand-solved
    // (this pixel has no clean closed form the way [75,50] does).
    // The −245 px end is off the 100 px viewport on purpose: the recognizer
    // binds move/up to `window` (the iOS implicit-capture fix), so dragging
    // past the canvas edge is an ordinary case the controller must handle.
    const start = poseAt([0, 0, 2], NADIR);
    const startRay = cursorRayBodyLocal(start, [60, 50], VIEWPORT, FOV);
    const t0 = raySphereRoots(startRay.originM, startRay.dir, [0, 0, 0], R)![0];
    const anchor: Vec3 = [
      startRay.originM[0] + startRay.dir[0] * t0,
      startRay.originM[1] + startRay.dir[1] * t0,
      startRay.originM[2] + startRay.dir[2] * t0,
    ];

    const c = createSurfaceController();
    c.onGestureStart();
    const tilted = apply(c, start, drag('pan', [60, 50], [60, -245]));
    const eye = eyeOf(tilted);
    expect(eye[0] * anchor[0] + eye[2] * anchor[2]).toBeLessThan(1);

    // `eye′ = A + f·(eye − A)` inverts to `A = (eye′ − f·eye)/(1 − f)`, so the
    // anchor the tick actually used is readable off the result: it is a fresh
    // surface pick, and it is not the latched one.
    const zoomedEye = eyeOf(apply(c, tilted, { kind: 'zoom', factor: 0.5, duringGesture: true }));
    const used: Vec3 = [
      2 * zoomedEye[0] - eye[0],
      2 * zoomedEye[1] - eye[1],
      2 * zoomedEye[2] - eye[2],
    ];
    expect(Math.hypot(...used)).toBeCloseTo(R, 12);
    expect(angleBetween(used, anchor)).toBeGreaterThan(0.5);
  });

  it('a zoom-out re-levels against the new local vertical', () => {
    // Comfortably tilted at a low, wide-open ceiling; a factor-2 zoom-out
    // (the per-tick maximum) lifts h/R past the point where the ceiling has
    // narrowed below the held tilt, so the very same tick must re-level —
    // no separate untilt tween runs afterward.
    const c = createSurfaceController();
    const theta = 2.5;
    const start = poseAt([0, 0, R * 1.05], basisAtTilt(theta));
    const zoomedOut = apply(c, start, { kind: 'zoom', factor: 2, duringGesture: false });

    const eye = eyeOf(zoomedOut);
    const hOverR = Math.hypot(...eye) / R - 1;
    const forward: Vec3 = [
      zoomedOut.basisLocal[6],
      zoomedOut.basisLocal[7],
      zoomedOut.basisLocal[8],
    ];
    const tiltAfter = angleBetween(forward, [-eye[0], -eye[1], -eye[2]]);

    expect(tiltAfter).toBeLessThan(theta);
    expect(tiltAfter).toBeCloseTo(maxTiltRad(hOverR), 10);
  });

  it('the pose reaching the disengage boundary has tilt 0', () => {
    // maxTiltRad(disengageHR) === 0 (pinned in maxTiltRad.test.ts), so ANY
    // held tilt at that altitude clamps all the way to nadir — the Q4
    // invariant a world-arm pivot pin relies on at the seam.
    const c = createSurfaceController();
    const start = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(1.0));
    const settled = apply(c, start, { kind: 'zoom', factor: 1, duringGesture: false });

    const forward: Vec3 = [settled.basisLocal[6], settled.basisLocal[7], settled.basisLocal[8]];
    expect(forward[0]).toBeCloseTo(0, 12);
    expect(forward[1]).toBeCloseTo(0, 12);
    expect(forward[2]).toBeCloseTo(-1, 12);
  });

  it('enforcement never moves the eye', () => {
    const c = createSurfaceController();
    const start = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(1.5));
    const settled = apply(c, start, { kind: 'zoom', factor: 1, duringGesture: false });

    expect(settled.anchorLocalM).toEqual(start.anchorLocalM);
    expect(settled.eyeRelAnchorM).toEqual(start.eyeRelAnchorM);
  });

  it('a pose entering the arm above the ceiling is not clamped (spec §12-R3)', () => {
    // No `onGestureStart`: this is a pose that has just landed in the arm
    // (a flyby, a tour keyframe), not a driven write, so it must sit above
    // the ceiling untouched until the user's own gesture moves it.
    const c = createSurfaceController();
    const entered = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(Math.PI / 2));
    const untouched = apply(c, entered, drag('orbit', [50, 50], [60, 50]));

    expect(untouched).toBe(entered);
  });
});
