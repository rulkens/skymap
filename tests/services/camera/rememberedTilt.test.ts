/**
 * rememberedTilt — ruling 12 (Cesium-style): display tilt is the pure
 * function `remembered × bodyUpWeight(h/R)`; zoom never authors tilt, the
 * tilt handle writes the memory (un-mapped through the band weight so a
 * just-set display is a FIXED POINT of the zoom mapping), and the weight
 * reaching 0 at disengage lands the crossing at tilt 0 by construction.
 * Unit-radius closed-form fixtures, per the controller suite's convention.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { createSurfaceController } from '../../../src/services/camera/surfaceController';
import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { maxTiltRad } from '../../../src/utils/camera/maxTiltRad';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
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

afterEach(() => {
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
});

function poseAt(eyeM: Vec3, basisLocal: Mat3): BodyFixedPose {
  return { bodyId: 'earth', anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeM, basisLocal };
}

function zoom(factor: number): InputStep {
  return { kind: 'zoom', factor, duringGesture: false, cursorPx: null };
}

function tiltDrag(px: number): InputStep {
  // The secondary drag ('pan' step mode) is the tilt handle; drag DOWN tilts
  // the view up toward the horizon (GE convention).
  return { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 50 + px] };
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

function apply(
  c: ReturnType<typeof createSurfaceController>,
  pose: BodyFixedPose,
  step: InputStep,
): BodyFixedPose {
  return c.apply(pose, step, VIEWPORT, FOV, R, POLE);
}

/** Drag the tilt handle once and return the pose (remembered updates inside). */
function setTiltByDrag(
  c: ReturnType<typeof createSurfaceController>,
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
  c: ReturnType<typeof createSurfaceController>,
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
    const c = createSurfaceController();
    let pose = raiseTiltTo(c, poseAt([0, 0, 2.2], NADIR), 0.35);
    const set = tiltOf(pose);
    expect(set).toBeGreaterThan(0.35); // the handles really tilted the view
    expect(set).toBeLessThan(0.45); // …but the centre ray still hits ground
    expect(c.rememberedTiltRad()).toBeCloseTo(set, 9); // w = 1 below the band

    for (let i = 0; i < 8; i += 1) {
      pose = apply(c, pose, zoom(Math.exp(-0.1)));
      // A bounded geometric transient remains (the anchor-pivoted restore is
      // attenuated by the localUp chase, ≤ ~0.04 measured, easing back as the
      // range shrinks) — the assertion pins "never trends to nadir": pre-fix
      // the toNadir settle left 0.75⁸ ≈ 10% of the set tilt here.
      expect(Math.abs(tiltOf(pose) - set)).toBeLessThan(0.05);
    }
    expect(tiltOf(pose)).toBeGreaterThan(0.9 * set);
  });

  it('a never-tilted session dives at nadir throughout (default feel unchanged)', () => {
    const c = createSurfaceController();
    let pose = poseAt([0, 0, 2.2], NADIR);
    for (let i = 0; i < 15; i += 1) {
      pose = apply(c, pose, zoom(Math.exp(-0.1)));
      expect(tiltOf(pose)).toBeLessThan(1e-9);
    }
  });

  describe.each(['log', 'lin'] as const)('band mapping in %s space', (space) => {
    it('display tilt converges to remembered × w mid-window and crosses disengage at 0', () => {
      ORIENT_TUNING.blendSpace = space;
      const c = createSurfaceController();
      const set = tiltOf(setTiltByDrag(c, poseAt([0, 0, 2.2], NADIR), 20));
      expect(set).toBeGreaterThan(0.1);

      // Park at the window's geometric midpoint: the settle converges onto
      // the mapped display — the value DIFFERS between the two spaces, which
      // is what makes this a discriminating fixture, not a mirror.
      const hrMid = Math.sqrt(SURFACE_REGIME.engageHR * SURFACE_REGIME.disengageHR);
      let pose = poseAt([0, 0, 1 + hrMid], NADIR);
      for (let i = 0; i < 90; i += 1) pose = apply(c, pose, zoom(1));
      expect(tiltOf(pose)).toBeCloseTo(set * bodyUpWeight(hrMid), 6);

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
    // Isolate the tilt authority: the fixture's tilt drag leaves the camera
    // heading ≈ π (it orbits up the meridian and looks back), so with
    // north-up on, the heading/level settles would rotate the basis on the
    // notch and contaminate a 1e-9 tilt readout. The toggle gates exactly
    // those two (ruling 11) and leaves the tilt mapping live.
    ORIENT_TUNING.northUp = false;
    const c = createSurfaceController();
    const hr = (SURFACE_REGIME.engageHR + SURFACE_REGIME.disengageHR) / 2; // mid-window
    let pose = setTiltByDrag(c, poseAt([0, 0, 1 + hr], NADIR), 30);
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
    pose = apply(c, pose, zoom(1));
    expect(tiltOf(pose)).toBeCloseTo(display, 9);
  });

  it('the drag wall never erodes the band-mapped display (reconciliation 1)', () => {
    ORIENT_TUNING.blendSpace = 'lin';
    const c = createSurfaceController();
    let pose = raiseTiltTo(c, poseAt([0, 0, 2.2], NADIR), 1.5); // deep, ceiling slack
    const remembered = c.rememberedTiltRad();
    expect(remembered).toBeGreaterThan(1.5);

    // Recede into the window until the mapped display exceeds the drag ramp.
    let hr = 1.2;
    while (hr < 2.2) {
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
