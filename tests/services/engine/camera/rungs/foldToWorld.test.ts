import { describe, it, expect } from 'vitest';

import { foldToWorld } from '../../../../../src/services/engine/camera/rungs/foldToWorld';
import { absoluteArm } from '../../../../../src/utils/camera/absoluteArm';
import type { CameraPose } from '../../../../../src/@types/camera/CameraPose';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('foldToWorld', () => {
  it("returns the absolute arm's pose by reference", () => {
    // The idempotence that makes the per-frame fold free while the camera is in
    // the world arm — a copy here would allocate on every frame and break the
    // `toBe` identity `applyFocusedBodyPivot`'s pass-through relies on.
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.4, pitch: -0.2, distance: 12 };
    const resolved = foldToWorld(absoluteArm(pose), {
      bodies: new Map(),
      poseBasis: IDENTITY,
      upBasis: IDENTITY,
    });
    expect(resolved).toBe(pose);
  });
});
