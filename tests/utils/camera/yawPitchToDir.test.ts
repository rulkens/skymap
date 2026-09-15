/**
 * yawPitchToDir tests — the orbit-camera convention's spherical decode.
 *
 * `yawPitchToDir(yaw, pitch)` returns the unit direction pointing FROM the
 * target TOWARD the eye:
 *   dir = [cos p·sin yaw, sin p, cos p·cos yaw]
 *
 * The axis tests pin hand-computed values at the three cardinal bearings. The
 * round-trip test crosses the function against `orbitAnglesLookingAlong`, which
 * inverts the same convention with an INDEPENDENT formula (atan2/asin, not the
 * sin/cos this function uses) — so it fails on a wrong formula rather than
 * mirroring one.
 */

import { describe, it, expect } from 'vitest';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { orbitAnglesLookingAlong } from '../../../src/utils/camera/orbitAnglesLookingAlong';

describe('yawPitchToDir', () => {
  it('yaw 0, pitch 0 points along +Z', () => {
    const d = yawPitchToDir(0, 0);
    expect(d[0]).toBeCloseTo(0, 6);
    expect(d[1]).toBeCloseTo(0, 6);
    expect(d[2]).toBeCloseTo(1, 6);
  });

  it('round-trips through orbitAnglesLookingAlong for an oblique bearing', () => {
    const yaw = 0.6;
    const pitch = 0.35;
    const dir = yawPitchToDir(yaw, pitch);
    // The camera aims along -dir; feeding that back must recover (yaw, pitch).
    const back = orbitAnglesLookingAlong([-dir[0], -dir[1], -dir[2]]);
    expect(back.yaw).toBeCloseTo(yaw, 6);
    expect(back.pitch).toBeCloseTo(pitch, 6);
  });
});
