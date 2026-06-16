/**
 * restoreSettings — put a captured `SettingsSnapshot` back onto the live engine
 * settings store, then re-fade every layer to the restored intent.
 *
 * This is the close of the tour's capture → play → restore round-trip
 * (`captureSettings` is the open). A tour drives many leaves at once, so rather
 * than route each leaf through its per-leaf store action, the whole snapshot
 * lands in ONE `store.setState` swap (`mergeSettingsSnapshot`) — a single
 * copy-on-write transition, a single store notification. That one notification
 * is what wakes React's `useSyncExternalStore` settings subscribers; writing the
 * clusters straight onto the held state object in place would bypass `setState`
 * and leave the SettingsPanel silently stale.
 *
 * Two steps, in order:
 *
 *   1. One `store.setState` that merges all six clusters back in (detached deep
 *      clones — a later mutation of either side can't bleed into the other).
 *   2. One bridge pass over ALL intent rows (`syncVisibilityFades` with no
 *      `only`). A full restore should recompute everything, so the bridge reads
 *      the just-restored intent (via `state.settings`, now the new store value)
 *      and fades each layer to it (running each row's `post`).
 *
 * Demand re-evaluates next frame from the restored intent — no demand changes
 * happen here.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../@types/engine/settings/SettingsSnapshot';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { mergeSettingsSnapshot } from '../settingsStore/reducers/mergeSettingsSnapshot';
import { syncVisibilityFades } from './syncVisibilityFades';

export function restoreSettings(
  state: EngineState,
  store: SettingsStore,
  snapshot: SettingsSnapshot,
  opts: { animate: boolean },
): void {
  // One copy-on-write swap → one store notification. The bridge below reads the
  // restored intent through `state.settings`, which now returns this new value.
  store.setState((s) => mergeSettingsSnapshot(s, snapshot));

  // Full restore → re-fade every intent row from the restored intent.
  syncVisibilityFades(state, { animate: opts.animate });
}
