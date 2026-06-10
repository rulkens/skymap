/**
 * selectSurveyItems — returns the RAW per-survey settings Record, by reference.
 *
 * Companion to `selectStructureItems`: the label-visibility view the
 * SettingsPanel renders spans structure categories AND the one label-bearing
 * survey (`famousGalaxy`, whose `labelEnabled` lives here, not on a structure
 * row). The React consumer feeds this stable Record alongside the structure
 * items into `projectLabelCategoryVisibility`'s `useMemo`.
 *
 * ### Why the raw Record (same stable-ref reasoning as the structure items)
 *
 * `useSyncExternalStore`'s `getSnapshot` must return a referentially-stable
 * value when nothing changed. Returning `state.surveys.items` verbatim keeps it
 * stable under copy-on-write — the reference changes only when a survey row
 * actually changes (a per-survey reducer spreads a new `items`), and is
 * UNCHANGED when a sibling leaf like `surveys.brightness` is set. Projecting a
 * derived map inside the selector would mint a fresh object per read and break
 * that contract.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { SurveyId } from '../../../../@types/engine/data/SurveyId';
import type { SurveyItemSettings } from '../../../../@types/settings/SurveyItemSettings';

export function selectSurveyItems(
  state: EngineSettingsState,
): Record<SurveyId, SurveyItemSettings> {
  return state.surveys.items;
}
