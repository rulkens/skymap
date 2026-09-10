import { describe, it, expect } from 'vitest';

import { seedCameraRuntime } from '../../../../src/services/engine/camera/seedCameraRuntime';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';

const PROJECTION: CameraProjection = { fovYRad: 0.8, aspect: 1.5, near: 0.01, far: 50000 };

describe('seedCameraRuntime', () => {
  it('seeds displayed from the committed pose', () => {
    // Before the first frame nothing has been projected, so authored and
    // displayed coincide; runFrame step 4 splits them thereafter.
    const committed = absoluteArm({ target: [1, 2, 3], yaw: 0.1, pitch: 0.2, distance: 5 });
    const runtime = seedCameraRuntime({ committed, projection: PROJECTION });

    expect(runtime.outputs.displayed).toEqual(committed);
    expect(runtime.register.pose).toEqual(committed);
    expect(runtime.outputs.projection).toBe(PROJECTION);
  });

  it('the seed copies the committed pose', () => {
    // The engine's boot seed is the camera slice's `base`: the runtime must not
    // alias the store's object, or a later store write would leak into the register.
    const committed = absoluteArm({ target: [1, 2, 3], yaw: 0.1, pitch: 0.2, distance: 5 });
    const runtime = seedCameraRuntime({ committed, projection: PROJECTION });

    (committed as { frame: string }).frame = 'mutated';

    expect(runtime.register.pose.frame).toBe('absolute');
    expect(runtime.outputs.displayed.frame).toBe('absolute');
  });
});
