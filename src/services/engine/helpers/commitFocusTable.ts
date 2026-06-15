/**
 * COMMIT_FOCUS — table dispatch for `commitFocus` over the FocusableTarget
 * union, keyed on the union tag `target.type`.
 *
 * Each row owns one focusable arm: it narrows the target via `target.type`
 * (no cast) and delegates to that arm's commit helper. Dispatching on
 * `target.type` through a `Record<FocusableTargetType, …>` table follows the
 * simplicity convention's table-dispatch rule (item 7): adding a new focusable
 * kind (e.g. the Milky Way) is one new row here, not an edit to a growing
 * predicate chain that every dispatch site would have to keep in sync.
 *
 * The galaxy row re-checks `target.type === 'galaxyCatalog'` so TypeScript
 * narrows the union arm without an 'as' cast; the false branch is unreachable
 * because the table is only ever indexed by the target's own tag.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../../@types/engine/FocusableTargetType';
import { commitGalaxyFocus } from './commitGalaxyFocus';
import { commitStructureFocus } from './commitStructureFocus';
import { commitMilkyWayFocus } from './commitMilkyWayFocus';

export const COMMIT_FOCUS: Record<
  FocusableTargetType,
  (state: EngineState, target: FocusableTarget) => void
> = {
  galaxyCatalog: (state, target) => {
    if (target.type === 'galaxyCatalog') commitGalaxyFocus(state, target);
  },
  structure: (state, target) => {
    if (target.type === 'structure') commitStructureFocus(state, target);
  },
  // The Milky Way is a singleton — the target carries no per-instance data, so
  // the helper takes only `state` (it focuses MILKY_WAY_INFO unconditionally).
  milkyWay: (state, target) => {
    if (target.type === 'milkyWay') commitMilkyWayFocus(state);
  },
};
