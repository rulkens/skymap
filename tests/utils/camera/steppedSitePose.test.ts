/**
 * steppedSitePose — the turntable's feel: the rate law, the sign convention and
 * the floors holding through a sequence a user could actually drive.
 */

import { describe, it, expect } from 'vitest';

import { steppedSitePose } from '../../../src/utils/camera/steppedSitePose';
import { ORBIT_MAX_RAD_PER_PX } from '../../../src/utils/camera/orbitRadPerPixel';
import { SITE_RUNG } from '../../../src/data/camera/siteRung';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { MeshBody } from '../../../src/@types/scene/MeshBody';
import type { SitePose } from '../../../src/@types/camera/SitePose';

const ROVER: MeshBody = {
  id: 'fixture-rover',
  label: 'Fixture rover',
  boundingRadiusM: 2.479,
  albedo: [1, 1, 1],
  meshKey: 'fixture',
  standoffRadii: 2,
};

const VIEWPORT = [800, 600] as const;
const FOV_Y_RAD = 0.8;

const POSE: SitePose = {
  siteId: 'fixture-rover' as BodyId,
  headingRad: 0,
  elevationRad: 0.4,
  rangeM: 50,
};

function drag(dx: number, dy: number): InputStep {
  return { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [100 + dx, 100 + dy] };
}

function step(pose: SitePose, input: InputStep): SitePose {
  return steppedSitePose(pose, input, ROVER, VIEWPORT, FOV_Y_RAD);
}

describe('steppedSitePose', () => {
  it('drags at the ground rate — k radii out, k times the pixel angle', () => {
    // 1:1 ground tracking, as the body arm's drag does it: a pixel spans
    // `range · fovY / heightPx` of the bounding sphere, so at k radii it turns
    // k · 1.3333e-3 rad. Hand-computed at k = 3: 4.0e-3 rad/px, 60 px → 0.24.
    const near = step({ ...POSE, rangeM: 3 * ROVER.boundingRadiusM }, drag(60, 30));
    expect(near.headingRad).toBeCloseTo(0.24, 12);
    expect(near.elevationRad).toBeCloseTo(POSE.elevationRad + 0.12, 12);
    expect(near.rangeM).toBe(3 * ROVER.boundingRadiusM);
  });

  it('holds the flat ceiling once the ground rate outruns it', () => {
    // k = 10 asks 1.3333e-2 rad/px and gets ORBIT_MAX_RAD_PER_PX: 60 px → 0.3.
    const far = step({ ...POSE, rangeM: 10 * ROVER.boundingRadiusM }, drag(60, 0));
    expect(far.headingRad).toBeCloseTo(60 * ORBIT_MAX_RAD_PER_PX, 12);
  });

  it('drag signs: +Δx raises the heading and +Δy raises the eye', () => {
    const out = step(POSE, drag(60, 30));
    expect(out.headingRad).toBeGreaterThan(POSE.headingRad);
    expect(out.elevationRad).toBeGreaterThan(POSE.elevationRad);
  });

  it('a lowering drag at the range floor reaches the ground, not the ceiling', () => {
    // The rung EXISTS to get under its host's standoff, so only the site's own
    // floor may bind here: fold the host's in and `eyeFloorM / rangeM > 1` at
    // close range, `asin` saturates, and every pose pins at the ceiling —
    // top-down, tilt dead, which is what the eye check reported.
    const rangeFloorM = ROVER.standoffRadii * ROVER.boundingRadiusM;
    const out = step({ ...POSE, rangeM: rangeFloorM, elevationRad: 1.2 }, drag(0, -600));
    expect(out.elevationRad).toBeCloseTo(
      Math.asin((SITE_RUNG.eyeFloorBoundingRadii * ROVER.boundingRadiusM) / rangeFloorM),
      12,
    );
  });

  it('keeps the eye above the ground through a mixed sequence', () => {
    const eyeFloorM = SITE_RUNG.eyeFloorBoundingRadii * ROVER.boundingRadiusM;
    const sequence: readonly InputStep[] = [
      drag(220, -140),
      drag(-90, -600),
      { kind: 'zoom', factor: 0.3, duringGesture: false, cursorPx: null },
      drag(-410, 305),
      drag(770, 48),
      { kind: 'zoom', factor: 5, duringGesture: true, cursorPx: [10, 10] },
      drag(33, -720),
    ];

    let pose = POSE;
    for (const input of sequence) {
      pose = step(pose, input);
      expect(pose.rangeM * Math.sin(pose.elevationRad)).toBeGreaterThanOrEqual(eyeFloorM - 1e-9);
    }
  });

  it('a zoom-in burst stops at the range floor', () => {
    let pose: SitePose = { ...POSE, rangeM: 100 };
    for (let i = 0; i < 10; i += 1) {
      // 0.01 folds through the per-notch clamp to 0.5, so this is 100 × 0.5^10.
      pose = step(pose, { kind: 'zoom', factor: 0.01, duringGesture: false, cursorPx: null });
    }
    expect(pose.rangeM).toBeCloseTo(ROVER.standoffRadii * ROVER.boundingRadiusM, 12);
  });

  it('a zoom the floors decline returns its pose by reference', () => {
    // `replayInput`'s identity check (`stepped.pose !== from.pose`) is what
    // stops a declined input committing to the store; a fresh allocation per
    // notch defeated it, so every wheel notch at the floor wrote a no-op pose.
    let pinned: SitePose = { ...POSE, rangeM: 100 };
    for (let i = 0; i < 10; i += 1) {
      pinned = step(pinned, { kind: 'zoom', factor: 0.01, duringGesture: false, cursorPx: null });
    }
    expect(step(pinned, { kind: 'zoom', factor: 0.5, duringGesture: false, cursorPx: null })).toBe(
      pinned,
    );
  });

  it('a non-drag, non-zoom input returns its pose by reference', () => {
    expect(step(POSE, { kind: 'gestureStart' })).toBe(POSE);
    expect(step(POSE, { kind: 'gestureEnd' })).toBe(POSE);
  });
});
