/**
 * setSurveyLabelEnabled — pure reducer flipping one survey's text-label
 * visibility (`surveys.items[id].labelEnabled`).
 *
 * Survey label visibility co-locates with the survey's `enabled` row rather
 * than sitting in a parallel record: one place reads both points-on/off and
 * labels-on/off for a survey. Only the famous-galaxy survey actually renders a
 * label today; the others carry the flag inertly. The flag is authoritative —
 * `projectLabelCategoryVisibility` packs the panel's checkbox view FROM it for
 * the `famousGalaxy` slot.
 *
 * Three nested copies, no deeper: a new top-level state, a new `surveys`
 * cluster, a new `items` record, and a new row for the touched survey. Sibling
 * surveys and the survey's own `enabled` layer-visibility flag keep their
 * existing references.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { SurveyId } from '../../../../@types/engine/data/SurveyId';

export function setSurveyLabelEnabled(
  state: EngineSettingsState,
  id: SurveyId,
  labelEnabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    surveys: {
      ...state.surveys,
      items: {
        ...state.surveys.items,
        [id]: { ...state.surveys.items[id], labelEnabled },
      },
    },
  };
}
