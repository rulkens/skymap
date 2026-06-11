/**
 * setSurveyVisibleAction — the thin imperative bridge flipping one survey's
 * layer-visibility bit. Runs the pure `setSurveyVisible` reducer through
 * `store.setState`, the single place the authoritative `items[id].enabled`
 * intent flag is written. The derived draw/pick bitmasks are recomputed
 * downstream (`deriveSourceMasks`) and projected for React (`selectVisibleSourceMask`).
 */

import type { SettingsStore } from '../createSettingsStore';
import type { SurveyId } from '../../../../@types/engine/data/SurveyId';
import { setSurveyVisible } from '../reducers/setSurveyVisible';

export function setSurveyVisibleAction(store: SettingsStore, id: SurveyId, enabled: boolean): void {
  store.setState((s) => setSurveyVisible(s, id, enabled));
}
