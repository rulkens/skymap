/**
 * flyToPoseClip — pins that a view's pose reaches the compiled clip without
 * a `FocusId`/catalog lookup, the property that distinguishes it from
 * `flyToClip`.
 */

import { describe, it, expect } from 'vitest';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import { flyToPoseClip } from '../../../src/state/scene/flyToPoseClip';

describe('flyToPoseClip', () => {
  it('targets the pose without a focus lookup', () => {
    const pose: CameraPose = {
      target: [-181.2045404245461, -29.471262938089055, 52.200784784155374],
      yaw: -3.93753522022247,
      pitch: 0.4135452242339458,
      distance: 251.18526964731848,
    };

    const clip = flyToPoseClip(pose);

    expect(clip.start).toBe('live');
    const flat = JSON.stringify(clip.timeline);
    expect(flat).toContain(JSON.stringify(pose.target));
    expect(flat).toContain(String(pose.distance));
  });
});
