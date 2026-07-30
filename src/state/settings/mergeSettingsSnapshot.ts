/**
 * mergeSettingsSnapshot — pure reducer that lays a (possibly partial)
 * `SettingsSnapshot` back onto an `EngineSettingsState`.
 *
 * The cinematic tour captures the user's settings, plays effects that mutate
 * them, then restores the capture via `restoreSceneSaga`, which `put`s
 * `mergeSnapshot(snapshot)`. This reducer is that write: replace each cluster the
 * snapshot carries, leave the rest untouched. It stays patch-shaped (a `Partial`
 * snapshot) even though the tour restore always sends all ten clusters, so a
 * narrower patch would merge the same way.
 *
 * The fade that follows is NOT this reducer's concern: `watchFadesSaga` reacts to
 * `mergeSnapshot` and re-fades every layer to the merged intent.
 *
 * Two properties it guarantees:
 *
 *   1. **Detached.** Each present cluster is `structuredClone`d in, so the live
 *      settings never alias the Readonly snapshot — a later mutation of either
 *      can't bleed into the other. (`structuredClone` of the whole patch in one
 *      shot is enough: only the keys present on the patch are cloned and spread,
 *      so a partial patch touches only its own clusters.)
 *   2. **Copy-on-write.** A fresh top-level object; every cluster the patch
 *      omits keeps its existing reference, so React selectors over untouched
 *      clusters skip re-rendering and the engine's per-frame reads stay cheap.
 *
 * Routing the write through this reducer (via `store.setState`) — rather than
 * assigning onto the held state object in place — is what makes a restore
 * actually NOTIFY the settings store, so React's `useSyncExternalStore`
 * subscribers wake instead of silently going stale.
 */

import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

export function mergeSettingsSnapshot(
  state: EngineSettingsState,
  patch: Partial<SettingsSnapshot>,
): EngineSettingsState {
  // structuredClone(patch) deep-copies only the clusters the patch carries; the
  // spread overlays them onto a fresh top-level state and strips the snapshot's
  // `Readonly` so they land in the mutable settings slots.
  return { ...state, ...(structuredClone(patch) as Partial<EngineSettingsState>) };
}
