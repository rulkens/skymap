// ── Milky-Way "You are here" label visibility setter ─────────────────────────
//
// The singleton sibling of `setStructureLabelEnabled`. It writes the
// authoritative `labelEnabled` flag THROUGH the engine-owned store (the
// `setMilkyWayLabelEnabledAction` copy-on-write reducer) rather than mutating
// in place: the store write is what NOTIFIES React's
// `useSettingsStore(selectMilkyWayLabelEnabled)` subscriber so the panel
// checkbox re-renders. Having written the intent, it ramps the milkyWay label
// layer's fade THROUGH `syncVisibilityFades` (the intent → fade bridge).
//
// ORDERING MATTERS: the store write MUST precede the bridge call, because the
// bridge reads the just-written `labelEnabled` intent from settings and fades the
// `milkyWayLabel` row's handle to match.
//
// The boolean is the authoritative gate (the producer draws the label while
// enabled OR still fading out); the fade opacity is only the cosmetic alpha,
// which the label producer reads via `opacityOf({ kind: 'labelLayer', layer:
// 'milkyWay' })`. The bridge's animate path rides fadeTo's own scheduler wake,
// so no extra requestRender is needed.
//
// Unlike the structure label layer, milkyWay is a singleton: its label layer is
// a plain `{ kind: 'labelLayer', layer: 'milkyWay' }` (no per-category axis),
// seeded without a category by the fade manifest in `fadeLayers.ts`.

import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setMilkyWayLabelEnabledAction } from '../settingsStore/actions/setMilkyWayLabelEnabledAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setMilkyWayLabelEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  visible: boolean,
): void {
  // Single source of truth: flip the labelEnabled flag THROUGH the store so the
  // copy-on-write write notifies React's selector subscriber.
  setMilkyWayLabelEnabledAction(store, visible);
  // Drive the milkyWayLabel fade through the bridge off the just-written intent.
  syncVisibilityFades(state, { animate: true, only: ['milkyWayLabel'] });
}

// Test-only alias matching the import name used in tests.
export { setMilkyWayLabelEnabled as setMilkyWayLabelEnabledForTest };
