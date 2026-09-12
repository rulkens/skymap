/**
 * readFollowMemory — the follow driver's memory as one value with the
 * no-memory default filled in, so fixtures that pin it never branch on null.
 */

import { NO_FOLLOW_MEMORY } from '../../../src/services/engine/camera/cameraDrivers';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FollowMemory } from '../../../src/@types/engine/camera/FollowMemory';

export function readFollowMemory(state: EngineState): FollowMemory {
  return state.cameraRuntime.follow ?? NO_FOLLOW_MEMORY;
}
