/**
 * readFollowMemory — the follow driver's memory (approach `from`, distance
 * target, world-frame pan offset) as one value, so fixtures that pin it do not
 * couple to where the runtime keeps the three fields.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function readFollowMemory(state: EngineState): {
  readonly from: CameraPose | null;
  readonly distanceTarget: number | null;
  readonly panOffset: Vec3;
} {
  const clock = state.cameraRuntime.clock;
  return {
    from: clock.followFrom,
    distanceTarget: clock.followDistanceTarget,
    panOffset: clock.followPanOffset,
  };
}
