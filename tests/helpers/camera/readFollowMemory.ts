/**
 * readFollowMemory — the follow driver's memory as one value with the
 * no-memory default filled in, so fixtures that pin it never branch on null.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FollowMemory } from '../../../src/@types/engine/camera/FollowMemory';

export function readFollowMemory(state: EngineState): FollowMemory {
  return state.cameraRuntime.follow ?? { from: null, distanceTarget: null, panOffset: [0, 0, 0] };
}
