/**
 * commitGalaxyFocus — the shared "we have decided to focus on this
 * galaxy" protocol.  Parallel to `commitStructureFocus`.
 *
 * Three steps: update the selection slot, latch the focus slot (which
 * owns the `onFocusChange` URL-hash fan-out), then start the camera
 * tween via `tweenToGalaxy`.  Idempotent on selection — the
 * selectionSubsystem dedupes via target equality, so the
 * double-click-after-click path doesn't fire a second `onSelectChange`
 * for an already-selected galaxy.
 *
 * The `info` (a fully-resolved `GalaxyInfo`) IS the target the slots
 * hold. Handing the resolved target straight to the setters is the race
 * defence that matters for `selectByAlias`, which can fire the moment the
 * data-side cloud arrives but BEFORE the GPU upload completes: a lookup
 * keyed on (source, localIdx) would briefly return null and blank the
 * InfoCard, but a pre-built `GalaxyInfo` always renders.
 *
 * No `cb` parameter: the selection subsystem owns every callback the
 * two setters fire (`onSelectChange`, `onFocusChange`).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import { tweenToGalaxy } from '../camera/tweenToGalaxy';

/**
 * Run the shared galaxy focus-commit dance: update the selection
 * slot, latch the focus slot, then start the camera tween.
 *
 * Order matters: selection first so the InfoCard's echo lands before
 * the URL hash flips, focus second so the hash update doesn't lap
 * React state, and `tweenToGalaxy` last so the camera animation begins
 * on a frame where every other state is consistent.
 */
export function commitGalaxyFocus(state: EngineState, info: GalaxyInfo): void {
  state.subsystems.selection.setSelected(info);
  // Latch the focus slot too — focusing a galaxy is a focus gesture, so
  // it supersedes any prior cluster focus: `runFrame` resolves a galaxy
  // focus to a null structure, collapsing the member-isolation fade.
  // `setFocused` owns the `onFocusChange` fan-out (URL hash).
  state.subsystems.selection.setFocused(info);
  tweenToGalaxy(state, info);
}
