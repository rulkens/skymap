/**
 * setBiasModeAction — the thin imperative bridge for the Malmquist-bias mode.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setBiasMode`); the action adds nothing but the
 * `setState` call. The async worker re-bake the bias mode triggers is NOT this
 * action's concern — the engine's bespoke `setBiasMode` performs it alongside
 * dispatching here.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { BiasMode } from '../../../../@types/data/galaxyCatalog/BiasMode';
import { setBiasMode } from '../reducers/setBiasMode';

export function setBiasModeAction(store: SettingsStore, mode: BiasMode): void {
  store.setState((s) => setBiasMode(s, mode));
}
