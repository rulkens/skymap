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
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('yawPitchToDir', () => {
  it('yaw 0, pitch 0 points along +Z', () => {
    const d = yawPitchToDir(0, 0);
    expect(d[0]).toBeCloseTo(0, 6);
    expect(d[1]).toBeCloseTo(0, 6);
    expect(d[2]).toBeCloseTo(1, 6);
  });

  it('yaw π/2, pitch 0 points along +X', () => {
    const d = yawPitchToDir(Math.PI / 2, 0);
    expect(d[0]).toBeCloseTo(1, 6);
    expect(d[1]).toBeCloseTo(0, 6);
    expect(d[2]).toBeCloseTo(0, 6);
  });

  it('yaw 0, pitch π/2 points along +Y', () => {
    const d = yawPitchToDir(0, Math.PI / 2);
    expect(d[0]).toBeCloseTo(0, 6);
    expect(d[1]).toBeCloseTo(1, 6);
    expect(d[2]).toBeCloseTo(0, 6);
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

  it('writes into out when provided and returns the same reference', () => {
    const out: Vec3 = [0, 0, 0];
    const result = yawPitchToDir(Math.PI / 2, 0, out);
    expect(result).toBe(out);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(0, 6);
  });
});
