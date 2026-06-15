// ── Test-accessible setSourceVisible logic ──────────────────────────────────
//
// `setSourceVisible`'s logic lives at module scope so tests can drive it
// against a partial-state stub without a full GPU engine; the `createEngine`
// closure delegates here.  The `Pick` keeps the signature narrow while still
// accepting the full `EngineState`.
//
// The setter does ONE authoritative thing: it flips the galaxy catalog's
// `settings.galaxyCatalogs.items[id].enabled` — the single source of truth for
// on/off.  It writes that flag THROUGH the engine-owned settings store (the
// `setGalaxyCatalogVisible` action's copy-on-write reducer) rather than mutating the
// held object in place: the store write is what NOTIFIES React's
// `useSettingsStore(selectVisibleSourceMask)` subscriber so the panel checkbox
// re-renders.  An in-place mutation would update the value but never wake the
// subscription — that's exactly the mirror-drift the echo used to paper over.
//
// It then fires the fade (fire-and-forget) and recomputes the masks via
// `deriveSourceMasks`.  It does NOT mutate `drawMask`/`pickMask` itself: those
// are derived outputs that `deriveSourceMasks` owns, packed from `enabled` +
// live fade opacity.  Recompute-from-truth replaces the old
// remember-to-flip-the-mask dance, which is why there's no await and no
// last-issued-wins re-read here — the fade registry's last-issued fade and the
// per-frame derive together handle a rapid concurrent toggle.
//
// React no longer learns the mask through an echo: the SettingsPanel reads
// `selectVisibleSourceMask(store.getState())`, a pure projection of the same
// `enabled` bits the store action writes. One source of truth, projected on
// read, so there is no mirror to keep in step (no `onMaskChange` fire here).
//
// Does NOT trigger loading: the render loop's `reevaluateDemand` reads the
// galaxy catalog's `enabled` bit (the flag flipped here) and loads the now-visible
// galaxy catalog (and companions) next frame, so visibility and loading stay
// decoupled.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SourceType } from '../../../@types/data/SourceType';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setGalaxyCatalogVisibleAction } from '../settingsStore/actions/setGalaxyCatalogVisibleAction';

export function setSourceVisibleImpl(
  state: Pick<EngineState, 'sources' | 'settings' | 'subsystems'>,
  store: SettingsStore,
  source: SourceType,
  visible: boolean,
): void {
  const id = galaxyCatalogIdOf(source);
  if (state.settings.galaxyCatalogs.items[id].enabled === visible) return; // no-op
  // Single source of truth: flip the galaxy catalog's enabled flag THROUGH the store
  // so the copy-on-write write notifies React's selector subscriber.
  setGalaxyCatalogVisibleAction(store, id, visible);
  // Fire the fade (fire-and-forget; last-issued wins inside the registry, and
  // deriveSourceMasks keeps the draw bit set while opacity > 0).
  void state.subsystems.fades.fadeTo(
    { kind: 'galaxyCatalog', id },
    visible ? 1 : 0,
    visible ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
  );
  // Recompute the masks NOW so any synchronous reader (e.g. a tier change in
  // the same tick) sees fresh intent; the frame loop re-derives anyway.
  deriveSourceMasks(state);
  // No echo and no requestRender: React reads the mask via
  // `selectVisibleSourceMask`, fadeTo owns the wake, and the per-frame
  // deriveSourceMasks keeps the masks tracking the fade.
}

// Test-only alias matching the import name used in tests.
export { setSourceVisibleImpl as setSourceVisibleForTest };
