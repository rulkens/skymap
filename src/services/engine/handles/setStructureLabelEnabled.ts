// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-category visibility setter living at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf, drives
// the matching per-category FadeRegistry handle for a smooth ramp, and echoes
// a fresh DERIVED record via the callback. fadeTo owns the render wake, so the
// setter never calls requestRender itself. The `createEngine` literal
// delegates here.
//
// Fading the per-category handle keeps the toggle smooth: the producer
// (produceStructureLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop a category in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import { deriveLabelCategoryVisibility } from '../helpers/deriveLabelCategoryVisibility';

export function setStructureLabelEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  cb: Pick<EngineCallbacks, 'labels'>,
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
  state.settings.structures.items[category].labelEnabled = visible;
  cb.labels?.onLabelCategoryVisibilityChange?.(deriveLabelCategoryVisibility(state));
  // No requestRender: the unconditional fadeTo above wakes the scheduler.
}

// Test-only alias matching the import name used in tests.
export { setStructureLabelEnabled as setStructureLabelEnabledForTest };
