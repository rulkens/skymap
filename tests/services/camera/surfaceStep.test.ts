/**
 * surfaceStep — the body arm's gestures over its memory value (spec §6).
 *
 * Fixtures are a unit-radius body with the eye a couple of radii out and a 90°
 * FOV, so every pick, angle and rotation below is a closed form written out by
 * hand: at Earth magnitudes the same assertions would be blind to everything
 * but a total failure.
 */

import { describe, it, expect } from 'vitest';

import {
  noteBody,
  surfaceStep,
  EMPTY_SURFACE_MEMORY,
} from '../../../src/services/camera/surfaceStep';
import { makeSurfaceDriver } from '../../helpers/camera/makeSurfaceDriver';
import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { ORIENT_DECAY } from '../../../src/data/camera/orientDecay';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../src/data/camera/cameraTuning';
import { cursorRayBodyLocal } from '../../../src/utils/camera/cursorRayBodyLocal';
import { eyeFrameOf } from '../../../src/utils/camera/eyeFrameOf';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { SurfaceMemory } from '../../../src/@types/camera/SurfaceMemory';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { TILT_GAIN } from '../../../src/data/camera/tiltGain';

const R = 1;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2; // tan(FOV/2) = 1 — one NDC unit is one eye-distance

/** Columns right | up | forward. Nadir: at +Z looking down, screen-up = +Y. */
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
const POLE: Vec3 = [0, 0, 1];
const CTX = {
  viewportPx: VIEWPORT,
  fovYRad: FOV,
  bodyRadiusM: R,
  sceneUpLocal: POLE,
  tuning: TUNING,
};

/** The settle's per-notch cap, priced in the notch's log-zoom (ruling 2026-09-10). */
const capOf = (factor: number): number =>
  ORIENT_DECAY.capRadPerLogZoom * Math.abs(Math.log(factor));

/** The TILT band's geometric midpoint: `bodyUpWeight` blends in LOG h/R, so
 * this is where the weight is exactly ½ whatever the edges are set to. */
const BAND_MID_HR = Math.sqrt(TUNING.tiltFullHR * TUNING.tiltZeroHR);

/** Parked at the midpoint, so `bodyUpWeight` is strictly in (0, 1) and the
 * un-map shows up in the numbers rather than as an identity. */
const IN_BAND: BodyFixedPose = {
  bodyId: 'earth',
  anchorLocalM: [0, 0, 0],
  eyeRelAnchorM: [0, 0, R * (1 + BAND_MID_HR)],
  basisLocal: NADIR,
};

/** The secondary drag ('pan' step mode) is the tilt handle; drag UP tilts up. */
function tiltDrag(px: number): InputStep {
  return { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 50 - px] };
}

function tiltOf(p: BodyFixedPose): number {
  const e = eyeOf(p);
  const m = Math.hypot(...e);
  const b = p.basisLocal;
  const vert = (b[6] * e[0] + b[7] * e[1] + b[8] * e[2]) / m;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

function hrOf(p: BodyFixedPose): number {
  return Math.hypot(...eyeOf(p)) / R - 1;
}

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
 * the +Z axis — the arm's canonical roll-free basis, so these fixtures
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
 * Escapes to the up column at nadir, as `refAzimuthOf` does: forward's
 * horizontal part is `sin(tilt)`, so at tilt 0 only `up` carries an azimuth
 * at all and `atan2` on forward would read pure rounding noise.
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

/**
 * One step through the driver with the fixture's viewport / FOV / radius.
 * `sceneUpLocal` defaults to the body pole, which makes the band blend
 * reduce to the pure body ENU at every altitude.
 */
function apply(
  driver: ReturnType<typeof makeSurfaceDriver>,
  pose: BodyFixedPose,
  step: InputStep,
  sceneUpLocal: Vec3 = [0, 0, 1],
): BodyFixedPose {
  return driver.apply(pose, step, VIEWPORT, FOV, R, sceneUpLocal);
}

describe('surfaceStep', () => {
  it('latches the mode at gesture start and keeps it for the gesture', () => {
    // From h/R 0.1 the disc fills a nadir view, so the limb is on-screen only
    // from a tilted pose: at tilt 0.8 the press at y = 32.31 px grazes it
    // (|ray·normal| = 0.03), so the gesture strafes. Dragging down toward the
    // disc's interior, where the incidence is steep (0.39 at y = 40), must
    // NOT promote it to an anchored pan: strafe only ever translates, so a
    // re-decided mode shows up as a rotated basis.
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const start = poseAt([0, 0, 1.1], basisAtTilt(0.8));
    let pose = apply(c, start, drag('orbit', [50, 32.31], [50, 40]));
    pose = apply(c, pose, drag('orbit', [50, 40], [50, 45]));

    expect(pose.basisLocal).toEqual(start.basisLocal);
    // Not vacuous: the strafe did move the camera.
    expect(eyeOf(pose)[1]).not.toBe(0);
  });

  it('ignores a trackpad inertial burst after pointerup (FW-C)', () => {
    const c = makeSurfaceDriver();
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
    const c = makeSurfaceDriver();
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
    // Anchor = the screen-centre pick [0,0,1]; the eye orbits it by heading
    // −ψ about the local up (NEGATED per ruling 15 — a deliberate feel
    // inversion vs the orbit drag), THEN by tilt +α about the yawed east —
    // drag-UP tilts the view up toward the horizon (Google Maps' right-drag
    // convention, ruling 17, superseding ruling 16's GE sign). Closed form:
    // eye = anchor + R(q1·east, +α)·R(up, −ψ)·(eye − anchor)
    //     = [−sinψ·sinα, −cosψ·sinα, 1 + cosα].
    // The fixed-axis order leaves x at 0 — that is the whole difference.
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const psi = (20 / 100) * FOV;
    const alpha = (10 / 100) * FOV * TILT_GAIN;
    const pose = apply(c, poseAt([0, 0, 2], NADIR), drag('pan', [50, 50], [70, 40]));

    const eye = eyeOf(pose);
    expect(eye[0]).toBeCloseTo(-Math.sin(psi) * Math.sin(alpha), 12);
    expect(eye[1]).toBeCloseTo(-Math.cos(psi) * Math.sin(alpha), 12);
    expect(eye[2]).toBeCloseTo(1 + Math.cos(alpha), 12);
    // The basis turned with the eye: right ends on the yawed east.
    expect(pose.basisLocal.slice(0, 3)).toEqual([
      expect.closeTo(Math.cos(psi), 12),
      expect.closeTo(-Math.sin(psi), 12),
      expect.closeTo(0, 12),
    ]);
  });

  it('leaves the eye bit-identical under free-look while the heading turns', () => {
    // Pitched 30° up at 0.1 R, so the camera's own up is NOT the local
    // vertical: yawing about the wrong one of the two rolls the horizon.
    const c = makeSurfaceDriver();
    const cos30 = Math.cos(Math.PI / 6);
    const start = poseAt([0, 0, 1.1], [1, 0, 0, 0, -0.5, cos30, 0, cos30, 0.5]);
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
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const tilted = apply(c, poseAt([0, 0, 1.05], NADIR), drag('pan', [50, 50], [50, -83.3]));

    expect(Math.hypot(...eyeOf(tilted))).toBeCloseTo(surfaceFloorM(R), 12);
    // Radial push, so the view direction is untouched — no jerk to rotate out.
    expect(tilted.basisLocal).not.toEqual(NADIR);
  });

  it('re-picks the zoom anchor after the eye overshoots its tangent plane', () => {
    // Drag UP — the tilt-raising direction (ruling 17) — until the eye is
    // BELOW the picked anchor's tangent plane: the anchor is now behind the
    // horizon, so zooming toward it would carry the camera backwards through
    // it (C §6.7). The pose starts already tilted: a net-raising drag ends
    // ABOVE its press pixel by construction, and from nadir every geometry
    // that overshoots the tangent plane leaves that end pixel looking at sky
    // (scanned) — starting at tilt 1.1 with a low press keeps ground under
    // the drag's last pixel. The anchor is the same ray-sphere pick
    // `latchFor` makes, computed here rather than hand-solved.
    // The off-viewport end is on purpose: the recognizer binds move/up to
    // `window` (the iOS implicit-capture fix), so dragging past the canvas
    // edge is an ordinary case the arm must handle.
    const start = poseAt([0, 0, 2], basisAtTilt(1.1));
    const startRay = cursorRayBodyLocal(start, [60, 85], VIEWPORT, FOV);
    const t0 = raySphereRoots(startRay.originM, startRay.dir, [0, 0, 0], R)![0];
    const anchor: Vec3 = [
      startRay.originM[0] + startRay.dir[0] * t0,
      startRay.originM[1] + startRay.dir[1] * t0,
      startRay.originM[2] + startRay.dir[2] * t0,
    ];

    const c = makeSurfaceDriver();
    c.onGestureStart();
    const tilted = apply(c, start, drag('pan', [60, 85], [60, -20]));
    const eye = eyeOf(tilted);
    expect(eye[0] * anchor[0] + eye[1] * anchor[1] + eye[2] * anchor[2]).toBeLessThan(1);

    // Which anchor a tick used is readable off the range it scaled: the step
    // takes `|eye − A|` to `f·|eye − A|`, and the approach's north-up rotation
    // is about an axis through A, so that distance survives it untouched. The
    // fresh screen-centre pick satisfies the law; the latched anchor does not.
    // The gesture is live, so the re-pick goes through the drag's last pixel.
    const fresh = pickThrough(tilted, [60, -20])!;
    expect(fresh).not.toBeNull();
    // A gentle notch on purpose: the settle is priced in the notch, so a
    // factor-0.5 one spends ~0.7 rad about the anchor and drives the eye onto
    // the standoff floor, whose radial push is what would break the law below.
    const F = 0.9;
    const zoomedEye = eyeOf(apply(c, tilted, zoom(F, true)));
    const rangeTo = (a: Vec3, e: Vec3): number => Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);

    expect(rangeTo(fresh, zoomedEye)).toBeCloseTo(F * rangeTo(fresh, eye), 12);
    expect(rangeTo(anchor, zoomedEye)).not.toBeCloseTo(F * rangeTo(anchor, eye), 6);
    expect(angleBetween(fresh, anchor)).toBeGreaterThan(0.5);
  });

  it('anchors an at-rest wheel on the cursor’s surface pick, not screen centre', () => {
    // From [0,0,2] the ray through x = 75 px (ndc 0.5, tan(FOV/2) = 1) is
    // [0.5,0,−1]/√1.25 and hits the unit sphere at exactly [0.6,0,0.8] — metres
    // apart from [0,0,1], the screen-centre pick a pixel-less wheel falls back to.
    const c = makeSurfaceDriver();
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
    // Recession converges toward the canonical framing through the SAME
    // capped decay the approach uses — from 2.4 rad of held tilt no notch may
    // turn the view by more than the per-axis cap sum, and the staircase still
    // lands on nadir. Clamping the whole excess in one tick instead would
    // produce a 153°-class snap from large residuals.
    const c = makeSurfaceDriver();
    let pose = poseAt([0, 0, 2], basisAtTilt(2.4));
    let lastTilt = bodyAngle(pose);
    for (let i = 0; i < 120; i += 1) {
      const upBefore: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
      pose = apply(c, pose, zoom(1.05, false));
      const upAfter: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
      const tilt = bodyAngle(pose);
      expect(tilt).toBeLessThanOrEqual(lastTilt + 1e-6);
      // Heading, tilt and level each contribute at most one cap per notch.
      expect(angleBetween(upBefore, upAfter)).toBeLessThan(3 * capOf(1.05) + 1e-9);
      lastTilt = tilt;
    }
    expect(lastTilt).toBeLessThan(0.02);
  });

  it('a recession norths the view and decays an un-remembered tilt, capped (ruling 12)', () => {
    // The tilt 0.7 was CONSTRUCTED, never set through the tilt handle, so the
    // memory still reads 0 and the display eases toward it by the capped
    // share — the arrival-pose discipline, never a snap. Heading decays its
    // own cap (direction-blind). Tilt 0.7 keeps the screen-centre ray off
    // the body, so the settle recedes on the sub-eye radial and every
    // readout stays on the fixture's axis.
    const start = poseAt([0, 0, 2], basisAt(1.2, 0.7));
    const out = apply(makeSurfaceDriver(), start, zoom(1.5, false));

    expect(northUpOffset(out)).toBeCloseTo(1.2 - capOf(1.5), 9);
    expect(bodyAngle(out)).toBeCloseTo(0.7 - capOf(1.5), 9);
  });

  it('an engaged recession blends the reference up onto the scene up by disengage (round 5)', () => {
    // The engaged settle's reference is the band blend — pure body ENU
    // at/below engage, the scene up at disengage — so the pose the fold bakes
    // is scene-aligned by construction; without the blend the settle norths
    // toward the body pole for the whole recession, and disengage bakes that
    // as spurious scene-frame roll where the world-arm authority is zero.
    // Scene up sits 0.41 rad off the pole (the Earth-vs-ecliptic magnitude)
    // toward +y — PERPENDICULAR to the standpoint's meridian — so the two
    // references' horizontal projections genuinely disagree and the
    // assertions discriminate.
    const sceneUp: Vec3 = [0, Math.sin(0.41), Math.cos(0.41)];
    const normalizeV = (v: Vec3): Vec3 => {
      const m = Math.hypot(...v);
      return [v[0] / m, v[1] / m, v[2] / m];
    };
    const crossV = (a: Vec3, b: Vec3): Vec3 => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const azimuthVs = (pose: BodyFixedPose, ref: Vec3): number => {
      const e = eyeOf(pose);
      const lu = normalizeV(e);
      const eastRaw = crossV(ref, lu);
      // The production fallback: ref ∥ localUp (the polar fixture axis).
      const east = Math.hypot(...eastRaw) > 1e-9 ? normalizeV(eastRaw) : ([1, 0, 0] as Vec3);
      const north = crossV(lu, east);
      const up: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
      const vert = up[0] * lu[0] + up[1] * lu[1] + up[2] * lu[2];
      const horiz: Vec3 = [up[0] - lu[0] * vert, up[1] - lu[1] * vert, up[2] - lu[2] * vert];
      return Math.atan2(
        horiz[0] * east[0] + horiz[1] * east[1] + horiz[2] * east[2],
        horiz[0] * north[0] + horiz[1] * north[1] + horiz[2] * north[2],
      );
    };

    // Mid-latitude standpoint (the pole standpoint is itself the degeneracy —
    // `pole_h ≡ 0` there, so "body north" is the arbitrary fallback; the
    // locus tests own that). Nadir view converged on the pole-ENU north.
    const lu: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const north: Vec3 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
    const forward: Vec3 = [-lu[0], -lu[1], -lu[2]];
    const right = crossV(forward, north);
    const basis: Mat3 = [...right, ...north, ...forward] as Mat3;

    // Both cadences tested: default e^0.10 and brisk e^0.24 (folded notches).
    // Off the singular neighbourhood the ride is exact and the bake lands
    // under the 1e-2 bar at either pacing.
    // Start at h/R 0.1, below engage, so the recession rides the whole band.
    for (const lnf of [0.1, 0.24]) {
      const c = makeSurfaceDriver();
      let pose = poseAt([lu[0] * 1.1, lu[1] * 1.1, lu[2] * 1.1], basis);
      expect(Math.abs(azimuthVs(pose, [0, 0, 1]))).toBeLessThan(1e-12); // converged deep
      let hr = 0.1;
      let guard = 0;
      while (hr <= TUNING.disengageHR && guard < 30) {
        pose = apply(c, pose, zoom(Math.exp(lnf), false), sceneUp);
        hr = Math.hypot(...eyeOf(pose)) / R - 1;
        guard += 1;
      }

      // Screen-up sits on the SCENE up's meridian, not the body pole's: the
      // ride tracked the reference swing (deviation decayed within the run).
      expect(Math.abs(azimuthVs(pose, sceneUp))).toBeLessThan(1e-2);
      expect(Math.abs(azimuthVs(pose, [0, 0, 1]))).toBeGreaterThan(0.05);
    }
  });

  it('the blend flip on the pole→sceneUp locus is continuity-bounded, then converges (round 6)', () => {
    // A standpoint ON the arc between the body pole and the scene up sees the
    // two horizontal projections anti-parallel, so the blended north flips π
    // as the weight crosses their ratio (~mid-band). Without a continuity
    // bound the ride would apply that flip in a single notch (a full 180°
    // turn); treating the excess as unauthored instead holds every notch to
    // the ride bound, and parking in-band afterwards converges fully.
    const sceneUp: Vec3 = [Math.sin(0.41), 0, Math.cos(0.41)];
    const lu: Vec3 = [Math.sin(0.205), 0, Math.cos(0.205)]; // ON the arc, midway
    const eastRaw: Vec3 = [-lu[1], lu[0], 0];
    const east: Vec3 = [
      eastRaw[0] / Math.hypot(...eastRaw),
      eastRaw[1] / Math.hypot(...eastRaw),
      0,
    ];
    const north: Vec3 = [
      lu[1] * east[2] - lu[2] * east[1],
      lu[2] * east[0] - lu[0] * east[2],
      lu[0] * east[1] - lu[1] * east[0],
    ];
    const forward: Vec3 = [-lu[0], -lu[1], -lu[2]];
    const right: Vec3 = [
      forward[1] * north[2] - forward[2] * north[1],
      forward[2] * north[0] - forward[0] * north[2],
      forward[0] * north[1] - forward[1] * north[0],
    ];
    const basis: Mat3 = [...right, ...north, ...forward] as Mat3;
    const upOf = (p: BodyFixedPose): Vec3 => [p.basisLocal[3], p.basisLocal[4], p.basisLocal[5]];

    // A sub-eye notch scales the ALTITUDE by its factor, so every leg below is
    // a log-h/R span over the live band edges: start a fixed fraction under
    // engage, ride to the upper half of the band, then cross out of it.
    const LN_NOTCH = 0.03;
    const startHR = TUNING.tiltFullHR * 0.6;
    const belowNotches = 4; // e^0.12 < 1/0.6 ⇒ still under fullHR when they end
    const rideToHR = Math.sqrt(BAND_MID_HR * TUNING.disengageHR);
    const bandNotches = Math.ceil(
      Math.log(rideToHR / (startHR * Math.exp(LN_NOTCH * belowNotches))) / LN_NOTCH,
    );

    const c = makeSurfaceDriver();
    const d0 = 1 + startHR;
    let pose = poseAt([lu[0] * d0, lu[1] * d0, lu[2] * d0], basis);
    let maxTurn = 0;
    // The pole's horizontal at this standpoint — anti-parallel to the scene
    // up's, which is what makes the locus a flip rather than a sweep.
    const poleVert = lu[2];
    const poleHoriz: Vec3 = [-lu[0] * poleVert, -lu[1] * poleVert, 1 - lu[2] * poleVert];
    const notch = (): void => {
      const before = upOf(pose);
      pose = apply(c, pose, zoom(Math.exp(LN_NOTCH), false), sceneUp);
      maxTurn = Math.max(maxTurn, angleBetween(before, upOf(pose)));
    };

    // Still below the band's full edge, where the weight is 1: the ride holds the BODY
    // pole's north and only swings off it inside the band. Pinning the weight
    // to the scene up instead walks away from the pole at a full decay cap per
    // notch from the first one.
    for (let i = 0; i < belowNotches; i += 1) notch();
    expect(angleBetween(upOf(pose), poleHoriz)).toBeLessThan(0.01);

    // Up to `rideToHR`, through the w = ½ flip at the band's geometric
    // midpoint, stopping short of disengage so the park below has band left.
    for (let i = 0; i < bandNotches; i += 1) notch();

    // The flip's excess is unauthored, so the ride bound alone caps the turn
    // here — the decay caps act on the deviation the ride leaves behind, and
    // do not add to it on this locus.
    expect(maxTurn).toBeGreaterThan(0.05); // the flip really was crossed
    expect(maxTurn).toBeLessThanOrEqual(ORIENT_DECAY.rideBoundRad + 1e-9);

    // Park in-band ⇒ full convergence. A park is a DITHER, not a hold: the
    // settle only spends what the zoom spends (ruling 2026-09-10), so the
    // altitude — and with it the blend target — returns to itself each pair
    // while the deviation keeps draining.
    for (let i = 0; i < 60; i += 1) {
      pose = apply(c, pose, zoom(Math.exp(LN_NOTCH), false), sceneUp);
      pose = apply(c, pose, zoom(Math.exp(-LN_NOTCH), false), sceneUp);
    }
    // …then cross: the bake is on the scene up, the flip fully spent. One notch
    // past the edge, so the assertion below is not sitting on it.
    const crossNotches = Math.ceil(Math.log(TUNING.disengageHR / rideToHR) / 0.1) + 1;
    for (let i = 0; i < crossNotches; i += 1)
      pose = apply(c, pose, zoom(Math.exp(0.1), false), sceneUp);
    const e = eyeOf(pose);
    expect(Math.hypot(...e) / R - 1).toBeGreaterThan(TUNING.disengageHR);
    const luEnd: Vec3 = [e[0] / Math.hypot(...e), e[1] / Math.hypot(...e), e[2] / Math.hypot(...e)];
    const sVert = sceneUp[0] * luEnd[0] + sceneUp[1] * luEnd[1] + sceneUp[2] * luEnd[2];
    const sHoriz: Vec3 = [
      sceneUp[0] - luEnd[0] * sVert,
      sceneUp[1] - luEnd[1] * sVert,
      sceneUp[2] - luEnd[2] * sVert,
    ];
    const up = upOf(pose);
    expect(angleBetween(up, sHoriz)).toBeLessThan(1e-2);
  });

  it('near (not on) the locus, the projection blend stays continuous and lands the bake (round 6)', () => {
    // 10° off the arc the horizontal projections never cancel, so the target
    // sweeps fast but finitely and a plain recession converges without
    // parking (contrast the on-arc case above, which needs it).
    const sceneUp: Vec3 = [Math.sin(0.41), 0, Math.cos(0.41)];
    const offRad = 0.175; // 10°
    const lu: Vec3 = [
      Math.sin(0.205) * Math.cos(offRad),
      Math.sin(offRad),
      Math.cos(0.205) * Math.cos(offRad),
    ];
    const luN = Math.hypot(...lu);
    const lun: Vec3 = [lu[0] / luN, lu[1] / luN, lu[2] / luN];
    const eastRaw: Vec3 = [-lun[1], lun[0], 0];
    const eN = Math.hypot(...eastRaw);
    const east: Vec3 = [eastRaw[0] / eN, eastRaw[1] / eN, 0];
    const north: Vec3 = [
      lun[1] * east[2] - lun[2] * east[1],
      lun[2] * east[0] - lun[0] * east[2],
      lun[0] * east[1] - lun[1] * east[0],
    ];
    const forward: Vec3 = [-lun[0], -lun[1], -lun[2]];
    const right: Vec3 = [
      forward[1] * north[2] - forward[2] * north[1],
      forward[2] * north[0] - forward[0] * north[2],
      forward[0] * north[1] - forward[1] * north[0],
    ];
    const basis: Mat3 = [...right, ...north, ...forward] as Mat3;

    const c = makeSurfaceDriver();
    // Start half an engage-edge down, so the recession rides the whole band;
    // the guard is that ride's length in e^0.1 altitude notches, plus slack.
    const startHR = TUNING.engageHR * 0.5;
    const guardMax = Math.ceil(Math.log(TUNING.disengageHR / startHR) / 0.1) + 2;
    const d0 = 1 + startHR;
    let pose = poseAt([lun[0] * d0, lun[1] * d0, lun[2] * d0], basis);
    let hr = startHR;
    let guard = 0;
    while (hr <= TUNING.disengageHR && guard < guardMax) {
      pose = apply(c, pose, zoom(Math.exp(0.1), false), sceneUp);
      hr = Math.hypot(...eyeOf(pose)) / R - 1;
      guard += 1;
    }

    const e = eyeOf(pose);
    const luEnd: Vec3 = [e[0] / Math.hypot(...e), e[1] / Math.hypot(...e), e[2] / Math.hypot(...e)];
    const sVert = sceneUp[0] * luEnd[0] + sceneUp[1] * luEnd[1] + sceneUp[2] * luEnd[2];
    const sHoriz: Vec3 = [
      sceneUp[0] - luEnd[0] * sVert,
      sceneUp[1] - luEnd[1] * sVert,
      sceneUp[2] - luEnd[2] * sVert,
    ];
    const up: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    // ~0.17 rad: the bounded ride's tail through the fast sweep — blending
    // the raw AXES instead would leave ~1 rad here (a 101° single-notch whip,
    // unrecoverable in the remaining band notches).
    expect(angleBetween(up, sHoriz)).toBeLessThan(0.25);
  });

  it('a recession decays an arrival tilt toward the band target by the CAP, never a snap', () => {
    // Excess the zoom did not author (this pose ARRIVED at tilt 1.4;
    // remembered is 0) eases toward the band target by the capped share —
    // 1.4 exceeds the notch's cap, so exactly one cap comes off. The
    // remembered tilt is 0, so the band target is 0 at every altitude and the
    // notch moves it not at all — the decay is isolated even though the notch
    // must now carry real zoom to buy any. Heading 0 keeps the whole basis
    // turn attributable to tilt. (Driven recessions cross disengage at
    // exactly 0 because the band weight does — pinned in rememberedTilt.test.ts.)
    const c = makeSurfaceDriver();
    const start = poseAt([0, 0, 3], basisAtTilt(1.4));
    const out = apply(c, start, zoom(1.5, false));

    const reduced = 1.4 - bodyAngle(out);
    expect(reduced).toBeCloseTo(capOf(1.5), 3);
  });

  it('a receding staircase converges heading and tilt to the canonical framing', () => {
    // Tilt 0.6 keeps the screen-centre ray off the body, so the whole
    // staircase recedes on the sub-eye radial and the fixture's on-axis
    // readouts stay meaningful (the polar fixture's ENU breaks off-axis).
    const c = makeSurfaceDriver();
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
    const c = makeSurfaceDriver();
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
    for (let i = 0; i < 17; i += 1) {
      const before = upOf(pose);
      pose = apply(c, pose, zoom(1.05, false));
      expect(angleBetween(before, upOf(pose))).toBeLessThan(3 * capOf(1.05) + 1e-9);
      const proxy = rollProxyOf(pose);
      expect(proxy).toBeLessThanOrEqual(lastProxy + 0.02);
      lastProxy = proxy;
    }
    // 0.83 of log-zoom's worth of capped notches takes ~0.8 rad of the 1.1 rad
    // bank out — eased, not snapped (a naive `(heading, tilt)` rebuild would
    // zero it in one tick).
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
    const c = makeSurfaceDriver();
    for (const psi of [3.0, -3.0]) {
      const start = poseAt([0, 0, R * 3], basisAt(psi, 0.6));
      const out = apply(c, start, zoom(1.5, false));
      expect(headingOnAxis(out)).toBeCloseTo(Math.sign(psi) * (3.0 - capOf(1.5)), 9);
    }
  });

  it('walks north back to screen-up on a dive, and never costs the cursor its pixel', () => {
    // "When zooming in, north is always up" (ruled), against the first ruling's
    // pixel lock. Both hold at once because the correction is a rigid rotation
    // of eye AND basis about the axis through the anchor and the body centre:
    // the anchor's camera-space coordinates are invariant under it (prior art
    // Q4c), so the picked point holds its pixel to the BIT while the eye's
    // azimuth about it walks north up.
    const c = makeSurfaceDriver();
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
    expect(maxTurn).toBeLessThan(3 * capOf(0.8) + 1e-12);
  });

  it('measures north-up off SCREEN-UP, not off the forward azimuth', () => {
    // A dive accumulates roll, and then the two part company: leaving the pole
    // with a nadir view, forward's azimuth reads 2.4 rad while north is 0.83
    // off screen-up. Nulling forward's takes this dive THROUGH north-up at
    // notch 14 and back out to 1.38 rad — the correction driving the error.
    // Starting at h/R 2 also keeps the recession-only guard honest: forward's
    // azimuth reads π up here, so a direction-blind heading clamp would fire
    // on the way DOWN and unpin the cursor.
    const c = makeSurfaceDriver();
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
    // re-orient). The drag's own level must be a near-exact no-op on this
    // roll-free pose. Tilt 0.35 keeps the screen-centre ray off the body (limb 0.31 from up here): the zoom's anchor is then
    // the sub-eye point, whose radial passes through the eye, making the
    // heading step the exact cap.
    const start = poseAt([0, 0, R * 3.25], basisAt(1.2, 0.35));

    const dragged = makeSurfaceDriver();
    dragged.onGestureStart();
    expect(headingOnAxis(apply(dragged, start, drag('orbit', [50, 50], [50, 50])))).toBeCloseTo(
      1.2,
      12,
    );

    const zoomed = apply(makeSurfaceDriver(), start, zoom(1.2, false));
    expect(headingOnAxis(zoomed)).toBeCloseTo(1.2 - capOf(1.2), 12);
  });

  it('round-trips: dive at an off-centre point, then recede to the base pose', () => {
    const c = makeSurfaceDriver();
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

    expect(mag / R - 1).toBeGreaterThan(TUNING.disengageHR);
    // The residual is the capped decay's geometric tail — under 0.6°, visually
    // nothing, but never exactly 0 the way a hard clamp would land it.
    expect(bodyAngle(pose)).toBeLessThan(0.01);
    const upCol: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    expect(angleBetween(upCol, north)).toBeLessThan(0.01);
  });

  it('the tilt CEILING is DEAD: a look drag at the disengage altitude is granted its tilt (ruling B1)', () => {
    // The deleted wall test's own fixture, inverted: `maxTiltRad` was exactly 0
    // here, so this gesture was denied outright; one authority over tilt now
    // (ruling 10) grants it in full, and this fails again the moment any
    // altitude ramp returns to the drag path. From the boundary the disc fills
    // the 90° view (limb at 1.02 tan units), so the sky press sits just past
    // the top edge — pixels are only ray coordinates here — and latches look.
    const boundary = R * (1 + TUNING.disengageHR);
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const pitched = apply(c, poseAt([0, 0, boundary], NADIR), drag('orbit', [50, -10], [50, -60]));
    expect(bodyAngle(pitched)).toBeGreaterThan(0.5);
  });

  it('the tilt floor is DEAD: a lowering drag at tilt 0 moves nothing (rulings 14+17)', () => {
    // Drag-DOWN is the tilt-lowering direction (ruling 17). At tilt exactly 0
    // the through-zero budget is 0, so the whole gesture — TILT_GAIN, 200 px
    // of travel — maps to zero rotation and the pose comes back untouched
    // (full-pose byte bar, not an epsilon on tilt).
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const start = poseAt([0, 0, 2], NADIR);
    const out = apply(c, start, drag('pan', [50, 50], [50, 250]));
    expect(out.eyeRelAnchorM).toEqual(start.eyeRelAnchorM);
    expect(out.anchorLocalM).toEqual(start.anchorLocalM);
    expect(out.basisLocal).toEqual(start.basisLocal);
    expect(c.rememberedTiltRad()).toBe(0); // the memory stays clean too
  });

  it('from exactly 0 a horizon-ward drag tilts immediately, on the near side (ruling 17)', () => {
    // The floor must not lock nadir: Drag-UP is the tilt-up direction
    // (ruling 17), so from tilt exactly 0 it produces tilt at once — on the
    // NEAR side (eye y POSITIVE here), not through nadir to the far side.
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const h = TUNING.tiltFullHR; // the band's full edge: w = 1
    const alpha = (10 / 100) * FOV * TILT_GAIN;
    const out = apply(c, poseAt([0, 0, 1 + h], NADIR), drag('pan', [50, 50], [50, 40]));
    const eye = eyeOf(out);
    expect(eye[0]).toBeCloseTo(0, 12);
    expect(eye[1]).toBeCloseTo(-h * Math.sin(alpha), 12);
    expect(eye[2]).toBeCloseTo(1 + h * Math.cos(alpha), 12);
    // The anchor pivot drags the local up along: the displayed tilt is the
    // eye's angle of the centre–anchor–eye triangle, atan2(sin α, h/R + cos α)
    // (exactly α/2 at h = R), and the memory follows it (w = 1 here).
    const displayed = Math.atan2(Math.sin(alpha), h + Math.cos(alpha));
    expect(bodyAngle(out)).toBeCloseTo(displayed, 9);
    expect(c.rememberedTiltRad()).toBeCloseTo(displayed, 9);
  });

  it('lowering drags land the floor exactly and never cross nadir (rulings 14+17)', () => {
    // The toward-zero budget is the EXACT through-zero rotation — larger
    // than the tilt itself, by the anchor-pivot attenuation — so tilt and
    // memory walk monotonically to 0 and everything is still once there;
    // bounding by the unsigned tilt readout instead would let both bounce
    // on repeated lowering drags instead of settling.
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const h = 0.1; // h/R 0.1: in-band
    let pose = apply(c, poseAt([0, 0, 1 + h], NADIR), drag('pan', [50, 50], [50, 10]));
    c.onGestureEnd();
    expect(eyeOf(pose)[1]).toBeLessThan(0); // near side — the raise never crossed
    const raised = (40 / 100) * FOV * TILT_GAIN;
    expect(bodyAngle(pose)).toBeCloseTo(Math.atan2(Math.sin(raised), h + Math.cos(raised)), 9);

    let lastTilt = bodyAngle(pose);
    let lastMem = c.rememberedTiltRad();
    for (let i = 0; i < 4; i += 1) {
      c.onGestureStart();
      pose = apply(c, pose, drag('pan', [50, 50], [50, 80]));
      c.onGestureEnd();
      const tilt = bodyAngle(pose);
      const mem = c.rememberedTiltRad();
      expect(tilt).toBeLessThanOrEqual(lastTilt + 1e-12);
      expect(mem).toBeLessThanOrEqual(lastMem + 1e-12);
      expect(mem).toBeGreaterThanOrEqual(0);
      // No crossing echo: screen-up never dips below the horizon plane the
      // way the far-side swing flipped it.
      const e = eyeOf(pose);
      const m = Math.hypot(...e);
      const b = pose.basisLocal;
      expect((b[3] * e[0] + b[4] * e[1] + b[5] * e[2]) / m).toBeGreaterThan(-1e-9);
      lastTilt = tilt;
      lastMem = mem;
    }
    expect(lastTilt).toBeLessThan(1e-7);
    expect(lastMem).toBeLessThan(1e-7);

    // At the floor a further lowering drag spends a budget of exactly 0.
    const before = eyeOf(pose);
    c.onGestureStart();
    const out = apply(c, pose, drag('pan', [50, 50], [50, 80]));
    c.onGestureEnd();
    const after = eyeOf(out);
    expect(
      Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]),
    ).toBeLessThan(1e-9);
    expect(bodyAngle(out)).toBeLessThan(1e-7);
  });

  it('at the floor a mixed drag keeps its heading component live (ruling 14)', () => {
    // Only the tilt-LOWERING component (drag-down, ruling 17) dies at the
    // floor; the same gesture's horizontal delta still orbits heading about
    // the anchor up.
    const c = makeSurfaceDriver();
    c.onGestureStart();
    const start = poseAt([0, 0, 2], NADIR);
    const out = apply(c, start, drag('pan', [50, 50], [70, 70]));
    const psi = (20 / 100) * FOV; // the heading half of the drag, unscaled
    // Heading applied: the eye orbited about the anchor's vertical…
    // (+psi: the handle's heading is NEGATED per ruling 15.)
    expect(Math.hypot(...eyeOf(out))).toBeCloseTo(2, 12);
    const b = out.basisLocal;
    expect(Math.atan2(b[3], b[4])).toBeCloseTo(psi, 9);
    // …while the tilt component died: still exactly nadir.
    expect(bodyAngle(out)).toBeLessThan(1e-12);
  });

  it('a receding notch corrects a huge drag-authored heading by the cap, no more', () => {
    // Park the heading near 170° with a drag (legal — drags are heading-free)
    // so an unbounded one-tick correction would be a large, visible turn
    // rather than lost in a small residual, then recede once.
    const c = makeSurfaceDriver();
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
    expect(turned).toBeGreaterThan(capOf(1.5) - 1e-9);
    expect(turned).toBeLessThan(capOf(1.5) + 1e-9);
    expect(Math.abs(headingOnAxis(receded))).toBeCloseTo(
      Math.abs(headingOnAxis(pose)) - capOf(1.5),
      9,
    );
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
    const c = makeSurfaceDriver();
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
    // observe; it only pins that the arm's own pointer-up
    // pass-through, the one path an entering pose could reach this file
    // through, does not smuggle enforcement in.
    const c = makeSurfaceDriver();
    const entered = poseAt([0, 0, R * (1 + TUNING.disengageHR)], basisAtTilt(Math.PI / 2));
    const untouched = apply(c, entered, drag('orbit', [50, 50], [60, 50]));

    expect(untouched).toBe(entered);
  });

  it('a drag with the pointer up is declined', () => {
    // FW-C: a trackpad burst can deliver a drag run after the pointerup.
    const up = surfaceStep(EMPTY_SURFACE_MEMORY, IN_BAND, tiltDrag(15), CTX);
    expect(up.pose).toBe(IN_BAND);
    expect(up.next).toBe(EMPTY_SURFACE_MEMORY);

    const down = surfaceStep(
      { ...EMPTY_SURFACE_MEMORY, gesture: 'down' },
      IN_BAND,
      tiltDrag(15),
      CTX,
    );
    expect(tiltOf(down.pose)).toBeGreaterThan(0.1);
  });

  it('a tilt drag writes the un-mapped memory and returns a new object', () => {
    const prev = Object.freeze({
      ...EMPTY_SURFACE_MEMORY,
      gesture: 'down' as const,
      memoryBodyId: 'earth',
    });
    const { pose, next } = surfaceStep(prev, IN_BAND, tiltDrag(15), CTX);

    expect(next).not.toBe(prev);
    expect(prev.rememberedTiltRad).toBe(0);
    // Ruling 12: the memory is the display tilt un-mapped through the band
    // weight, so it is strictly LARGER than what the drag put on screen.
    const w = bodyUpWeight(hrOf(pose), TUNING);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    expect(next.rememberedTiltRad).toBeCloseTo(tiltOf(pose) / w, 9);
    expect(next.gesture).toMatchObject({ mode: 'tilt', prevPixel: [50, 35] });
  });

  it('noteBody wipes the tilt on a different body and keeps it on null', () => {
    const seeded: SurfaceMemory = {
      ...EMPTY_SURFACE_MEMORY,
      rememberedTiltRad: 0.4,
      memoryBodyId: 'earth',
    };

    expect(noteBody(seeded, null)).toEqual(seeded);
    expect(noteBody(seeded, 'earth').rememberedTiltRad).toBe(0.4);
    // Ruling 18: a body SWITCH wipes the memory, never restores it per body.
    expect(noteBody(seeded, 'mars')).toEqual({
      ...seeded,
      rememberedTiltRad: 0,
      memoryBodyId: 'mars',
    });
    // Nothing noted yet is not a switch: the first note adopts the body.
    expect(noteBody({ ...seeded, memoryBodyId: null }, 'mars').rememberedTiltRad).toBe(0.4);
  });

  it('a zoom step never authors tilt', () => {
    const prev: SurfaceMemory = {
      ...EMPTY_SURFACE_MEMORY,
      rememberedTiltRad: 0.4,
      memoryBodyId: 'earth',
    };
    const step: InputStep = { kind: 'zoom', factor: 0.5, duringGesture: false, cursorPx: null };
    const { pose, next } = surfaceStep(prev, IN_BAND, step, CTX);

    expect(hrOf(pose)).toBeLessThan(hrOf(IN_BAND));
    expect(next).toEqual(prev);
  });
});

describe('the zoom settle is priced per unit of zoom, not per step (F1, ruling 2026-09-10)', () => {
  // Standpoint 45° off the pole so the body ENU is non-degenerate, screen-up
  // 150° off north, nadir-looking with no tilt memory — so the only thing a
  // recession notch can move is the heading residual.
  const LAT_RAD = Math.PI / 4;
  const LU: Vec3 = [Math.sin(LAT_RAD), 0, Math.cos(LAT_RAD)];
  const HEADING_RAD = (150 * Math.PI) / 180;

  function headedPose(): BodyFixedPose {
    const v = LU[2]; // pole · localUp, pole = +Z
    const north = normalize3([-LU[0] * v, -LU[1] * v, 1 - LU[2] * v] as Vec3);
    const east: Vec3 = [
      north[1] * LU[2] - north[2] * LU[1],
      north[2] * LU[0] - north[0] * LU[2],
      north[0] * LU[1] - north[1] * LU[0],
    ];
    const c = Math.cos(HEADING_RAD);
    const sn = Math.sin(HEADING_RAD);
    const up: Vec3 = [
      north[0] * c + east[0] * sn,
      north[1] * c + east[1] * sn,
      north[2] * c + east[2] * sn,
    ];
    const forward: Vec3 = [-LU[0], -LU[1], -LU[2]];
    const right: Vec3 = [
      forward[1] * up[2] - forward[2] * up[1],
      forward[2] * up[0] - forward[0] * up[2],
      forward[0] * up[1] - forward[1] * up[0],
    ];
    const m = R * (1 + BAND_MID_HR);
    return {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [LU[0] * m, LU[1] * m, LU[2] * m],
      basisLocal: [...right, ...up, ...forward] as Mat3,
    };
  }

  /** Screen-up's azimuth off north in the pure body ENU — the settle's residual. */
  function headingOf(pose: BodyFixedPose): number {
    return eyeFrameOf(pose, 1, POLE)!.azimuthRad;
  }

  function recede(factor: number, steps: number): number {
    const driver = makeSurfaceDriver();
    let pose = headedPose();
    const step: InputStep = { kind: 'zoom', factor, duringGesture: false, cursorPx: null };
    for (let i = 0; i < steps; i += 1) pose = driver.apply(pose, step, VIEWPORT, FOV, R, POLE);
    return headingOf(pose);
  }

  const TRACKPAD = 1.004; // deltaY +4, one high-resolution trackpad event
  const STEPS = 24; // 0.4 s at 60 Hz — the reported "instant" reset

  it('24 trackpad events keep the heading they started with', () => {
    // Per STEP (the defect) each of these spent 25 % of the residual and the
    // 0.1 rad cap: 90 % of the heading gone in under half a second, with the
    // altitude barely moved. Priced per unit of zoom, they spend 0.096 rad.
    const before = Math.abs(headingOf(headedPose()));
    expect(Math.abs(recede(TRACKPAD, STEPS)) / before).toBeGreaterThan(0.9);
  });

  it('one frame can spend only the zoom the fold clamp lets it (no whip)', () => {
    // 20 wheel events in one frame — the measured trackpad flick — fold to a
    // factor of e², which `spentZoomFactor` clamps to 2 before the eye moves.
    // Pricing the settle off the FOLD instead would north the view in that one
    // frame, harder than the per-step defect this whole change removes.
    const u = Math.log(2);
    const before = headingOf(headedPose());
    const after = recede(Math.exp(2), 1);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(ORIENT_DECAY.capRadPerLogZoom * u + 1e-9);
  });

  it('the same total zoom decays the same however it is delivered', () => {
    // The composition property, through the real driver: what makes a
    // trackpad and a mouse converge on the same heading at the same altitude.
    const total = TRACKPAD ** STEPS;
    expect(recede(total, 1)).toBeCloseTo(recede(TRACKPAD, STEPS), 8);
    expect(recede(Math.sqrt(total), 2)).toBeCloseTo(recede(total, 1), 8);
  });
});
