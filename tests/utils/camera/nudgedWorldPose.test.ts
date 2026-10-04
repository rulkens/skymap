import { describe, it, expect } from 'vitest';

import { nudgedWorldPose } from '../../../src/utils/camera/nudgedWorldPose';
import { applyInputToCamera } from '../../../src/services/camera/applyInputToCamera';
import { PITCH_LIMIT } from '../../../src/data/camera/pitchLimit';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { PivotFraming } from '../../../src/@types/camera/PivotFraming';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const CSS_HEIGHT = 800;
const FOV = 0.8;
// A surfaced pivot, so the orbit's altitude damping is live in the comparison.
const PIVOT: PivotFraming = { radiusMpc: 1, floorMpc: 1.01 };
const POSE: CameraPose = { target: [0, 0, 0], yaw: 0.4, pitch: 0.3, distance: 1.5 };

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

  it('world nudge look accumulates lookOffset', () => {
    const once = nudge(POSE, { look: [0.1, 0.2] });
    expect(once.lookOffset).toEqual([0.1, 0.2]);
    const twice = nudge(once, { look: [0.2, 0.1] });
    expect(twice.lookOffset![0]).toBeCloseTo(0.3, 15);
    expect(twice.lookOffset![1]).toBeCloseTo(0.3, 15);
    expect(twice.yaw).toBe(POSE.yaw);
  });

  it('look offset cannot carry the view past zenith', () => {
    const high = { ...POSE, pitch: 1.4 };
    const looked = nudge(high, { look: [0, 0.5] });
    expect(looked.pitch).toBe(1.4);
    expect(looked.pitch + looked.lookOffset![1]).toBeCloseTo(PITCH_LIMIT, 12);
  });

  it('an orbit under a held offset re-clamps it', () => {
    const held: CameraPose = { ...POSE, pitch: 1.2, lookOffset: [0, 0.3] };
    const orbited = nudge(held, { orbit: [0, 0.3] });
    expect(orbited.pitch).toBeGreaterThan(1.3);
    expect(orbited.pitch + orbited.lookOffset![1]).toBeCloseTo(PITCH_LIMIT, 12);
  });

  it('an absent offset stays absent under orbit', () => {
    const orbited = nudge({ ...POSE, pitch: 1.2 }, { orbit: [0.1, 0.3] });
    expect(orbited).not.toHaveProperty('lookOffset');
  });

  it('an empty delta returns the pose by reference', () => {
    expect(nudge(POSE, {})).toBe(POSE);
  });
});
