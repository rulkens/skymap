// ── Test-accessible category-visibility logic ───────────────────────────────
//
// The per-category visibility setter lives at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf THROUGH
// the engine-owned store (the `setStructureItemEnabledAction` copy-on-write
// reducer) rather than mutating the held object in place: the store write is
// what NOTIFIES React's `useSettingsStore(selectStructureItems)` subscriber so
// the panel checkbox re-renders. An in-place mutation would update the value but
// never wake the subscription. Having written the intent, it drives the matching
// per-category fade THROUGH `syncVisibilityFades` (the intent → fade bridge) for
// a smooth ramp. The `createEngine` literal delegates here.
//
// ORDERING MATTERS: the store write MUST precede the bridge call, because the
// bridge reads the just-written `enabled` intent from settings and fades the
// `structureRing` row's per-category handle to match.
//
// Why fade the per-category handle?  The producer (produceStructureMarkers)
// already reads `opacityOf({...})` for its layer alpha; flipping the boolean
// alone would pop a category in/out. The bridge fading the same handle the
// producer reads turns the toggle into a smooth fade. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setStructureItemEnabledAction } from '../settingsStore/actions/setStructureItemEnabledAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setStructureItemEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  category: StructureId,
  visible: boolean,
): void {
  // Single source of truth: flip the category's enabled flag THROUGH the store
  // so the copy-on-write write notifies React's selector subscriber.
  setStructureItemEnabledAction(store, category, visible);
  // Drive the structureRing fade through the bridge off the just-written intent.
  syncVisibilityFades(state, { animate: true, only: ['structureRing'] });
  // No requestRender: the bridge's animate path rides fadeTo's own wake.
  // No echo: React reads the record via `selectStructureItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setStructureItemEnabled as setStructureItemEnabledForTest };
