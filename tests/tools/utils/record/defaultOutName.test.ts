/**
 * defaultOutName tests — the recorder's timestamped default output path.
 *
 * The `now` parameter is injected precisely so these tests can pin an exact
 * expected string: component-wise Date construction is LOCAL time, matching
 * the helper's local-time getters, so the assertions are timezone-stable.
 */
import { describe, it, expect } from 'vitest';

import { defaultOutName } from '../../../../tools/utils/record/defaultOutName';

describe('defaultOutName', () => {
  it('formats the full default recording path from tour id, size, fps, and timestamp', () => {
    // 2026-07-08 14:30:05 local time.
    const now = new Date(2026, 6, 8, 14, 30, 5);
    expect(defaultOutName({ takeId: 'grandTour', width: 3840, height: 2160, fps: 60, now })).toBe(
      'recordings/grandTour-3840x2160-60fps-20260708-143005.mp4',
    );
  });

  it('zero-pads single-digit month, day, hour, minute, and second', () => {
    // 2026-01-03 04:05:06 local time — every stamp component below 10.
    const now = new Date(2026, 0, 3, 4, 5, 6);
    expect(defaultOutName({ takeId: 'demo', width: 640, height: 360, fps: 10, now })).toBe(
      'recordings/demo-640x360-10fps-20260103-040506.mp4',
    );
  });
});
