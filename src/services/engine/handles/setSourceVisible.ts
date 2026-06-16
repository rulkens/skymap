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
// Having written the intent, it drives the fade THROUGH `syncVisibilityFades`
// (the intent → fade bridge) rather than firing an inline `fadeTo`. The bridge
// reads the just-written `enabled` intent from settings and fades the `survey`
// row's `galaxyCatalog` handle. ORDERING MATTERS: the store write MUST precede
// the bridge call, because the bridge reads intent from settings.
//
// It does NOT touch the draw/pick bitmasks: those are not stored state at all —
// `deriveSourceMasks` projects them on read (per-frame in `runFrame`, fresh at
// click time) from `enabled` + live fade opacity. The bridge fires only the
// `survey` row, so a rapid concurrent toggle is still last-issued-wins inside
// the fade registry.
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

import type { SourceType } from '../../../@types/data/SourceType';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setGalaxyCatalogVisibleAction } from '../settingsStore/actions/setGalaxyCatalogVisibleAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setSourceVisibleImpl(
  state: ApplyIntentState,
  store: SettingsStore,
  source: SourceType,
  visible: boolean,
): void {
  const id = galaxyCatalogIdOf(source);
  if (state.settings.galaxyCatalogs.items[id].enabled === visible) return; // no-op
  // Single source of truth: flip the galaxy catalog's enabled flag THROUGH the store
  // so the copy-on-write write notifies React's selector subscriber.
  setGalaxyCatalogVisibleAction(store, id, visible);
  // Drive the fade through the bridge: it reads the just-written intent and
  // fades the survey row's handle. The masks are derived on read elsewhere.
  syncVisibilityFades(state, { animate: true, only: ['survey'] });
}

// Test-only alias matching the import name used in tests.
export { setSourceVisibleImpl as setSourceVisibleForTest };
