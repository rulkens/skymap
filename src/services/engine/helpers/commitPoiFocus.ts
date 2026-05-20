/**
 * commitPoiFocus — the shared "we have decided to focus on this POI"
 * protocol.  Parallel to `commitGalaxyFocus`.
 *
 * Three steps: update the unified selection slot (which fans out
 * onSelectChange + onPoiFocusChange via selectionSubsystem); fire
 * onFocusChange for the URL-hash mirror; optionally start the camera
 * tween via `tweenToPoi`.
 *
 * ### Why the selection + onFocusChange fire even when cam is null
 *
 * `state.cam` is null pre-bootstrap and post-destroy.  Skipping the
 * subsystem update + React callback in those windows would strand a
 * deep-link drain that resolves `#poi=…` before the camera is live.
 * Only the camera tween is gated on cam — `tweenToPoi` absorbs that
 * check internally.  This deliberately diverges from `focusOn`
 * (galaxy), which gates onFocusChange on cam availability too.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { tweenToPoi } from '../camera/tweenToPoi';

export type CommitPoiFocusOptions = {
  /** True for double-click (tween + open InfoCard); false for single-click (open only). */
  readonly tween: boolean;
};

/**
 * Run the shared POI focus-commit dance: update the unified selection
 * slot, fire `onFocusChange`, then optionally start the camera tween.
 *
 * Order matters: selection first so the marker descriptor gets its
 * alpha bump on the next frame (before React has observed the
 * callback); `onFocusChange` second so the URL hash echoes the new
 * focus; tween last so the camera animation begins on a frame where
 * every other state is consistent.  `tweenToPoi` absorbs cam-null
 * internally — see module header.
 */
export function commitPoiFocus(
  state: EngineState,
  cb: EngineCallbacks,
  poi: PointOfInterest,
  options: CommitPoiFocusOptions,
): void {
  // 1. Update the unified selection slot — selectionSubsystem fires
  //    `onSelectChange(poi)` (resolved through getPoi) and clears any
  //    prior selection.  Happens regardless of cam-null state so
  //    deep-link drains still drive the marker bump before the camera
  //    comes up.
  state.subsystems.selection.setSelected({ kind: 'poi', id: poi.id });

  // 2. Fire the focus callback so the URL hash updates.  Same
  //    rationale as the galaxy commitFocus: focus and selection are
  //    separate concepts — onSelectChange fired from setSelected
  //    above; onFocusChange is the deliberate-commitment signal that
  //    deep-link writers subscribe to.
  cb.camera?.onFocusChange?.(poi);

  // 3. Optional tween — `tweenToPoi` absorbs the cam-null guard
  //    internally, so the deep-link drain pre-bootstrap path still
  //    works: selection lands above, tween is silently skipped.
  if (options.tween) tweenToPoi(state, poi);
}
