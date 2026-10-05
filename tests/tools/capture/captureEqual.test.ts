import { describe, expect, it } from 'vitest';

import { captureEqual } from '../../../tools/capture/captureEqual';

describe('captureEqual', () => {
  it('ignores key order, so two copies authored in either order still agree', () => {
    expect(
      captureEqual(
        { t: '2026-09-18T12:00:00Z', keepFocus: true },
        { keepFocus: true, t: '2026-09-18T12:00:00Z' },
      ),
    ).toBe(true);
  });

  it('recurses into a pose, where a drifted copy differs deep in the Vec3', () => {
    const pose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 4 };
    expect(captureEqual({ pose }, { pose: { ...pose, target: [1, 2, 3] } })).toBe(true);
    expect(captureEqual({ pose }, { pose: { ...pose, target: [1, 2, 3.5] } })).toBe(false);
  });

  it('treats an absent override and an empty one as different', () => {
    expect(captureEqual(undefined, {})).toBe(false);
  });
});
