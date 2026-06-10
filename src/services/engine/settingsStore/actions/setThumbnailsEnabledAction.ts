/**
 * setThumbnailsEnabledAction — the thin imperative bridge for the
 * galaxy-thumbnail overlay toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setThumbnailsEnabled`); the action adds nothing but
 * the `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setThumbnailsEnabled } from '../reducers/setThumbnailsEnabled';

export function setThumbnailsEnabledAction(store: SettingsStore, enabled: boolean): void {
  store.setState((s) => setThumbnailsEnabled(s, enabled));
}
