/**
 * setTierAction — the thin imperative bridge for the data-resolution preset.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setTier`); the action adds nothing but the `setState`
 * call. The catalog/volume reload side-effect that a tier change implies lives
 * in the engine handle's `setTier`, not here.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { Tier } from '../../../../@types/data/Tier';
import { setTier } from '../reducers/setTier';

export function setTierAction(store: SettingsStore, tier: Tier): void {
  store.setState((s) => setTier(s, tier));
}
