// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-category visibility setter living at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf THROUGH
// the engine-owned store (the `setStructureLabelEnabledAction` copy-on-write
// reducer) rather than mutating the held object in place: the store write is
// what NOTIFIES React's `useSettingsStore(selectStructureItems)` subscriber so
// the panel checkbox re-renders. It then drives the matching per-category
// FadeRegistry handle for a smooth ramp. The `createEngine` literal delegates
// here.
//
// Fading the per-category handle keeps the toggle smooth: the producer
// (produceStructureLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop a category in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { StructureCategory } from '../../../@types/data/structure/StructureCategory';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setStructureLabelEnabledAction } from '../settingsStore/actions/setStructureLabelEnabledAction';

export function setStructureLabelEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  store: SettingsStore,
  category: StructureCategory,
  visible: boolean,
): void {
  // Text axis. Structure labels fade their per-category handle on the shared
  // `structure` label layer.
  void state.subsystems.fades.fadeTo(
    { kind: 'labelLayer', layer: 'structure', category },
    visible ? 1 : 0,
    visible ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
  );
  // Single source of truth: flip the category's labelEnabled flag THROUGH the
  // store so the copy-on-write write notifies React's selector subscriber.
  setStructureLabelEnabledAction(store, category, visible);
  // No requestRender: the unconditional fadeTo above wakes the scheduler.
  // No echo: React reads the record via `selectStructureItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setStructureLabelEnabled as setStructureLabelEnabledForTest };
