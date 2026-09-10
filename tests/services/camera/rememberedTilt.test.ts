/**
 * rememberedTilt — ruling 12 (Cesium-style): display tilt is the pure
 * function `remembered × bodyUpWeight(h/R)`; zoom never authors tilt, the
 * tilt handle writes the memory (un-mapped through the band weight so a
 * just-set display is a FIXED POINT of the zoom mapping), and the weight
 * reaching 0 at or before disengage lands the crossing at tilt 0 by
 * construction.
 * Unit-radius closed-form fixtures, per the surfaceStep suite's convention.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { makeSurfaceDriver } from '../../helpers/camera/makeSurfaceDriver';
import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { maxTiltRad } from '../../../src/utils/camera/maxTiltRad';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
import { setTiltBand, TILT_BAND } from '../../../src/data/camera/tiltBand';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 1;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const POLE: Vec3 = [0, 0, 1];
/** Columns right | up | forward. Nadir: at +Z looking down, screen-up = +Y. */
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const BAND_AT_LOAD = { fullHR: TILT_BAND.fullHR, zeroHR: TILT_BAND.zeroHR };

afterEach(() => {
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
  setTiltBand(BAND_AT_LOAD);
});

function poseAt(eyeM: Vec3, basisLocal: Mat3): BodyFixedPose {
  return { bodyId: 'earth', anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeM, basisLocal };
}

function zoom(factor: number): InputStep {
  return { kind: 'zoom', factor, duringGesture: false, cursorPx: null };
}

function tiltDrag(px: number): InputStep {
  // The secondary drag ('pan' step mode) is the tilt handle; drag UP tilts
  // the view up toward the horizon (Google Maps convention, ruling 17).
  return { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 50 - px] };
}

function eyeOf(p: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = p;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}

function tiltOf(p: BodyFixedPose): number {
  const e = eyeOf(p);
  const m = Math.hypot(...e);
  const lu: Vec3 = [e[0] / m, e[1] / m, e[2] / m];
  const b = p.basisLocal;
  const vert = b[6] * lu[0] + b[7] * lu[1] + b[8] * lu[2];
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

function hrOf(p: BodyFixedPose): number {
  return Math.hypot(...eyeOf(p)) / R - 1;
}

/**
 * Half-weight standpoint of the BLEND's own band — geometric, because the log
 * mapping puts half weight there. Read live: narrowing `TILT_BAND` off the
 * regime edges must move these fixtures, or they discriminate nothing.
 */
function midBandHR(): number {
  return Math.sqrt(TILT_BAND.fullHR * TILT_BAND.zeroHR);
}

function apply(
  c: ReturnType<typeof makeSurfaceDriver>,
  pose: BodyFixedPose,
  step: InputStep,
): BodyFixedPose {
  return c.apply(pose, step, VIEWPORT, FOV, R, POLE);
}

/** Drag the tilt handle once and return the pose (remembered updates inside). */
function setTiltByDrag(
  c: ReturnType<typeof makeSurfaceDriver>,
  pose: BodyFixedPose,
  px: number,
): BodyFixedPose {
  c.onGestureStart();
  const out = apply(c, pose, tiltDrag(px));
  c.onGestureEnd();
  return out;
}

/**
 * Raise tilt to ≥ `wantRad` the way a user would: a tilt drag to bring the
 * horizon up, then look steps from a sky pixel (1:1 tilt authoring; both
 * handles write the memory). Anchored orbiting alone saturates well short of
 * large tilts — the eye's localUp chases the rotation.
 */
function raiseTiltTo(
  c: ReturnType<typeof makeSurfaceDriver>,
  pose: BodyFixedPose,
  wantRad: number,
): BodyFixedPose {
  c.onGestureStart();
  let out = apply(c, pose, tiltDrag(20));
  c.onGestureEnd();
  let guard = 0;
  while (tiltOf(out) < wantRad && guard < 6) {
    c.onGestureStart(); // fresh latch: the pixel walk restarts from the top
    for (let px = 5; px < 90 && tiltOf(out) < wantRad; px += 5) {
      out = apply(c, out, { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + 5] });
    }
    c.onGestureEnd();
    guard += 1;
  }
  return out;
}

describe('remembered tilt (ruling 12)', () => {
  it('zoom-in never authors tilt: a user-set tilt survives a dive unchanged', () => {
    const c = makeSurfaceDriver();
    let pose = raiseTiltTo(c, poseAt([0, 0, 1 + TILT_BAND.fullHR], NADIR), 0.35);
    const set = tiltOf(pose);
    expect(set).toBeGreaterThan(0.35); // the handles really tilted the view
    // …but the centre ray still hits ground: under the horizon angle asin(R/d).
    expect(set).toBeLessThan(Math.asin(1 / (1 + TILT_BAND.fullHR)));
    expect(c.rememberedTiltRad()).toBeCloseTo(set, 9); // w = 1 at/below fullHR

    for (let i = 0; i < 8; i += 1) {
      pose = apply(c, pose, zoom(Math.exp(-0.1)));
      // A bounded geometric transient remains (the anchor-pivoted restore is
      // attenuated by the localUp chase, ≤ ~0.04, easing back as the range
      // shrinks) — the assertion pins "never trends to nadir": a toNadir
      // settle would instead decay this to 0.75⁸ ≈ 10% of the set tilt here.
      expect(Math.abs(tiltOf(pose) - set)).toBeLessThan(0.05);
    }
    expect(tiltOf(pose)).toBeGreaterThan(0.9 * set);
  });

  it('a never-tilted session dives at nadir throughout (default feel unchanged)', () => {
    const c = makeSurfaceDriver();
    let pose = poseAt([0, 0, 2.2], NADIR);
    for (let i = 0; i < 15; i += 1) {
      pose = apply(c, pose, zoom(Math.exp(-0.1)));
      expect(tiltOf(pose)).toBeLessThan(1e-9);
    }
  });

  describe.each(['log', 'lin'] as const)('band mapping in %s space', (space) => {
    it('display tilt converges to remembered × w mid-window and crosses disengage at 0', () => {
      ORIENT_TUNING.blendSpace = space;
      const c = makeSurfaceDriver();
      const tilted = setTiltByDrag(c, poseAt([0, 0, 1 + TILT_BAND.fullHR / 2], NADIR), 20);
      const set = tiltOf(tilted);
      expect(set).toBeGreaterThan(0.1);

      // Recede from the just-set pose (weight 1 there, so display = memory) to
      // the tilt band's geometric midpoint: the target's own move RIDES in
      // full, so the display lands on the mapping without spending any decay
      // — which is what makes this survive the settle being priced per unit of
      // zoom. The value DIFFERS between the two spaces, which is what makes
      // this a discriminating fixture, not a mirror.
      const hrMid = midBandHR();
      let pose = tilted;
      expect(bodyUpWeight(hrOf(pose))).toBeCloseTo(1, 12);
      while (hrOf(pose) < hrMid) pose = apply(c, pose, zoom(Math.exp(0.02)));
      expect(tiltOf(pose)).toBeCloseTo(set * bodyUpWeight(hrOf(pose)), 6);

      // Recede from the converged state: the ride tracks the mapping exactly,
      // so the first pose past disengage carries tilt 0 — the invariant the
      // scene-aligned bake and the fold retarget stand on.
      let hr = hrMid;
      let guard = 0;
      while (hr <= SURFACE_REGIME.disengageHR && guard < 30) {
        pose = apply(c, pose, zoom(Math.exp(0.1)));
        hr = hrOf(pose);
        guard += 1;
      }
      expect(hr).toBeGreaterThan(SURFACE_REGIME.disengageHR);
      expect(tiltOf(pose)).toBeLessThan(1e-7);
    });
  });

  it('mid-window tilt-set un-maps through w — the just-set display is a fixed point', () => {
    ORIENT_TUNING.blendSpace = 'lin';
    // Isolate the tilt authority: with north-up on, the heading/level
    // settles would rotate the basis on the notch and contaminate a 1e-9
    // tilt readout. The toggle gates exactly those two (ruling 11) and
    // leaves the tilt mapping live.
    ORIENT_TUNING.northUp = false;
    const c = makeSurfaceDriver();
    const hr = midBandHR();
    let pose = setTiltByDrag(c, poseAt([0, 0, 1 + hr], NADIR), 10);
    const display = tiltOf(pose);
    expect(display).toBeGreaterThan(0.1);
    // Un-mapped through w at the POST-drag standpoint (the drag orbits the
    // anchor, so the altitude moved with it) — and w is genuinely < 1 here,
    // so remembered > display: the discriminating half of the rule.
    const w = bodyUpWeight(hrOf(pose));
    expect(w).toBeGreaterThan(0.5);
    expect(w).toBeLessThan(0.9);
    expect(c.rememberedTiltRad()).toBeCloseTo(display / w, 6);

    // Zoom must not move a just-set tilt (the rule that FORCED the un-map:
    // remembered = display would erode the set value on the very next notch).
    // A ±notch DITHER, not a factor-1 notch: the settle spends only what the
    // zoom spends, so a notch that moves nowhere cannot erode anything.
    pose = apply(c, pose, zoom(Math.exp(0.1)));
    pose = apply(c, pose, zoom(Math.exp(-0.1)));
    // Loose against the anchored pair's own walk (~1e-3, F6), tight against
    // the erosion `remembered = display` would spend: devPre = display·(1−w).
    expect(Math.abs(tiltOf(pose) - display)).toBeLessThan(0.005);
  });

  it('the drag wall never erodes the band-mapped display (reconciliation 1)', () => {
    ORIENT_TUNING.blendSpace = 'lin';
    // The reconciliation only BITES where the mapped display outruns the drag
    // ramp, and the ceiling ramp spans (tiltFullHR, disengageHR): a blend band
    // strictly inside it — the 2026-09-10 defaults — is under the ceiling
    // everywhere, so the wall is unreachable there. Widen the (session-tunable)
    // band onto the regime edges, the widest the cap allows, to reach it.
    setTiltBand({ fullHR: SURFACE_REGIME.engageHR, zeroHR: SURFACE_REGIME.disengageHR });
    const c = makeSurfaceDriver();
    let pose = raiseTiltTo(c, poseAt([0, 0, 1.1], NADIR), 2.8); // deep, ceiling slack
    const remembered = c.rememberedTiltRad();
    expect(remembered).toBeGreaterThan(2.8);

    // Recede into the window until the mapped display exceeds the drag ramp.
    // The ceiling ramp is wider than the up-weight ramp even at this band, so
    // the premise below only holds close to engage, not mid-band.
    let hr = 0;
    const target = SURFACE_REGIME.engageHR * 1.1;
    while (hr < target) {
      pose = apply(c, pose, zoom(Math.exp(0.1)));
      hr = hrOf(pose);
    }
    const display = tiltOf(pose);
    expect(display).toBeCloseTo(remembered * bodyUpWeight(hr), 2);
    expect(display).toBeGreaterThan(maxTiltRad(hr) + 0.2); // premise: above the ramp

    // A tilt drag here may not ADD past the mapped ceiling — and the old
    // wall's decay of "excess" must not eat the legitimate mapped display
    // (that decay was a 0.25·excess ≈ 0.08 cut on this fixture).
    c.onGestureStart();
    pose = apply(c, pose, tiltDrag(1));
    c.onGestureEnd();
    expect(Math.abs(tiltOf(pose) - display)).toBeLessThan(0.01);
  });
});
