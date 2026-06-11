/**
 * setVolumesEnabledAction — the thin imperative bridge for the scalar-volume
 * overlay master toggle.
 *
 * Runs the pure `setVolumesEnabled` reducer through `store.setState`, the only
 * place a write lands. The cosmetic master fade ramp (`fades.fadeTo({ kind:
 * 'volumesMaster' })`) stays in the handle setter alongside this action — it's a
 * render side-effect, not a settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setVolumesEnabled } from '../reducers/setVolumesEnabled';

export function setVolumesEnabledAction(store: SettingsStore, enabled: boolean): void {
  store.setState((s) => setVolumesEnabled(s, enabled));
}
