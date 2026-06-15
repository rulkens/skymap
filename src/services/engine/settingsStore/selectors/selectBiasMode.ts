/**
 * selectBiasMode — pure projection of the Malmquist-bias correction mode.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectBiasMode, …)` and re-renders only when the
 * value changes; the engine reads the same field off
 * `state.settings.bias.mode`. The projection returns a PRIMITIVE numeric mode,
 * so `useSyncExternalStore` can compare snapshots by value (`Object.is`) and
 * skip the render when nothing moved — a record/object return would compare by
 * reference and re-render on every store write. A free function (not a method)
 * carries no framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { BiasMode } from '../../../../@types/data/galaxyCatalog/BiasMode';

export function selectBiasMode(state: EngineSettingsState): BiasMode {
  return state.bias.mode;
}
