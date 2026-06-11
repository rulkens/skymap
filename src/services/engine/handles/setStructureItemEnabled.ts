// ── Test-accessible category-visibility logic ───────────────────────────────
//
// The per-category visibility setter lives at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf THROUGH
// the engine-owned store (the `setStructureItemEnabledAction` copy-on-write
// reducer) rather than mutating the held object in place: the store write is
// what NOTIFIES React's `useSettingsStore(selectStructureItems)` subscriber so
// the panel checkbox re-renders. An in-place mutation would update the value but
// never wake the subscription. It then drives the matching per-category
// FadeRegistry handle for a smooth ramp. The `createEngine` literal delegates
// here.
//
// Why fade the per-category handle here?  The producer (produceStructureMarkers)
// already reads `opacityOf({...})` for its layer alpha; flipping the boolean
// alone would pop a category in/out. Firing `fadeTo` on the same handle the
// producer reads turns the toggle into a smooth fade — exactly as the
// milkyWay/filaments setters do for their overlay/filaments handles. The boolean
// is the authoritative gate (the producer draws while enabled OR still fading
// out); the fade opacity is only the cosmetic alpha.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setStructureItemEnabledAction } from '../settingsStore/actions/setStructureItemEnabledAction';

export function setStructureItemEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  store: SettingsStore,
  category: StructureCategory,
  visible: boolean,
): void {
  // Ring/marker axis. Only structures bear a ring, so this is keyed by
  // StructureCategory and fires a markerLayer fade.
  void state.subsystems.fades.fadeTo(
    { kind: 'markerLayer', category },
    visible ? 1 : 0,
    visible ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
  );
  // Single source of truth: flip the category's enabled flag THROUGH the store
  // so the copy-on-write write notifies React's selector subscriber.
  setStructureItemEnabledAction(store, category, visible);
  // No requestRender: the unconditional fadeTo above wakes the scheduler.
  // No echo: React reads the record via `selectStructureItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setStructureItemEnabled as setStructureItemEnabledForTest };
