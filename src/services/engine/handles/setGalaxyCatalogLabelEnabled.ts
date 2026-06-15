// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-galaxy-catalog label-visibility setter living at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf THROUGH
// the engine-owned store (the `setGalaxyCatalogLabelEnabledAction` copy-on-write
// reducer) rather than mutating the held object in place: the store write is
// what NOTIFIES React's `useSettingsStore(selectGalaxyCatalogItems)` subscriber so the
// panel checkbox re-renders. It then drives the matching FadeRegistry handle for
// a smooth ramp. The `createEngine` literal delegates here.
//
// Fading the galaxy catalog's label handle keeps the toggle smooth: the producer
// (produceFamousLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop the labels in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setGalaxyCatalogLabelEnabledAction } from '../settingsStore/actions/setGalaxyCatalogLabelEnabledAction';

export function setGalaxyCatalogLabelEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  store: SettingsStore,
  galaxyCatalog: GalaxyCatalogId,
  enabled: boolean,
): void {
  // Fire the galaxy catalog's label fade IF it bears one — registry-driven: famous
  // carries labelLayer 'galaxyNames', the other galaxy catalogs carry none, so a
  // labelEnabled toggle on a label-free galaxy catalog just writes the (inert) flag.
  const entry = SOURCE_ENTRIES.find((e) => e.id === galaxyCatalog);
  const layer = entry && 'labelLayer' in entry ? entry.labelLayer : undefined;
  if (layer) {
    void state.subsystems.fades.fadeTo(
      { kind: 'labelLayer', layer },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
  }
  // Single source of truth: flip the galaxy catalog's labelEnabled flag THROUGH the
  // store so the copy-on-write write notifies React's selector subscriber.
  setGalaxyCatalogLabelEnabledAction(store, galaxyCatalog, enabled);
  // No requestRender: with a layer the fadeTo above wakes the scheduler;
  // without one the flag is render-inert — no producer reads it.
  // No echo: React reads the record via `selectGalaxyCatalogItems` + a projection.
}

// Test-only alias matching the import name used in tests.
export { setGalaxyCatalogLabelEnabled as setGalaxyCatalogLabelEnabledForTest };
