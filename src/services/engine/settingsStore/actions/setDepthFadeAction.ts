/**
 * setDepthFadeAction — the thin imperative bridge for the galaxy catalog depth-fade
 * toggle. Runs the pure `setDepthFade` reducer through `store.setState`; the
 * action adds nothing but the write call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setDepthFade } from '../reducers/setDepthFade';

export function setDepthFadeAction(store: SettingsStore, depthFade: boolean): void {
  store.setState((s) => setDepthFade(s, depthFade));
}
