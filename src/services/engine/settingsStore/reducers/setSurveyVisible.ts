/**
 * setSurveyVisible — pure reducer flipping one survey's layer-visibility bit.
 *
 * Per-survey visibility is the AUTHORITATIVE on/off intent for a survey layer
 * (`deriveSourceMasks` packs the draw/pick bitmasks FROM this flag, never the
 * other way round). This reducer is the copy-on-write write of that single
 * source of truth.
 *
 * Three nested copies, no deeper: a new top-level state, a new `surveys`
 * cluster, a new `items` record, and a new row for the touched survey id.
 * Sibling clusters, sibling survey rows, and the survey's own `labelEnabled`
 * all keep their existing references — structural sharing so selectors over
 * untouched rows skip re-rendering. Mutating `items[id].enabled` in place would
 * defeat that and risk a stale snapshot the per-frame derive reads from.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { SurveyId } from '../../../../@types/engine/data/SurveyId';

export function setSurveyVisible(
  state: EngineSettingsState,
  id: SurveyId,
  enabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    surveys: {
      ...state.surveys,
      items: {
        ...state.surveys.items,
        [id]: { ...state.surveys.items[id], enabled },
      },
    },
  };
}
