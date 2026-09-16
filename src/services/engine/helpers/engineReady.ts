/**
 * engineReady — the canonical "has the engine bootstrapped?" predicate: the two
 * GPU handles every frame body needs whatever the content is, `renderTargets`
 * and `compositor`, both minted in `initGpu`. Per-content handles are excluded
 * on purpose and null-check at their own point of use. The `state is
 * ReadyEngineState` return narrows the caller, so no `!` downstream.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyEngineState } from '../../../@types/engine/ReadyEngineState';

export function isEngineReady(state: EngineState): state is ReadyEngineState {
  return state.booted && state.gpu.renderTargets !== null && state.gpu.compositor !== null;
}
