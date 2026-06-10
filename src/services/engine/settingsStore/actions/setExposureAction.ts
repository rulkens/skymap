/**
 * setExposureAction — the thin imperative bridge for the HDR tone-map exposure
 * multiplier.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setExposure`); the action adds nothing but the
 * `setState` call. No clamp here — the post-process pass (`clampExposure`) is
 * the single home for exposure's HDR-safe bound; the action stores raw intent.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setExposure } from '../reducers/setExposure';

export function setExposureAction(store: SettingsStore, exposure: number): void {
  store.setState((s) => setExposure(s, exposure));
}
