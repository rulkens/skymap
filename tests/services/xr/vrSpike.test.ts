/**
 * Pins the first-frame entry-pin seeding (vrSpike.ts): the 'local' reference
 * space's −Z is the Quest's system-recenter forward, not necessarily where
 * the user's head is facing at session entry, so the pin must be derived
 * from the ACTUAL head pose rather than a hard-coded local point. This test
 * constructs a synthetic pose yawed 90° left of local −Z and checks both the
 * pin placement and the yaw-fold sign numerically.
 */

import { describe, it, expect } from 'vitest';

import {
  deriveEntrySeed,
  foldEntryYaw,
  HEAD_TO_EARTH_CENTER_M,
} from '../../../src/services/xr/vrSpike';
import { rotateVec3ByQuat } from '../../../src/utils/math/rotateVec3ByQuat';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';

const IDENTITY_QUAT: Vec4 = [0, 0, 0, 1];

describe('deriveEntrySeed', () => {
  it('plants the pin 1.75 m along the head\'s actual forward, at head position', () => {
    // Head yawed 90° left of local −Z: forward = [−1, 0, 0], so the pose
    // transform's back (+Z) column is [1, 0, 0].
    const rawBackAxisLocal: Vec3 = [1, 0, 0];
    const headPositionLocal: Vec3 = [0.3, 1.6, -0.2];

    const { pinLocal, yawRad } = deriveEntrySeed(rawBackAxisLocal, headPositionLocal);

    expect(pinLocal[0]).toBeCloseTo(headPositionLocal[0] - HEAD_TO_EARTH_CENTER_M, 10);
    expect(pinLocal[1]).toBeCloseTo(headPositionLocal[1], 10);
    expect(pinLocal[2]).toBeCloseTo(headPositionLocal[2], 10);
    expect(yawRad).toBeCloseTo(Math.PI / 2, 10);
  });

  it('falls back to local [0,0,-1] when the head looks straight up', () => {
    // Back axis parallel to physical up ⇒ horizontal component is ~0.
    const { yawRad } = deriveEntrySeed([0, 1, 0], [0, 0, 0]);
    expect(yawRad).toBeCloseTo(0, 10); // atan2(-0, -(-1)) = atan2(0, 1) = 0
  });
});

describe('foldEntryYaw', () => {
  it('makes the world present the anchor forward along the ACTUAL head forward (yaw-fold sign)', () => {
    const forward: Vec3 = [-1, 0, 0]; // 90° left of local −Z, matches the seed above
    const { yawRad } = deriveEntrySeed([1, 0, 0], [0, 0, 0]);

    // M_old = identity stands in for "an anchor mapping that presents
    // canonical local −Z as world −Z" (the pre-fix, straight-ahead-entry
    // assumption). After folding, the ACTUAL forward must map through M_new
    // to that same world direction — otherwise the focus lands off to the
    // side, which is exactly the reported bug.
    const mNew = foldEntryYaw(IDENTITY_QUAT, yawRad);
    const presented = rotateVec3ByQuat(mNew, forward);

    expect(presented[0]).toBeCloseTo(0, 10);
    expect(presented[1]).toBeCloseTo(0, 10);
    expect(presented[2]).toBeCloseTo(-1, 10);

    // A wrong-signed fold (+yawRad instead of −yawRad) would instead present
    // [0, 0, 1] here — pinning the sign, not just "produces some rotation".
    const wrongSignPresented = rotateVec3ByQuat(
      foldEntryYaw(IDENTITY_QUAT, -yawRad), // double-negated: reintroduces +yawRad internally
      forward,
    );
    expect(wrongSignPresented[2]).toBeCloseTo(1, 10);
  });

  it('is a no-op for zero yaw (straight-ahead entry reproduces the pre-fix mapping)', () => {
    const m: Vec4 = [0.1, 0.2, 0.3, Math.sqrt(1 - 0.01 - 0.04 - 0.09)];
    const folded = foldEntryYaw(m, 0);
    expect(folded[0]).toBeCloseTo(m[0], 10);
    expect(folded[1]).toBeCloseTo(m[1], 10);
    expect(folded[2]).toBeCloseTo(m[2], 10);
    expect(folded[3]).toBeCloseTo(m[3], 10);
  });
});
