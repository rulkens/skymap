/**
 * commitGalaxyFocus — the shared "we have decided to focus on this
 * galaxy" protocol.  Parallel to `commitPoiFocus`.
 *
 * Three steps: update the unified selection slot, fire
 * `onFocusChange` (the deliberate-commitment callback the URL-hash
 * hook subscribes to), then start the camera tween via
 * `tweenToGalaxy`.  Idempotent on selection — the selectionSubsystem
 * dedupes via `selectionEq`, so the double-click-after-click path
 * doesn't fire a second `onSelectChange` for an already-selected
 * galaxy.
 *
 * ### Why the prebuilt `info` is forwarded to `setSelected`
 *
 * `setSelected`'s second parameter short-circuits the cloud-lookup
 * path: the subsystem hands the prebuilt GalaxyInfo straight to
 * `onSelectChange` instead of re-resolving (source, localIdx) → cloud
 * → buildGalaxyInfo.  Critical for `selectByAlias`, which can fire
 * the moment the data-side cloud arrives but BEFORE the GPU upload
 * completes — the lookup would briefly return null, blanking the
 * InfoCard.  The `info` argument is already a freshly-built
 * GalaxyInfo every caller has on hand, so forwarding it is free and
 * defends every entry path uniformly.
 */

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import { tweenToGalaxy } from '../camera/tweenToGalaxy';

/**
 * Run the shared galaxy focus-commit dance: update the selection
 * slot, fire `onFocusChange`, then start the camera tween.
 *
 * Order matters: selection first so the InfoCard's echo lands before
 * the URL hash flips, `onFocusChange` second so the hash update
 * doesn't lap React state, and `tweenToGalaxy` last so the camera
 * animation begins on a frame where every other state is consistent.
 */
export function commitGalaxyFocus(
  state: EngineState,
  cb: EngineCallbacks,
  info: GalaxyInfo,
): void {
  state.subsystems.selection.setSelected(
    { kind: 'galaxy', source: info.source, localIdx: info.index },
    info,
  );
  cb.camera?.onFocusChange?.(info);
  tweenToGalaxy(state, info);
}
