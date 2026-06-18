// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-galaxy-catalog label-visibility setter living at module scope (mirroring
// `setSourceVisible`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf by
// dispatching the `setGalaxyCatalogLabelEnabled` slice action rather than
// mutating the held object in place: `store.dispatch(...)` is what NOTIFIES
// React's `useAppSelector(selectGalaxyCatalogItems)` subscriber so the panel
// checkbox re-renders. Having written the intent, it drives the matching
// fade THROUGH `syncVisibilityFades` (the intent → fade bridge) for a smooth
// ramp. The `createEngine` literal delegates here.
//
// ORDERING MATTERS: the store write MUST precede the bridge call, because the
// `surveyLabel` row reads the just-written intent from settings. That row maps to
// the shared `galaxyNames` handle, which only the famous-galaxy catalog bears, so
// the bridge fades it from `famousGalaxy.labelEnabled`. For a non-famous catalog
// id (which has no label and is never offered a label toggle in the UI — only
// `bearsLabel` sources appear in the Labels panel) the bridge re-fades
// `galaxyNames` to its unchanged value: a harmless no-op plus one render wake.
//
// Fading the galaxy catalog's label handle keeps the toggle smooth: the producer
// (produceFamousLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop the labels in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { AppStore } from '../../../store/types';
import { setGalaxyCatalogLabelEnabled as setGalaxyCatalogLabelEnabledAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setGalaxyCatalogLabelEnabled(
  state: ApplyIntentState,
  store: AppStore,
  galaxyCatalog: GalaxyCatalogId,
  enabled: boolean,
): void {
  // Single source of truth: flip the galaxy catalog's labelEnabled flag by
  // dispatching the slice action so the write notifies React's selector subscriber.
  store.dispatch(setGalaxyCatalogLabelEnabledAction({ id: galaxyCatalog, enabled }));
  // Drive the surveyLabel fade through the bridge off the just-written intent.
  syncVisibilityFades(state, { animate: true, only: ['surveyLabel'] });
  // No requestRender: the bridge's animate path rides fadeTo's own wake.
  // No echo: React reads the record via `selectGalaxyCatalogItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setGalaxyCatalogLabelEnabled as setGalaxyCatalogLabelEnabledForTest };
