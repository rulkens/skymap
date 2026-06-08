import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * clearAll — unified teardown for the public `selection.clear()` handle
 * method, wired to the deliberate "dismiss" gestures: the InfoCard ×
 * button and Esc.  Drops BOTH the selection slot and the focus slot,
 * so dismissing also collapses the cluster-focus member-isolation fade
 * (and clears the `#focus=` URL hash via `onFocusChange`).
 *
 * Each setter owns its own callback fan-out: `setSelected(null)` fires
 * `onSelectChange(null)`, `setFocused(null)` fires `onFocusChange(null)`.
 * Both dedupe internally, so calling them when the slot is already null
 * is a silent no-op — no spurious React churn.
 *
 * ### Dismiss clears focus; a bare empty-space click does not
 *
 * The casual deselect — clicking empty space — only calls
 * `setSelected(null)` (see the click handler), leaving the fade up so
 * you can look around inside a focused structure.  Esc and × are the
 * explicit exits and route here, where focus is dropped too.  Focus
 * also clears on `focusOnHome` / `focusOnMilkyWay` and on focusing
 * something else.
 */
export function clearAll(state: EngineState): void {
  const { selection, scheduler } = state.subsystems;
  // Fire only when something actually changes, so an Esc on an empty
  // scene stays an idle no-op (no needless render wake).
  if (selection.selected() !== null || selection.focused() !== null) {
    selection.setSelected(null);
    selection.setFocused(null);
  }
  scheduler.requestRender();
}
