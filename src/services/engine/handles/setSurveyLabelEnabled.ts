// ── Test-accessible category-visibility logic ───────────────────────────────
//
// A per-survey label-visibility setter living at module scope (mirroring
// `setSourceVisibleImpl`) so tests can drive it against a partial-state stub
// without a full GPU engine. It writes the authoritative settings leaf, drives
// the matching FadeRegistry handle for a smooth ramp, and echoes a fresh
// DERIVED record via the callback. The `createEngine` literal delegates here.
//
// Fading the survey's label handle keeps the toggle smooth: the producer
// (produceFamousLabels) reads `opacityOf({...})` for its layer alpha, so
// flipping the boolean alone would pop the labels in/out. The boolean is the
// authoritative gate (the producer draws while enabled OR still fading out);
// the fade opacity is only the cosmetic alpha.

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { SurveyId } from '../../../@types/engine/data/SurveyId';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { deriveLabelCategoryVisibility } from '../helpers/deriveLabelCategoryVisibility';

export function setSurveyLabelEnabled(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  cb: Pick<EngineCallbacks, 'labels'>,
  survey: SurveyId,
  enabled: boolean,
): void {
  // Single source of truth for survey label visibility: the survey's item row.
  state.settings.surveys.items[survey].labelEnabled = enabled;
  // Fire the survey's label fade IF it bears one — registry-driven: famous
  // carries labelLayer 'galaxyNames', the other surveys carry none, so a
  // labelEnabled toggle on a label-free survey just writes the (inert) flag.
  const entry = SOURCE_ENTRIES.find((e) => e.id === survey);
  const layer = entry && 'labelLayer' in entry ? entry.labelLayer : undefined;
  if (layer) {
    void state.subsystems.fades.fadeTo(
      { kind: 'labelLayer', layer },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
  }
  cb.labels?.onLabelCategoryVisibilityChange?.(deriveLabelCategoryVisibility(state));
  // No requestRender: with a layer the fadeTo above wakes the scheduler;
  // without one the flag is render-inert — no producer reads it.
}

// Test-only alias matching the import name used in tests.
export { setSurveyLabelEnabled as setSurveyLabelEnabledForTest };
