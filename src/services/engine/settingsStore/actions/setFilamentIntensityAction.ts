/**
 * setFilamentIntensityAction — the thin imperative bridge for the
 * filament-skeleton intensity scale.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setFilamentIntensity`); the action adds nothing but
 * the `setState` call. The `[0, 1]` clamp is NOT here — it lives at the filament
 * renderer's point of use (`clampFilamentIntensity`), so the action stores raw
 * intent.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setFilamentIntensity } from '../reducers/setFilamentIntensity';

export function setFilamentIntensityAction(store: SettingsStore, intensity: number): void {
  store.setState((s) => setFilamentIntensity(s, intensity));
}
