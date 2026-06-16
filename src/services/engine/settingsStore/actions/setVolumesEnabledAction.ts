/**
 * setVolumesEnabledAction — the thin imperative bridge for the scalar-volume
 * overlay master toggle.
 *
 * Runs the pure `setVolumesEnabled` reducer through `store.setState`, the only
 * place a write lands. The cosmetic master fade ramp is a render side-effect, not
 * a settings write: it flows through `syncVisibilityFades` (the intent → fade
 * bridge), which reads the just-written intent and fades the `volumesMaster`
 * handle — it does not live in this action.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setVolumesEnabled } from '../reducers/setVolumesEnabled';

export function setVolumesEnabledAction(store: SettingsStore, enabled: boolean): void {
  store.setState((s) => setVolumesEnabled(s, enabled));
}
