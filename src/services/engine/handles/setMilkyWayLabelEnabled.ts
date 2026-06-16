// ── Milky-Way "You are here" label visibility setter ─────────────────────────
//
// The singleton sibling of `setStructureLabelEnabled`. It writes the
// authoritative `labelEnabled` flag THROUGH the engine-owned store (the
// `setMilkyWayLabelEnabledAction` copy-on-write reducer) rather than mutating
// in place: the store write is what NOTIFIES React's
// `useSettingsStore(selectMilkyWayLabelEnabled)` subscriber so the panel
// checkbox re-renders. It then ramps the milkyWay label layer's fade for a
// smooth toggle.
//
// The boolean is the authoritative gate (the producer draws the label while
// enabled OR still fading out); the fade opacity is only the cosmetic alpha,
// which the label producer reads via `opacityOf({ kind: 'labelLayer', layer:
// 'milkyWay' })`. The unconditional fadeTo also wakes the scheduler, so no
// extra requestRender is needed.
//
// Unlike the structure label layer, milkyWay is a singleton: its label layer is
// a plain `{ kind: 'labelLayer', layer: 'milkyWay' }` (no per-category axis),
// seeded without a category by the fade manifest in `fadeLayers.ts`.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setMilkyWayLabelEnabledAction } from '../settingsStore/actions/setMilkyWayLabelEnabledAction';

export function setMilkyWayLabelEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  store: SettingsStore,
  visible: boolean,
): void {
  // Text axis. The singleton milkyWay label fades the shared milkyWay label
  // layer handle (no per-category key).
  void state.subsystems.fades.fadeTo(
    { kind: 'labelLayer', layer: 'milkyWay' },
    visible ? 1 : 0,
    visible ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
  );
  // Single source of truth: flip the labelEnabled flag THROUGH the store so the
  // copy-on-write write notifies React's selector subscriber.
  setMilkyWayLabelEnabledAction(store, visible);
}

// Test-only alias matching the import name used in tests.
export { setMilkyWayLabelEnabled as setMilkyWayLabelEnabledForTest };
