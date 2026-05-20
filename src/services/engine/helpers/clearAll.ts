import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * clearAll — unified teardown for the public `selection.clear()` handle
 * method.  Drops the unified selection slot (galaxy OR POI) and fires
 * `onFocusChange(null)` on top, mirroring the "close the card" semantic
 * everywhere the InfoCard is dismissed (Esc, × button, URL drift back
 * to empty hash).
 *
 * The selection subsystem's `setSelected(null)` fires both
 * `onSelectChange(null)` and `onPoiFocusChange(null)` for us, so the
 * React-side gets one consistent (null, null) snapshot rather than the
 * old two-step dance.  `onFocusChange(null)` is the extra one the
 * selection setter doesn't own — focus and selection are separate
 * callbacks (see EngineCallbacks).
 */
export function clearAll(state: EngineState, cb: EngineCallbacks): void {
  if (state.subsystems.selection.selected() !== null) {
    state.subsystems.selection.setSelected(null);
    cb.camera?.onFocusChange?.(null);
  }
  state.subsystems.scheduler.requestRender();
}
