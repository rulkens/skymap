/**
 * setSurveyLabelEnabledAction — the thin imperative bridge flipping one survey's
 * text-label-visibility flag. Runs the pure `setSurveyLabelEnabled` reducer
 * through `store.setState`, the single place `surveys.items[id].labelEnabled` is
 * written, so React's `useSettingsStore(selectSurveyItems)` subscriber wakes.
 * The survey's `labelLayer` fade (when it bears one — famous carries
 * `galaxyNames`) stays in the handle setter — a render concern, not a settings
 * write.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { SurveyId } from '../../../../@types/engine/data/SurveyId';
import { setSurveyLabelEnabled } from '../reducers/setSurveyLabelEnabled';

export function setSurveyLabelEnabledAction(
  store: SettingsStore,
  id: SurveyId,
  labelEnabled: boolean,
): void {
  store.setState((s) => setSurveyLabelEnabled(s, id, labelEnabled));
}
