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
import { anchoredZoomStep } from '../../../src/utils/camera/anchoredZoomStep';
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
 * the +Z axis — the same closed form `ceilingEnforcedPose` reconstructs, so
 * these fixtures can place a pose at an exact tilt without going through a
 * gesture drag to get there.
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

  it('a zoom-out re-levels against the new local vertical', () => {
    // Comfortably tilted at a wide-open ceiling; a factor-2 zoom-out (the
    // per-tick maximum) doubles the ALTITUDE — the anchor is the sub-eye
    // surface point (§12-R4), so h/R 1 → 2 — past the point where the
    // ceiling has narrowed below the held tilt, and the very same tick must
    // re-level: no separate untilt tween runs afterward.
    const c = createSurfaceController();
    const theta = 2.4;
    const start = poseAt([0, 0, R * 2], basisAtTilt(theta));
    const zoomedOut = apply(c, start, zoom(2, false));

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

  it('returns the framing to base as it recedes, by ceiling not by blend', () => {
    // The acceptance property for §12-R4b, and the shape it is built from: the
    // ceiling is a function of ALTITUDE, so the framing converges because the
    // eye climbs, not because a per-notch fraction fires. That distinction is
    // observable — down here, where `maxTiltRad` is slack, a notch changes
    // neither angle at all, which no blend implementation can reproduce.
    const c = createSurfaceController();
    const tilt = 0.5;
    const psi = 1.2;
    const start = poseAt([0, 0, R * 2], basisAt(psi, tilt));

    const out = apply(c, start, zoom(1.5, false, [75, 50]));
    expect(Math.hypot(...eyeOf(out))).toBeGreaterThan(Math.hypot(...eyeOf(start)));
    expect(bodyAngle(out)).toBeCloseTo(tilt, 12);
    expect(headingOnAxis(out)).toBeCloseTo(psi, 12);

    // Climbing tightens it: each notch lands at exactly `min(held, ceiling)`,
    // neither angle ever grows, and both are 0 by the disengage boundary.
    let pose = start;
    let lastAngle = bodyAngle(pose);
    let lastHeading = Math.abs(headingOnAxis(pose));
    for (let i = 0; i < 12; i += 1) {
      pose = apply(c, pose, zoom(1.5, false, [75, 50]));
      const ceiling = maxTiltRad(Math.hypot(...eyeOf(pose)) / R - 1);
      const angle = bodyAngle(pose);
      const heading = Math.abs(headingOnAxis(pose));
      expect(angle).toBeCloseTo(Math.min(lastAngle, ceiling), 9);
      expect(heading).toBeCloseTo(Math.min(lastHeading, ceiling), 9);
      lastAngle = angle;
      lastHeading = heading;
    }
    expect(Math.hypot(...eyeOf(pose)) / R - 1).toBeGreaterThan(SURFACE_REGIME.disengageHR);
    expect(lastAngle).toBeCloseTo(0, 12);
    expect(lastHeading).toBeCloseTo(0, 12);
  });

  it('turns the image by no more than the residual it corrects', () => {
    // Why the clamp is a DELTA rotation and not a `(heading, tilt)` rebuild: a
    // rebuild has no roll term, so the tick that crosses a limit answers the
    // violation — however small — by ALSO discarding the pose's roll. Here 0.8
    // rad of roll would leave in one tick alongside a 0.27 rad heading
    // correction. Turning by the residual leaves roll where it was.
    const c = createSurfaceController();
    // A small notch at h/R ≈ 2, where the ceiling has just closed past the
    // held heading: the residual to correct is ~0.1 rad while the pose carries
    // 1.2 rad of roll, so the two are impossible to confuse.
    const start = poseAt([0, 0, R * 2.952], rolledAber(basisAt(1.2, 0.4), 1.2));
    const upOf = (p: BodyFixedPose): Vec3 => [p.basisLocal[3], p.basisLocal[4], p.basisLocal[5]];

    const out = apply(c, start, zoom(1.05, false));
    const residual = 1.2 - maxTiltRad(Math.hypot(...eyeOf(out)) / R - 1);
    expect(residual).toBeGreaterThan(0.02); // the clamp really did fire
    expect(residual).toBeLessThan(0.3); // …and by much less than the roll

    // The whole basis turned about the local vertical by the residual, so
    // screen-up moved by at most that. A rebuild moves it by ~0.85 here.
    expect(angleBetween(upOf(start), upOf(out))).toBeLessThanOrEqual(residual + 1e-12);
    expect(angleBetween(upOf(start), upOf(out))).toBeGreaterThan(0);
  });

  it('clamps a heading near ±π without crossing the seam', () => {
    // The one place a heading correction can genuinely pop (prior art Q3): a
    // residual taken the long way round the branch cut. Clamping the MAGNITUDE
    // of `atan2`'s (−π, π] keeps the sign, so ±3 rad lands on ±ceiling —
    // 0.17 rad of turn, not 5.1 the other way.
    const c = createSurfaceController();
    for (const psi of [3.0, -3.0]) {
      const start = poseAt([0, 0, R * 3], basisAt(psi, 0.3));
      const out = apply(c, start, zoom(1.5, false));
      const ceiling = maxTiltRad(Math.hypot(...eyeOf(out)) / R - 1);
      expect(headingOnAxis(out)).toBeCloseTo(Math.sign(psi) * ceiling, 9);
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
    // And no notch is a jump: the correction is capped per tick.
    expect(maxTurn).toBeLessThan(0.1 + 1e-12);
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

  it('re-aims a dive for north only, never for centring', () => {
    // The dive is still the cursor's: it does NOT pull the body back to view
    // centre (that is the retreat's job, §12-R4b), so the body sliding off
    // centre as the eye dives at an off-axis point survives the north-up work.
    const c = createSurfaceController();
    const start = poseAt([0, 0, 2], basisAt(1.2, 0.5));

    const dived = apply(c, start, zoom(0.5, false, [50, 70]));

    expect(bodyAngle(dived)).toBeGreaterThan(bodyAngle(start) + 0.03);
  });

  it('leaves a drag’s heading alone where the ceiling would clamp a zoom', () => {
    // Same pose, same altitude, one write each: the zoom is north-clamped and
    // the drag is not (ruled). T17's C1 pins that the clamp preserves the
    // heading it MEASURES; this pins which writes get a heading limit at all.
    // h/R = 2.25, where the ceiling (0.90) already bites the held heading of
    // 1.2 — so the drag is a real test of the exemption, not of slack.
    const start = poseAt([0, 0, R * 3.25], basisAt(1.2, 0.1));
    expect(maxTiltRad(2.25)).toBeLessThan(1.2);

    const dragged = createSurfaceController();
    dragged.onGestureStart();
    expect(headingOnAxis(apply(dragged, start, drag('orbit', [50, 50], [50, 50])))).toBeCloseTo(
      1.2,
      12,
    );

    const zoomed = apply(createSurfaceController(), start, zoom(1.2, false));
    const ceiling = maxTiltRad(Math.hypot(...eyeOf(zoomed)) / R - 1);
    expect(ceiling).toBeLessThan(1.2); // the clamp has something to do here
    expect(headingOnAxis(zoomed)).toBeCloseTo(ceiling, 9);
  });

  it('round-trips: dive at an off-centre point, then recede to the base pose', () => {
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2], basisAt(1.2, 0.5));

    const offCentreBefore = bodyAngle(pose);
    for (let i = 0; i < 3; i += 1) pose = apply(c, pose, zoom(0.8, false, [50, 70]));
    expect(bodyAngle(pose)).toBeGreaterThan(offCentreBefore);

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
    // 1e-8 is `acos`'s floor near 0 (the dot product is 1 to the ulp), not slack.
    expect(bodyAngle(pose)).toBeLessThan(1e-7);
    const upCol: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    expect(angleBetween(upCol, north)).toBeLessThan(1e-7);
  });

  it('the pose reaching the disengage boundary has tilt 0', () => {
    // maxTiltRad(disengageHR) === 0 (pinned in maxTiltRad.test.ts), so ANY
    // held tilt at that altitude clamps all the way to nadir — the Q4
    // invariant a world-arm pivot pin relies on at the seam.
    const c = createSurfaceController();
    const start = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(1.0));
    const settled = apply(c, start, zoom(1, false));

    const forward: Vec3 = [settled.basisLocal[6], settled.basisLocal[7], settled.basisLocal[8]];
    expect(forward[0]).toBeCloseTo(0, 12);
    expect(forward[1]).toBeCloseTo(0, 12);
    expect(forward[2]).toBeCloseTo(-1, 12);
  });

  it('enforcement never moves the eye', () => {
    // A real (non-degenerate) zoom, not `factor: 1` — the eye MUST move, and
    // by exactly what `anchoredZoomStep` alone would put it at (the same
    // screen-centre pick `zoomStep` runs, reconstructed independently here),
    // so "bit-identical" is pinned by the property, not by the factor.
    const start = poseAt([0, 0, R * (1 + SURFACE_REGIME.disengageHR)], basisAtTilt(3.0));
    const factor = 0.6;

    const centerPx: Vec2 = [VIEWPORT[0] / 2, VIEWPORT[1] / 2];
    const centerRay = cursorRayBodyLocal(start, centerPx, VIEWPORT, FOV);
    const roots = raySphereRoots(centerRay.originM, centerRay.dir, [0, 0, 0], R);
    const anchorM: Vec3 | null =
      roots !== null && roots[0] > 0
        ? [
            centerRay.originM[0] + centerRay.dir[0] * roots[0],
            centerRay.originM[1] + centerRay.dir[1] * roots[0],
            centerRay.originM[2] + centerRay.dir[2] * roots[0],
          ]
        : null;
    const unenforced = anchoredZoomStep(start, factor, anchorM, R);

    const c = createSurfaceController();
    const settled = apply(c, start, zoom(factor, false));

    expect(settled.anchorLocalM).toEqual(unenforced.anchorLocalM);
    expect(settled.eyeRelAnchorM).toEqual(unenforced.eyeRelAnchorM);
    // Orientation DID get clamped — 3.0 rad of held tilt exceeds the ceiling
    // at the post-zoom altitude too — so the eye match above is the
    // ceiling's doing, not a no-op write.
    expect(settled.basisLocal).not.toEqual(start.basisLocal);
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
