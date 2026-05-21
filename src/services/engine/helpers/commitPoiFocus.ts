/**
 * commitPoiFocus — the shared "we have decided to focus on this POI"
 * protocol.  Parallel to `commitGalaxyFocus`.
 *
 * Three steps: update the unified selection slot, fire `onFocusChange`
 * (the deliberate-commitment callback the URL-hash hook subscribes
 * to), then start the camera tween via `tweenToPoi`.  Idempotent on
 * selection — the selectionSubsystem dedupes via `selectionEq`, so
 * the dblclick-after-click path doesn't fire a second
 * `onSelectChange` for an already-selected POI.
 *
 * ### Why selection + onFocusChange fire even when cam is null
 *
 * `state.cam` is null pre-bootstrap and post-destroy.  Skipping the
 * subsystem update + React callback in those windows would strand a
 * deep-link drain that resolves `#poi=…` before the camera is live.
 * Only the tween is gated on cam — `tweenToPoi` absorbs that check
 * internally.  Diverges from `focusOn` (galaxy), which gates
 * `onFocusChange` on cam availability too.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { tweenToPoi } from '../camera/tweenToPoi';

/**
 * Run the shared POI focus-commit dance: update the selection slot,
 * fire `onFocusChange`, then start the camera tween.
 *
 * Order matters: selection first so the marker descriptor's alpha
 * bump lands on the next frame (before React observes the callback);
 * `onFocusChange` second so the URL hash echoes the new focus; tween
 * last so the camera animation begins on a frame where every other
 * state is consistent.
 */
export function commitPoiFocus(
  state: EngineState,
  cb: EngineCallbacks,
  poi: PointOfInterest,
): void {
  state.subsystems.selection.setSelected({ kind: 'poi', id: poi.id });
  cb.camera?.onFocusChange?.(poi);
  tweenToPoi(state, poi);
}
