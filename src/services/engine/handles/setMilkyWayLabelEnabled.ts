// ── Milky-Way "You are here" label visibility setter ─────────────────────────
//
// The singleton sibling of `setStructureLabelEnabled`. It writes the
// authoritative `labelEnabled` flag by dispatching the `setMilkyWayLabelEnabled`
// slice action rather than mutating in place: `store.dispatch(...)` is what
// NOTIFIES React's `useAppSelector(selectMilkyWayLabelEnabled)` subscriber so
// the panel checkbox re-renders. Having written the intent, it ramps the
// milkyWay label layer's fade THROUGH `syncVisibilityFades` (the intent → fade
// bridge).
//
// ORDERING MATTERS: the dispatch MUST precede the bridge call, because the
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

import type { AppStore } from '../../../store/types';
import { setMilkyWayLabelEnabled as setMilkyWayLabelEnabledAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setMilkyWayLabelEnabled(
  state: ApplyIntentState,
  store: AppStore,
  visible: boolean,
): void {
  // Single source of truth: flip the labelEnabled flag by dispatching the slice
  // action so the write notifies React's selector subscriber.
  store.dispatch(setMilkyWayLabelEnabledAction(visible));
  // Drive the milkyWayLabel fade through the bridge off the just-written intent.
  syncVisibilityFades(state, { animate: true, only: ['milkyWayLabel'] });
}

// Test-only alias matching the import name used in tests.
export { setMilkyWayLabelEnabled as setMilkyWayLabelEnabledForTest };
