/**
 * engineReady — the canonical "has the engine bootstrapped?" predicate.
 *
 * Proves the three core GPU handles every frame body needs regardless of
 * which content is loaded: `renderTargets` (every offscreen row) and
 * `compositor` (the hdr→swap composite), both minted in `initGpu`. The
 * `state is ReadyEngineState` return narrows the caller's `state` so no `!`
 * assertion is needed downstream. `filamentRenderer` and the galaxy/textured-
 * disk handles are excluded on purpose — they are per-content, not
 * per-bootstrap, and null-check independently at their point of use (PR-D
 * folds the galaxy ones into the galaxy Layer's own hook).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyEngineState } from '../../../@types/engine/ReadyEngineState';

export function isEngineReady(state: EngineState): state is ReadyEngineState {
  return state.booted && state.gpu.renderTargets !== null && state.gpu.compositor !== null;
}
