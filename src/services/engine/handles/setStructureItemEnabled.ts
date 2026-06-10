// ── Test-accessible category-visibility logic ───────────────────────────────
//
// The per-category visibility setters live at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive them against a partial-state stub
// without a full GPU engine. Each writes the authoritative settings leaf,
// drives the matching per-category FadeRegistry handle for a smooth ramp,
// echoes a fresh DERIVED record via the callback, and requests a render. The
// `createEngine` literal delegates to these.
//
// Why fade the per-category handle here?  The producers (produceStructureMarkers
// / produceStructureLabels / produceFamousLabels) already read
// `opacityOf({...})` for their layer alpha; flipping the boolean alone would pop
// a category in/out. Firing `fadeTo` on the same handle the producer reads turns
// the toggle into a smooth fade — exactly as the milkyWay/filaments setters do
// for their overlay/filaments handles. The boolean is the authoritative gate
// (the producer draws while enabled OR still fading out); the fade opacity is
// only the cosmetic alpha.

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import { deriveMarkerCategoryVisibility } from '../helpers/deriveMarkerCategoryVisibility';

export function setStructureItemEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  cb: Pick<EngineCallbacks, 'labels'>,
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
  state.settings.structures.items[category].enabled = visible;
  cb.labels?.onMarkerCategoryVisibilityChange?.(deriveMarkerCategoryVisibility(state));
  state.subsystems.scheduler.requestRender();
}

// Test-only alias matching the import name used in tests.
export { setStructureItemEnabled as setStructureItemEnabledForTest };
