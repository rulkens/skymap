// ── DebugPanel per-pass on/off override ──────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so the toggle is testable without a full GPU engine.
//
// Not a `settingsTable` row because it takes two arguments — a pass `name` plus
// the on/off flag — where table rows dispatch a single value. It writes the
// authoritative `disabledPasses` record THROUGH the store action (copy-on-write) so
// React's `selectDisabledPasses` subscriber re-renders the checkbox, then wakes
// the render-on-demand loop: the store write notifies React but does NOT wake the
// frame loop, and the next frame must re-encode to actually show/hide the pass.
// No fade — a renderer toggle is a hard on/off, not a ramp.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setPassDisabledAction } from '../settingsStore/actions/setPassDisabledAction';

export function setPassDisabled(
  state: Pick<EngineState, 'subsystems'>,
  store: SettingsStore,
  name: string,
  disabled: boolean,
): void {
  setPassDisabledAction(store, name, disabled);
  state.subsystems.scheduler.requestRender();
}
