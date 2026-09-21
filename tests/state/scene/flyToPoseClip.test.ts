/**
 * flyToPoseClip — pins that a view's pose reaches the compiled clip without
 * a `FocusId`/catalog lookup, the property that distinguishes it from
 * `flyToClip`.
 */

import { describe, it, expect } from 'vitest';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import { flyToPoseClip } from '../../../src/state/scene/flyToPoseClip';

describe('flyToPoseClip', () => {
  it('targets the pose, including its bearing, without a focus lookup', () => {
    // Arbitrary numbers, not a registry pose — this must not break when the
    // user re-frames a real view's pose.
    const pose: CameraPose = {
      target: [12, -34, 56],
      yaw: 1.25,
      pitch: -0.5,
      distance: 78,
    };

    const clip = flyToPoseClip(pose);

    expect(clip.start).toBe('live');
    const flat = JSON.stringify(clip.timeline);
    expect(flat).toContain(JSON.stringify(pose.target));
    expect(flat).toContain(String(pose.distance));
    expect(flat).toContain(String(pose.yaw));
    expect(flat).toContain(String(pose.pitch));
  });
});
