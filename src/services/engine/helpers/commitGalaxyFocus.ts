/**
 * commitGalaxyFocus — the shared "we have decided to focus on this
 * galaxy" protocol.  Parallel to `commitStructureFocus`.
 *
 * Three steps: update the selection slot, latch the focus slot (which
 * owns the `onFocusChange` URL-hash fan-out), then start the camera
 * tween via `tweenToGalaxy`.  Idempotent on selection — the
 * selectionSubsystem dedupes via `selectionEq`, so the
 * double-click-after-click path doesn't fire a second `onSelectChange`
 * for an already-selected galaxy.
 *
 * ### Why the prebuilt `info` is forwarded to both setters
 *
 * The setters' second parameter short-circuits the cloud-lookup path:
 * the subsystem hands the prebuilt GalaxyInfo straight to the callback
 * instead of re-resolving (source, localIdx) → cloud → buildGalaxyInfo.
 * Critical for `selectByAlias`, which can fire the moment the data-side
 * cloud arrives but BEFORE the GPU upload completes — the lookup would
 * briefly return null, blanking the InfoCard.  The `info` argument is
 * already a freshly-built GalaxyInfo every caller has on hand, so
 * forwarding it is free and defends every entry path uniformly.
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
  const selection = { kind: 'galaxy' as const, source: info.source, localIdx: info.index };
  state.subsystems.selection.setSelected(selection, info);
  // Latch the focus slot too — focusing a galaxy is a focus gesture, so
  // it supersedes any prior cluster focus: `runFrame` resolves a galaxy
  // focus to a null structure, collapsing the member-isolation fade.
  // `setFocused` owns the `onFocusChange` fan-out (URL hash); the
  // prebuilt `info` rides through the same race defense as setSelected.
  state.subsystems.selection.setFocused(selection, info);
  tweenToGalaxy(state, info);
}
