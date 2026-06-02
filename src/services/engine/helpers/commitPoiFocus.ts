/**
 * commitPoiFocus — the shared "we have decided to focus on this POI"
 * protocol.  Parallel to `commitGalaxyFocus`.
 *
 * Three steps: update the selection slot, latch the focus slot (which
 * owns the `onFocusChange` URL-hash fan-out), then start the camera
 * tween via `tweenToPoi`.  Idempotent on selection — the
 * selectionSubsystem dedupes via `selectionEq`, so the
 * dblclick-after-click path doesn't fire a second `onSelectChange` for
 * an already-selected POI.
 *
 * ### Why selection + focus fire even when cam is null
 *
 * `state.cam` is null pre-bootstrap and post-destroy.  Skipping the
 * subsystem updates in those windows would strand a deep-link drain
 * that resolves `#poi=…` before the camera is live.  The setters have
 * no cam dependency, so they always land; only the tween is gated on
 * cam — `tweenToPoi` absorbs that check internally.  Diverges from
 * `focusOn` (galaxy), which gates the whole commit on cam availability.
 *
 * No `cb` parameter: the selection subsystem owns every callback the
 * two setters fire (`onSelectChange`, `onFocusChange`).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { tweenToPoi } from '../camera/tweenToPoi';

/**
 * Run the shared POI focus-commit dance: update the selection slot,
 * latch the focus slot, then start the camera tween.
 *
 * Order matters: selection first so the marker descriptor's alpha
 * bump lands on the next frame (before React observes the callback);
 * focus second so the URL hash echoes the new focus; tween last so the
 * camera animation begins on a frame where every other state is
 * consistent.
 */
export function commitPoiFocus(state: EngineState, poi: PointOfInterest): void {
  state.subsystems.selection.setSelected({ kind: 'poi', id: poi.id });
  // Latch the focus slot — this is the deliberate focus gesture
  // cluster-focus mode keys off (a bare single-click select does not
  // set it).  `setFocused` owns the `onFocusChange` fan-out (URL hash)
  // and `runFrame` reads `focused()` for the member-isolation fade, so
  // this one call drives both.
  state.subsystems.selection.setFocused({ kind: 'poi', id: poi.id });
  tweenToPoi(state, poi);
}
