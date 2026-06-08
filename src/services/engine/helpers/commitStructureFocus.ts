/**
 * commitStructureFocus — focus on an extended structure. Parallel to
 * `commitGalaxyFocus`: select, latch focus, tween.
 *
 * The setters carry no cam dependency, so they land even when `state.cam`
 * is null (pre-bootstrap / post-destroy) — a deep-link drain resolving
 * `#focus=…` before the camera is live still establishes state. Only the
 * tween is cam-gated, and `tweenToStructure` absorbs that internally. No
 * `cb`: the selection subsystem owns the callbacks both setters fire.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StructureRecord } from '../../../@types/engine/data/StructureRecord';
import { tweenToStructure } from '../camera/tweenToStructure';

/**
 * Select, latch focus, tween — in that order: selection first so the
 * marker alpha bump lands before React observes the callback; focus
 * second so the URL hash echoes it; tween last, on a consistent frame.
 */
export function commitStructureFocus(state: EngineState, structure: StructureRecord): void {
  state.subsystems.selection.setSelected({ kind: 'structure', id: structure.id });
  // The deliberate focus gesture cluster-focus mode keys off (a bare
  // single-click select does not). `setFocused` drives both the
  // `onFocusChange` URL fan-out and `runFrame`'s member-isolation fade.
  state.subsystems.selection.setFocused({ kind: 'structure', id: structure.id });
  tweenToStructure(state, structure);
}
