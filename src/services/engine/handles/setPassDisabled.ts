// ── DebugPanel per-pass on/off override ──────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so the toggle is testable without a full GPU engine.
//
// It takes two arguments — a pass `name` plus the on/off flag — so it stays a
// bespoke setter. It writes the
// authoritative `disabledPasses` record by dispatching the `setPassDisabled`
// slice action so React's `selectDisabledPasses` subscriber re-renders the
// checkbox, then wakes the render-on-demand loop: the dispatch notifies React
// but does NOT wake the frame loop, and the next frame must re-encode to
// actually show/hide the pass. No fade — a renderer toggle is a hard on/off, not
// a ramp.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AppStore } from '../../../store/types';
import { setPassDisabled as setPassDisabledAction } from '../../../state/settings/settingsSlice';

export function setPassDisabled(
  state: Pick<EngineState, 'subsystems'>,
  store: AppStore,
  name: string,
  disabled: boolean,
): void {
  store.dispatch(setPassDisabledAction({ pass: name, disabled }));
  state.subsystems.scheduler.requestRender();
}
