import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { COMMIT_FOCUS } from './commitFocusTable';

/**
 * commitFocus — union-aware entry point for `camera.focusOn(target)`.
 *
 * Dispatches on the union tag `target.type` through the `COMMIT_FOCUS`
 * table: a StructureInfo → `commitStructureFocus`, a GalaxyInfo →
 * `commitGalaxyFocus`. Both route their callbacks through the selection
 * subsystem, so this needs no `cb` — it's pure dispatch, and adding a new
 * focusable kind is a new table row rather than a new predicate branch.
 */
export function commitFocus(state: EngineState, target: FocusableTarget): void {
  COMMIT_FOCUS[target.type](state, target);
}
