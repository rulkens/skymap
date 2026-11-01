import { describe, it, expect } from 'vitest';

import { nudgedWorldPose } from '../../../src/utils/camera/nudgedWorldPose';
import { applyInputToCamera } from '../../../src/services/camera/applyInputToCamera';
import { PITCH_LIMIT } from '../../../src/data/camera/pitchLimit';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { PivotFraming } from '../../../src/@types/camera/PivotFraming';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { frameUp } from '../../../src/utils/camera/frameUp';
import { orbitForwardOf } from '../../../src/utils/camera/orbitForwardOf';
import { dot3 } from '../../../src/utils/math/dot3';

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const CSS_HEIGHT = 800;
const FOV = 0.8;
// A surfaced pivot, so the orbit's altitude damping is live in the comparison.
const PIVOT: PivotFraming = { radiusMpc: 1, floorMpc: 1.01 };
const POSE: CameraPose = { target: [0, 0, 0], yaw: 0.4, pitch: 0.3, distance: 1.5 };

// The view the renderer draws: its elevation against the frame up, and whether
// the offset pitch turned it over the pole (horizontal heading reversed).
const rendered = (pose: CameraPose, poseBasis: Mat3, upBasis: Mat3) => {
  const cam = { ...pose, poseBasis, upBasis, fovYRad: FOV, aspect: 1, near: 0.1, far: 10 };
  const fwd = orbitForwardOf({ ...cam, position: [0, 0, 0] });
  const level = orbitForwardOf({
    ...cam,
    lookOffset: [pose.lookOffset?.[0] ?? 0, 0],
    position: [0, 0, 0],
  });
  const up = frameUp(upBasis);
  const horiz = (v: Vec3): Vec3 => {
    const d = dot3(v, up);
    return [v[0] - d * up[0], v[1] - d * up[1], v[2] - d * up[2]];
  };
  return { elevation: Math.asin(dot3(fwd, up)), flipped: dot3(horiz(fwd), horiz(level)) < 0 };
};

const nudge = (pose: CameraPose, delta: Parameters<typeof nudgedWorldPose>[1]) =>
  nudgedWorldPose(pose, delta, CSS_HEIGHT, PIVOT, FOV, I, I);

describe('nudgedWorldPose', () => {
  it('world nudge orbit equals the equivalent pixel drag', () => {
    const [a, b] = [0.07, -0.05];
    const k = CSS_HEIGHT / FOV;
    const dragged = applyInputToCamera(
      POSE,
      { kind: 'drag', mode: 'orbit', startPx: [0, 0], endPx: [a * k, b * k] },
      CSS_HEIGHT,
      PIVOT,
      FOV,
      I,
      I,
    );
    const nudged = nudge(POSE, { orbit: [a, b] });
    expect(nudged.yaw).toBeCloseTo(dragged.yaw, 12);
    expect(nudged.pitch).toBeCloseTo(dragged.pitch, 12);
    expect(nudged.distance).toBe(dragged.distance);
  });

  it('world nudge look accumulates lookOffset and clamps pitch', () => {
    const once = nudge(POSE, { look: [0.1, 0.2] });
    expect(once.lookOffset).toEqual([0.1, 0.2]);
    const twice = nudge(once, { look: [0.2, 3] });
    expect(twice.lookOffset![0]).toBeCloseTo(0.3, 15);
    // Identity bases: the un-offset view looks DOWN by the orbit pitch.
    expect(twice.lookOffset![1]).toBeCloseTo(PITCH_LIMIT + POSE.pitch, 12);
    expect(twice.yaw).toBe(POSE.yaw);
  });

  it('look offset cannot carry the view past the pole', () => {
    for (const pitch of [1.4, -1.4]) {
      const high = { ...POSE, pitch };
      for (const look of [0.5, -0.5]) {
        const looked = nudge(high, { look: [0, look] });
        const { elevation, flipped } = rendered(looked, I, I);
        expect(Math.abs(elevation)).toBeLessThanOrEqual(PITCH_LIMIT + 1e-12);
        expect(flipped).toBe(false);
        // Toward the horizon the look is safe and must pass untouched.
        if (Math.sign(look) === Math.sign(pitch)) expect(looked.lookOffset![1]).toBe(look);
        else expect(Math.abs(elevation)).toBeCloseTo(PITCH_LIMIT, 12);
      }
    }
  });

  it('an orbit under a held offset re-clamps it', () => {
    const held: CameraPose = { ...POSE, pitch: -1.2, lookOffset: [0, 0.3] };
    expect(rendered(held, I, I).elevation).toBeLessThan(PITCH_LIMIT);
    const orbited = nudge(held, { orbit: [0, -0.3] });
    expect(orbited.pitch).toBeLessThan(-1.3);
    const { elevation, flipped } = rendered(orbited, I, I);
    expect(elevation).toBeCloseTo(PITCH_LIMIT, 12);
    expect(flipped).toBe(false);
  });

  it('the clamp reads the rendered elevation when poseBasis ≠ upBasis', () => {
    const ecl = ORIENTATION_FRAMES.ecliptic;
    const eq = ORIENTATION_FRAMES.equatorial;
    for (const yaw of [0.4, 2]) {
      for (const look of [3, -3]) {
        const looked = nudgedWorldPose(
          { ...POSE, yaw, pitch: 1.2 },
          { look: [0, look] },
          CSS_HEIGHT,
          PIVOT,
          FOV,
          ecl,
          eq,
        );
        const { elevation, flipped } = rendered(looked, ecl, eq);
        expect(elevation).toBeCloseTo(Math.sign(look) * PITCH_LIMIT, 12);
        expect(flipped).toBe(false);
      }
    }
  });

  it('an absent offset stays absent under orbit', () => {
    const orbited = nudge({ ...POSE, pitch: 1.2 }, { orbit: [0.1, 0.3] });
    expect(orbited).not.toHaveProperty('lookOffset');
  });

  it('an empty delta returns the pose by reference', () => {
    expect(nudge(POSE, {})).toBe(POSE);
  });
});
