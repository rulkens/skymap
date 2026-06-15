import type { SelectionSubsystem } from '../../../@types/engine/subsystems/SelectionSubsystem';

/**
 * clearAll — unified teardown for the public `selection.clear()` handle
 * method, wired to the deliberate "dismiss" gestures: the InfoCard ×
 * button and Esc.  Drops BOTH the selection slot and the focus slot,
 * so dismissing also collapses the cluster-focus member-isolation fade
 * (and clears the `#focus=` URL hash via `onFocusChange`).
 *
 * Each setter owns its own callback fan-out (`onSelectChange(null)` /
 * `onFocusChange(null)`) and its own render wake, and both dedupe
 * internally — so Esc on an empty scene is a silent, wake-free no-op.
 *
 * ### Dismiss clears focus; a bare empty-space click does not
 *
 * The casual deselect — clicking empty space — only calls
 * `setSelected(null)` (see the click handler), leaving the fade up so
 * you can look around inside a focused structure.  Esc and × are the
 * explicit exits and route here, where focus is dropped too.  Focus
 * also clears on `focusOnHome` and on focusing something else.
 */
export function clearAll(selection: SelectionSubsystem): void {
  selection.setSelected(null);
  selection.setFocused(null);
}
