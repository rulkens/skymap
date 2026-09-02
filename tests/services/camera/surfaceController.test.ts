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

/** `cursorPx: null` is the pinch case — no single cursor, so screen centre. */
function zoom(factor: number, duringGesture: boolean, cursorPx: Vec2 | null = null): InputStep {
  return { kind: 'zoom', factor, duringGesture, cursorPx };
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
 * the +Z axis — the controller's canonical roll-free basis, so these fixtures
 * can place a pose at an exact tilt without going through a gesture drag to
 * get there.
 */
function basisAtTilt(theta: number): Mat3 {
  return basisAt(0, theta);
}

/**
 * The same, for an arbitrary heading. At an eye on +Z the ENU is the fallback
 * one — east = [1,0,0], north = [0,1,0] — so heading ψ reads straight off the
 * forward column as `atan2(fx, fy)` and needs no import to check.
 */
function basisAt(psi: number, theta: number): Mat3 {
  const ch = Math.cos(psi);
  const sh = Math.sin(psi);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const horiz: Vec3 = [sh, ch, 0];
  return [ch, -sh, 0, horiz[0] * ct, horiz[1] * ct, st, horiz[0] * st, horiz[1] * st, -ct] as Mat3;
}

/** The same basis rolled about its own view axis — the term a rebuild loses. */
function rolledAber(basis: Mat3, rho: number): Mat3 {
  const c = Math.cos(rho);
  const s = Math.sin(rho);
  return [
    basis[0] * c + basis[3] * s,
    basis[1] * c + basis[4] * s,
    basis[2] * c + basis[5] * s,
    basis[3] * c - basis[0] * s,
    basis[4] * c - basis[1] * s,
    basis[5] * c - basis[2] * s,
    basis[6],
    basis[7],
    basis[8],
  ];
}

/**
 * Heading of a pose whose eye is still ON +Z — a radial zoom keeps it there,
 * a dive at an off-centre cursor does not (use `northUpOffset` for those).
 * Escapes to the up column at nadir for the same reason `headingTiltAt` does:
 * forward's horizontal part is `sin(tilt)`, so at tilt 0 only `up` carries an
 * azimuth at all and `atan2` on forward would read pure rounding noise.
 */
function headingOnAxis(pose: BodyFixedPose): number {
  const b = pose.basisLocal;
  return Math.hypot(b[6], b[7]) < 1e-6 ? Math.atan2(b[3], b[4]) : Math.atan2(b[6], b[7]);
}

/**
 * What the user calls "north is up": the angle between screen-up and local
 * north, in the ENU at wherever the eye actually is. Valid off-axis, which is
 * what the dive fixtures need.
 */
function northUpOffset(pose: BodyFixedPose): number {
  const e = eyeOf(pose);
  const mag = Math.hypot(...e);
  const localUp: Vec3 = [e[0] / mag, e[1] / mag, e[2] / mag];
  const eastRaw: Vec3 = [-localUp[1], localUp[0], 0];
  const eastLen = Math.hypot(...eastRaw);
  const east: Vec3 = eastLen > 1e-9 ? [eastRaw[0] / eastLen, eastRaw[1] / eastLen, 0] : [1, 0, 0];
  const north: Vec3 = [
    localUp[1] * east[2] - localUp[2] * east[1],
    localUp[2] * east[0] - localUp[0] * east[2],
    localUp[0] * east[1] - localUp[1] * east[0],
  ];
  const up: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
  // Only the horizontal part of screen-up carries an azimuth.
  const upVert = up[0] * localUp[0] + up[1] * localUp[1] + up[2] * localUp[2];
  const horiz: Vec3 = [
    up[0] - localUp[0] * upVert,
    up[1] - localUp[1] * upVert,
    up[2] - localUp[2] * upVert,
  ];
  return angleBetween(horiz, north);
}

/** The surface point under a pixel, or null if that ray misses the body. */
function pickThrough(pose: BodyFixedPose, px: Vec2): Vec3 | null {
  const ray = cursorRayBodyLocal(pose, px, VIEWPORT, FOV);
  const roots = raySphereRoots(ray.originM, ray.dir, [0, 0, 0], R);
  if (roots === null || roots[0] <= 0) return null;
  return [
    ray.originM[0] + ray.dir[0] * roots[0],
    ray.originM[1] + ray.dir[1] * roots[0],
    ray.originM[2] + ray.dir[2] * roots[0],
  ];
}

/** Angle between the view axis and the direction to the body centre. */
function bodyAngle(pose: BodyFixedPose): number {
  const e = eyeOf(pose);
  const f: Vec3 = [pose.basisLocal[6], pose.basisLocal[7], pose.basisLocal[8]];
  return angleBetween(f, [-e[0], -e[1], -e[2]]);
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
    // through it degrades pan → orbit once, and the currency must not
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

    // Which anchor a tick used is readable off the range it scaled: the step
    // takes `|eye − A|` to `f·|eye − A|`, and the approach's north-up rotation
    // is about an axis through A, so that distance survives it untouched. The
    // fresh screen-centre pick satisfies the law; the latched anchor does not.
    // The gesture is live, so the re-pick goes through the drag's last pixel.
    const fresh = pickThrough(tilted, [60, -245])!;
    expect(fresh).not.toBeNull();
    const zoomedEye = eyeOf(apply(c, tilted, zoom(0.5, true)));
    const rangeTo = (a: Vec3, e: Vec3): number => Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);

    expect(rangeTo(fresh, zoomedEye)).toBeCloseTo(0.5 * rangeTo(fresh, eye), 12);
    expect(rangeTo(anchor, zoomedEye)).not.toBeCloseTo(0.5 * rangeTo(anchor, eye), 6);
    expect(angleBetween(fresh, anchor)).toBeGreaterThan(0.5);
  });

  it('anchors an at-rest wheel on the cursor’s surface pick, not screen centre', () => {
    // From [0,0,2] the ray through x = 75 px (ndc 0.5, tan(FOV/2) = 1) is
    // [0.5,0,−1]/√1.25 and hits the unit sphere at exactly [0.6,0,0.8]; the
    // screen-centre pick a pixel-less wheel used to take is [0,0,1], so the
    // two fallbacks are metres apart in this fixture.
    const c = createSurfaceController();
    const start = poseAt([0, 0, 2], NADIR);
    const anchor: Vec3 = [0.6, 0, 0.8];

    // `eye′ = A + f·(eye − A)` would put the eye at exactly [0.3, 0, 1.4]; the
    // approach's north-up rotation about the anchor axis then walks it around
    // that point, so what stays exact is the RANGE to the anchor (the axis
    // passes through it) and the pixel the anchor sits under.
    const stepped = apply(c, start, zoom(0.5, false, [75, 50]));
    const eye = eyeOf(stepped);
    expect(Math.hypot(eye[0] - 0.6, eye[1], eye[2] - 0.8)).toBeCloseTo(
      0.5 * Math.hypot(0 - 0.6, 0, 2 - 0.8),
      12,
    );
    expect(angleBetween(pickThrough(stepped, [75, 50])!, anchor)).toBeLessThan(1e-12);

    // …and keeping the wheel turning walks the eye onto that point, which is
    // the user-visible property: what the cursor is over stays put and grows.
    // The residual is the descent floor's radial push, not a drift — the eye
    // parks above the anchor rather than in it. A screen-centre anchor leaves
    // this angle at 0.64 rad.
    let pose = start;
    for (let i = 0; i < 30; i += 1) pose = apply(c, pose, zoom(0.5, false, [75, 50]));
    expect(angleBetween(eyeOf(pose), anchor)).toBeLessThan(1e-3);
  });

  it('a zoom-out walks the view level by the bounded decay, never in one tick', () => {
    // R1: recession converges toward the canonical framing through the SAME
    // capped decay the approach uses — from 2.4 rad of held tilt no notch may
    // turn the view by more than the per-axis cap sum, and the staircase still
    // lands on nadir. (The old model clamped the whole excess to the altitude
    // ceiling in one tick — a 153°-class snap from large residuals, C1.)
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAtTilt(2.4));
    let lastTilt = bodyAngle(pose);
    for (let i = 0; i < 40; i += 1) {
      const upBefore: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
      pose = apply(c, pose, zoom(1.05, false));
      const upAfter: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
      const tilt = bodyAngle(pose);
      expect(tilt).toBeLessThanOrEqual(lastTilt + 1e-6);
      // Heading, tilt and level each contribute at most one cap per notch.
      expect(angleBetween(upBefore, upAfter)).toBeLessThan(0.3 + 1e-9);
      lastTilt = tilt;
    }
    expect(lastTilt).toBeLessThan(0.02);
  });

  it('a recession norths the view but leaves a below-ceiling tilt alone (ruling 6)', () => {
    // GM/Cesium zoom-out is a lerp back to the off-body pose DISTRIBUTED over
    // the recession range: the tilt residual is measured against the
    // altitude-keyed ceiling, so where the ceiling is slack a notch out
    // changes tilt not at all — the tightening ceiling does the squeezing,
    // never a front-loaded nadir pull. Heading still decays by one capped
    // step (the north half is direction-blind). Tilt 0.7 keeps the
    // screen-centre ray off the body, so the settle pivots on the sub-eye
    // point and every readout stays on the fixture's axis.
    const start = poseAt([0, 0, 2], basisAt(1.2, 0.7));
    const out = apply(createSurfaceController(), start, zoom(1.5, false));

    const hOverR = Math.hypot(...eyeOf(out)) / R - 1;
    expect(maxTiltRad(hOverR)).toBeGreaterThan(0.7); // the premise: slack
    expect(northUpOffset(out)).toBeCloseTo(1.1, 9);
    expect(bodyAngle(out)).toBeCloseTo(0.7, 12);
  });

  it('a recession rides the ceiling down to exactly nadir at the disengage crossing', () => {
    // The C1 invariant (controller ruling): a zoom-authored recession clamps
    // tilt to `maxTiltRad(h/R)` as a WALL, so the return to level is
    // distributed strictly with zoom progress — no single notch turns more
    // than that notch's own ceiling delta — and the pose CROSSES disengage at
    // tilt 0, restoring the fold retarget's view-exactness. Tilt 1.5 is the
    // horizon-gazing surface pose; a capped decay provably reaches the
    // crossing 45° off nadir from here (measured), which is the snap this
    // test exists to forbid.
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAtTilt(1.5));
    let hOverR = 1;
    expect(maxTiltRad(hOverR)).toBeGreaterThan(1.5); // legal drag-authored tilt
    let guard = 0;
    while (hOverR <= SURFACE_REGIME.disengageHR && guard < 30) {
      const ceilingBefore = maxTiltRad(hOverR);
      const tiltBefore = bodyAngle(pose);
      pose = apply(c, pose, zoom(Math.exp(0.1), false)); // one default mouse notch
      hOverR = Math.hypot(...eyeOf(pose)) / R - 1;
      const ceilingDelta = Math.max(0, ceilingBefore - maxTiltRad(hOverR));
      expect(tiltBefore - bodyAngle(pose)).toBeLessThanOrEqual(ceilingDelta + 1e-9);
      guard += 1;
    }
    expect(hOverR).toBeGreaterThan(SURFACE_REGIME.disengageHR);
    expect(bodyAngle(pose)).toBeLessThan(1e-7);
  });

  it('a recession eases an INHERITED above-ceiling tilt by the decay, not the wall', () => {
    // The other half of the C1 ruling: excess the zoom did not author (this
    // pose ARRIVED 0.23 rad above the ceiling) is carried by the wall and
    // spent only by the capped decay — `SHARE·excess` here, since a factor-1
    // notch moves no altitude and so has zero ceiling delta of its own.
    // Heading 0 keeps the whole basis turn attributable to tilt.
    const c = createSurfaceController();
    const start = poseAt([0, 0, 3], basisAtTilt(1.4));
    const out = apply(c, start, zoom(1, false));

    const ceiling = maxTiltRad(2);
    expect(ceiling).toBeLessThan(1.4); // premise: genuinely above the band
    const excess = 1.4 - ceiling;
    const reduced = 1.4 - bodyAngle(out);
    expect(reduced).toBeCloseTo(0.25 * excess, 3);
    // Neither snapped to the ceiling in one tick, nor measured against nadir.
    expect(reduced).toBeLessThan(excess);
  });

  it('a receding staircase converges heading and tilt to the canonical framing', () => {
    // Tilt 0.6 keeps the screen-centre ray off the body, so the whole
    // staircase recedes on the sub-eye radial and the fixture's on-axis
    // readouts stay meaningful (the polar fixture's ENU breaks off-axis).
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAt(1.2, 0.6));
    let lastAngle = bodyAngle(pose);
    let lastNorth = northUpOffset(pose);
    for (let i = 0; i < 40; i += 1) {
      pose = apply(c, pose, zoom(1.2, false));
      const angle = bodyAngle(pose);
      const north = northUpOffset(pose);
      // Monotone to a small slack: the three settle rotations pivot on
      // different axes, so one can perturb another's readout by a hair.
      expect(angle).toBeLessThanOrEqual(lastAngle + 0.02);
      expect(north).toBeLessThanOrEqual(lastNorth + 0.02);
      lastAngle = angle;
      lastNorth = north;
    }
    expect(lastAngle).toBeLessThan(0.02);
    expect(lastNorth).toBeLessThan(0.02);
  });

  it('bleeds an arriving roll out over notches, never in one tick', () => {
    // R1 point 4: roll only ever ARRIVES from outside (a flyby, a legacy
    // pose) — gestures cannot create it — and it eases out on driven writes,
    // capped, rather than being discarded by a `(heading, tilt)` rebuild in
    // the tick that first touches the pose. 1.1 rad of roll at high tilt:
    // every notch turns the image by a bounded amount and the bank decays.
    const c = createSurfaceController();
    let pose = poseAt([0, 0, R * 2.952], rolledAber(basisAt(0.3, 1.2), 1.1));
    const upOf = (p: BodyFixedPose): Vec3 => [p.basisLocal[3], p.basisLocal[4], p.basisLocal[5]];
    // Bank: how far the right axis is out of the horizontal plane — 0 for any
    // roll-free pose, at every tilt.
    const bankOf = (p: BodyFixedPose): number => {
      const e = eyeOf(p);
      const m = Math.hypot(...e);
      const b = p.basisLocal;
      return Math.abs((b[0] * e[0] + b[1] * e[1] + b[2] * e[2]) / m);
    };

    // `bank ≈ sin(roll)·sin(tilt)`, so normalise by tilt: the proxy isolates
    // the roll decay from the tilt convergence that also shrinks the bank.
    const rollProxyOf = (p: BodyFixedPose): number => bankOf(p) / Math.sin(bodyAngle(p));
    expect(rollProxyOf(pose)).toBeGreaterThan(0.8); // the arrival really is banked
    let lastProxy = rollProxyOf(pose);
    for (let i = 0; i < 8; i += 1) {
      const before = upOf(pose);
      pose = apply(c, pose, zoom(1.05, false));
      expect(angleBetween(before, upOf(pose))).toBeLessThan(0.3 + 1e-9);
      const proxy = rollProxyOf(pose);
      expect(proxy).toBeLessThanOrEqual(lastProxy + 0.02);
      lastProxy = proxy;
    }
    // Eight capped notches take ~0.8 rad of the 1.1 rad bank out — eased, not
    // snapped (one tick of the old rebuild would have zeroed it).
    expect(lastProxy).toBeLessThan(0.4);
  });

  it('decays a heading near ±π toward north without crossing the seam', () => {
    // The one place a heading correction can genuinely pop (prior art Q3): a
    // residual taken the long way round the branch cut. The decay acts on
    // `atan2`'s (−π, π] residual, so ±3 rad steps to ±2.9 — one cap of turn,
    // not 5.1 the other way.
    // Tilt 0.6 keeps the screen-centre ray off the body (limb 0.34 from up
    // here), so the anchor is the sub-eye point and the heading step is the
    // exact cap about the fixture's own axis.
    const c = createSurfaceController();
    for (const psi of [3.0, -3.0]) {
      const start = poseAt([0, 0, R * 3], basisAt(psi, 0.6));
      const out = apply(c, start, zoom(1.5, false));
      expect(headingOnAxis(out)).toBeCloseTo(Math.sign(psi) * 2.9, 9);
    }
  });

  it('walks north back to screen-up on a dive, and never costs the cursor its pixel', () => {
    // "When zooming in, north is always up" (ruled), against the first ruling's
    // pixel lock. Both hold at once because the correction is a rigid rotation
    // of eye AND basis about the axis through the anchor and the body centre:
    // the anchor's camera-space coordinates are invariant under it (prior art
    // Q4c), so the picked point holds its pixel to the BIT while the eye's
    // azimuth about it walks north up.
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAt(1.2, 0.5));
    const anchor0 = pickThrough(pose, [50, 70])!;
    const upOf = (p: BodyFixedPose): Vec3 => [p.basisLocal[3], p.basisLocal[4], p.basisLocal[5]];

    let maxTurn = 0;
    for (let i = 0; i < 40; i += 1) {
      const before = pose;
      pose = apply(c, pose, zoom(0.8, false, [50, 70]));
      maxTurn = Math.max(maxTurn, angleBetween(upOf(before), upOf(pose)));
      // Pixel lock, every tick of the way down, not merely at the end.
      expect(angleBetween(pickThrough(pose, [50, 70])!, anchor0)).toBeLessThan(1e-12);
    }

    // North is up. (It gets WORSE on the first notch — 1.2 → 2.39 rad — because
    // the eye moving is itself what turns the ENU under a fixed basis; that is
    // the error this correction exists to unwind, and it does, monotonically.)
    expect(northUpOffset(pose)).toBeLessThan(0.02);
    // …and the view has settled looking straight down at the ground (ruled:
    // the approach converges to nadir alongside north, R1 point 3).
    expect(bodyAngle(pose)).toBeLessThan(0.02);
    // And no notch is a jump: heading, tilt and level are each capped per
    // tick, so even their composition stays a small bounded turn.
    expect(maxTurn).toBeLessThan(0.3 + 1e-12);
  });

  it('measures north-up off SCREEN-UP, not off the forward azimuth', () => {
    // A dive accumulates roll, and then the two part company: leaving the pole
    // with a nadir view, forward's azimuth reads 2.4 rad while north is 0.83
    // off screen-up. Nulling forward's takes this dive THROUGH north-up at
    // notch 14 and back out to 1.38 rad — the correction driving the error.
    // Starting at h/R 2 also keeps the recession-only guard honest: forward's
    // azimuth reads π up here while the ceiling is 1.17, so a direction-blind
    // heading clamp would fire on the way DOWN and unpin the cursor.
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 3], NADIR);
    const anchor0 = pickThrough(pose, [58, 50])!;
    let worst = 0;
    for (let i = 0; i < 34; i += 1) {
      pose = apply(c, pose, zoom(0.8, false, [58, 50]));
      // 1e-8 is `acos`'s floor near 0, i.e. the pick is bit-stable here too.
      expect(angleBetween(pickThrough(pose, [58, 50])!, anchor0)).toBeLessThan(1e-7);
      if (i > 18) worst = Math.max(worst, northUpOffset(pose));
    }
    expect(worst).toBeLessThan(0.15);
    expect(northUpOffset(pose)).toBeLessThan(0.02);
  });

  it('leaves a drag’s heading alone where a zoom notch would walk it north', () => {
    // Same pose, one write each: the zoom decays the heading toward north and
    // the drag does not (ruled: drags stay heading-free; only zoom writes
    // re-orient). The drag's own wall and level must be near-exact no-ops on
    // this roll-free, below-ceiling pose. Tilt 0.35 keeps the screen-centre
    // ray off the body (limb 0.31 from up here): the zoom's anchor is then
    // the sub-eye point, whose radial passes through the eye, making the
    // heading step the exact cap.
    const start = poseAt([0, 0, R * 3.25], basisAt(1.2, 0.35));

    const dragged = createSurfaceController();
    dragged.onGestureStart();
    expect(headingOnAxis(apply(dragged, start, drag('orbit', [50, 50], [50, 50])))).toBeCloseTo(
      1.2,
      12,
    );

    const zoomed = apply(createSurfaceController(), start, zoom(1.2, false));
    expect(headingOnAxis(zoomed)).toBeCloseTo(1.1, 12);
  });

  it('round-trips: dive at an off-centre point, then recede to the base pose', () => {
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAt(1.2, 0.5));

    for (let i = 0; i < 3; i += 1) pose = apply(c, pose, zoom(0.8, false, [50, 70]));

    for (let i = 0; i < 40; i += 1) pose = apply(c, pose, zoom(1.5, false, [50, 70]));

    // Body centred, north up, top-down — read in the ENU at wherever the dive
    // left the standpoint, since it no longer sits on the fixture's axis.
    const eye = eyeOf(pose);
    const mag = Math.hypot(...eye);
    const localUp: Vec3 = [eye[0] / mag, eye[1] / mag, eye[2] / mag];
    const eastRaw: Vec3 = [-localUp[1], localUp[0], 0];
    const eastLen = Math.hypot(...eastRaw);
    const east: Vec3 = [eastRaw[0] / eastLen, eastRaw[1] / eastLen, 0];
    const north: Vec3 = [
      localUp[1] * east[2] - localUp[2] * east[1],
      localUp[2] * east[0] - localUp[0] * east[2],
      localUp[0] * east[1] - localUp[1] * east[0],
    ];

    expect(mag / R - 1).toBeGreaterThan(SURFACE_REGIME.disengageHR);
    // The residual is the capped decay's geometric tail — under 0.6°, visually
    // nothing, but never exactly 0 the way the old hard clamp was.
    expect(bodyAngle(pose)).toBeLessThan(0.01);
    const upCol: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    expect(angleBetween(upCol, north)).toBeLessThan(0.01);
  });

  it('the tilt wall denies a gesture’s own excess but eases an inherited one', () => {
    // C1's tilt half, both sides of it. At the disengage altitude the ceiling
    // is 0. A look drag pitching up from nadir is simply not granted the tilt
    // (a wall the gesture presses against — continuous, proportional to the
    // hand, eye untouched); a pose that ARRIVED above the ceiling loses at
    // most one capped decay step per touch — never the 113°-in-one-tick snap.
    const boundary = R * (1 + SURFACE_REGIME.disengageHR);

    const walled = createSurfaceController();
    walled.onGestureStart();
    const fromNadir = poseAt([0, 0, boundary], NADIR);
    // [50, 10] misses the disc from up here, so the press latches free look.
    const pitched = apply(walled, fromNadir, drag('orbit', [50, 10], [50, -40]));
    expect(pitched.eyeRelAnchorM).toEqual(fromNadir.eyeRelAnchorM);
    expect(bodyAngle(pitched)).toBeLessThan(1e-9);

    const eased = createSurfaceController();
    eased.onGestureStart();
    const arrived = poseAt([0, 0, boundary], basisAtTilt(1.0));
    const touched = apply(eased, arrived, drag('orbit', [50, 10], [51, 10]));
    expect(bodyAngle(touched)).toBeGreaterThan(1.0 - 0.1 - 0.02);
    expect(bodyAngle(touched)).toBeLessThan(1.0);
  });

  it('a receding notch corrects a huge drag-authored heading by the cap, no more', () => {
    // The C1 regression fixture the shipped tests lacked: the clamp fixture
    // reached its limit with a 1e-5 rad residual, so an unbounded one-tick
    // correction (measured 153°/notch) was invisible. Park the heading near
    // 170° with a drag — legal, drags are heading-free — then recede once.
    const c = createSurfaceController();
    c.onGestureStart();
    let pose = poseAt([0, 0, R * 3.5], NADIR);
    // Ten horizontal right-drag (tilt-mode) steps, anchored at the sub-eye
    // pick: pure heading spin, tilt stays 0. The pixels walk monotonically —
    // each step's turn reads off `endPx − prevPixel`.
    for (let i = 0; i < 10; i += 1) {
      pose = apply(c, pose, drag('pan', [50 + 18.9 * i, 50], [50 + 18.9 * (i + 1), 50]));
    }
    c.onGestureEnd();
    expect(Math.abs(headingOnAxis(pose))).toBeGreaterThan(2.8);
    expect(bodyAngle(pose)).toBeLessThan(1e-9);

    const upBefore: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    const receded = apply(c, pose, zoom(1.5, false));
    const upAfter: Vec3 = [receded.basisLocal[3], receded.basisLocal[4], receded.basisLocal[5]];
    const turned = angleBetween(upBefore, upAfter);
    expect(turned).toBeGreaterThan(0.1 - 1e-9);
    expect(turned).toBeLessThan(0.1 + 1e-9);
    expect(Math.abs(headingOnAxis(receded))).toBeCloseTo(Math.abs(headingOnAxis(pose)) - 0.1, 9);
  });

  it('a curved pan cannot rotate the image — north survives the corner', () => {
    // I2: the rays-rigid rotation is exact for pixel-lock and, composed along
    // a curved path, accumulates holonomy roll — at nadir an image rotation
    // the user reads as north drifting. The per-step level transports the
    // step's entry heading, so the drift is corrected the step it appears.
    // Mid-latitude standpoint: over the pole the ENU itself spins under any
    // pan and "north" is not a usable readout.
    const lu: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const east: Vec3 = [0, 1, 0];
    const north: Vec3 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
    const basis: Mat3 = [...east, ...north, -lu[0], -lu[1], -lu[2]] as Mat3;
    const c = createSurfaceController();
    c.onGestureStart();
    let pose = poseAt([lu[0] * 2, lu[1] * 2, lu[2] * 2], basis);
    // Small steps, so each one's convergence/holonomy demand sits below the
    // cap and is corrected in full — the realistic pointer-move cadence.
    const path: Vec2[] = [[50, 50]];
    for (const [dx, dy] of [
      [2, 0],
      [2, 0],
      [2, 0],
      [0, -2],
      [0, -2],
      [-2, 0],
      [-2, 0],
      [-2, 0],
      [0, 2],
      [0, 2],
    ]) {
      const last = path[path.length - 1]!;
      path.push([last[0] + dx!, last[1] + dy!]);
    }
    for (let i = 1; i < path.length; i += 1) {
      pose = apply(c, pose, drag('orbit', path[i - 1]!, path[i]!));
      // North never leaves screen-up by more than a hair at ANY point of the
      // drag — not merely at closure, where holonomy could hide.
      expect(northUpOffset(pose)).toBeLessThan(0.02);
    }

    expect(northUpOffset(pose)).toBeLessThan(5e-3);
  });

  it('an ungestured drag never triggers enforcement (spec §12-R3)', () => {
    // No `onGestureStart`: this models a pose that has just landed in the
    // arm (a flyby, a tour keyframe) with no driven write yet — real arm
    // ENTRY is decided in `regimeArmFor`/the fold, which this test cannot
    // observe; it only pins that the controller's own `live === null`
    // pass-through, the one path an entering pose could reach this file
    // through, does not smuggle enforcement in.
    const c = createSurfaceController();
    const entered = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(Math.PI / 2));
    const untouched = apply(c, entered, drag('orbit', [50, 50], [60, 50]));

    expect(untouched).toBe(entered);
  });
});
