import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { isPoi } from '../isPoi';
import { commitGalaxyFocus } from './commitGalaxyFocus';
import { commitStructureFocus } from './commitStructureFocus';

/**
 * commitFocus — union-aware entry point for `camera.focusOn(target)`.
 *
 * Dispatches on `isPoi(target)`: a StructureRecord →
 * `commitStructureFocus`, a GalaxyInfo → `commitGalaxyFocus`. Both route
 * their callbacks through the selection subsystem, so this needs no `cb`
 * — it's pure dispatch, sharing the `isPoi` predicate with the InfoCard.
 */
export function commitFocus(state: EngineState, target: FocusableTarget): void {
  if (isPoi(target)) {
    commitStructureFocus(state, target);
  } else {
    commitGalaxyFocus(state, target);
  }
}
