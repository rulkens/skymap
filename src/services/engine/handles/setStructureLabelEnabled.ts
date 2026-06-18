// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-category visibility setter living at module scope (mirroring
// `setSourceVisible`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf by
// dispatching the `setStructureLabelEnabled` slice action rather than mutating
// the held object in place: `store.dispatch(...)` is what NOTIFIES React's
// `useAppSelector(selectStructureItems)` subscriber so the panel checkbox
// re-renders. Having written the intent, it drives the matching per-category
// fade THROUGH `syncVisibilityFades` (the intent → fade bridge) for a smooth
// ramp. The `createEngine` literal delegates here.
//
// ORDERING MATTERS: the dispatch MUST precede the bridge call, because the
// bridge reads the just-written `labelEnabled` intent from settings and fades the
// `structureLabel` row's per-category handle to match.
//
// Fading the per-category handle keeps the toggle smooth: the producer
// (produceStructureLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop a category in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { AppStore } from '../../../store/types';
import { setStructureLabelEnabled as setStructureLabelEnabledAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setStructureLabelEnabled(
  state: ApplyIntentState,
  store: AppStore,
  category: StructureId,
  visible: boolean,
): void {
  // Single source of truth: flip the category's labelEnabled flag by dispatching
  // the slice action so the write notifies React's selector subscriber.
  store.dispatch(setStructureLabelEnabledAction({ id: category, enabled: visible }));
  // Drive the structureLabel fade through the bridge off the just-written intent.
  syncVisibilityFades(state, { animate: true, only: ['structureLabel'] });
  // No requestRender: the bridge's animate path rides fadeTo's own wake.
  // No echo: React reads the record via `selectStructureItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setStructureLabelEnabled as setStructureLabelEnabledForTest };
