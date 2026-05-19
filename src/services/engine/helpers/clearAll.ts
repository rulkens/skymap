import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * clearAll — unified teardown for the public `selection.clear()` handle
 * method.  Tears down BOTH galaxy selection AND POI focus in one call,
 * which is the "close the card" semantic: anywhere a user dismisses
 * the InfoCard (Esc, × button, URL drift back to empty hash), both
 * sides collapse together.
 *
 * Order is deterministic: galaxy selection clears FIRST (fires
 * `onFocusChange(null)`), then POI selection (fires
 * `onPoiFocusChange(null)`).  An observer subscribed to both signals
 * sees the render frame go from (galaxy-set, poi-set) directly to
 * (null, null) rather than (null, still-set) followed by (null, null)
 * one frame later.
 *
 * Galaxy branch is gated on `selection.selected() !== null` to avoid
 * firing a spurious `onFocusChange(null)` when nothing was selected
 * (preserves the pre-2026-05-19 single-clear behaviour for Esc-with-
 * nothing-pinned).  POI branch is unconditional — mirrors the original
 * `clearPoiFocus` which had no presence guard.
 *
 * Schedules one render at the end (not two): both teardowns paint in
 * the same frame.
 */
export function clearAll(state: EngineState, cb: EngineCallbacks): void {
  if (state.subsystems.selection.selected() !== null) {
    state.subsystems.selection.setSelected(null);
    cb.camera?.onFocusChange?.(null);
  }
  state.subsystems.pois.setSelectedPoi(null);
  cb.camera?.onPoiFocusChange?.(null);
  state.subsystems.scheduler.requestRender();
}
