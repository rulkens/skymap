/**
 * applyEffect — apply a partial `SettingsSnapshot` patch (one tour effect's
 * settings delta) onto the live engine settings store, then re-fade ONLY the
 * layers whose settings live in the patched clusters.
 *
 * Like `restoreSettings`, this lands the patch through ONE
 * `store.dispatch(mergeSnapshot(...))` — a single transition that NOTIFIES
 * React's settings subscribers — rather than mutating the held state object in
 * place (which would bypass dispatch and leave the panel stale). `mergeSnapshot`
 * merges only the clusters the patch carries, so untouched clusters keep their
 * live values.
 *
 * Two steps:
 *
 *   1. One `mergeSnapshot` dispatch merging the patched clusters in.
 *   2. Narrow the bridge to the affected fade keys, DERIVED FROM THE MANIFEST.
 *      Each intent row declares the `SettingsSnapshot` cluster it reads via
 *      `row.cluster`, so the cluster→keys map is read off the manifest itself —
 *      not a parallel translation table that could drift. Only the patched
 *      clusters' rows re-fade (their `post` runs); rows for untouched clusters
 *      are skipped.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../@types/engine/settings/SettingsSnapshot';
import type { AppStore } from '../../../store/types';
import { mergeSnapshot } from '../../../state/settings/settingsSlice';
import { FADE_LAYERS } from './fadeLayers';
import { syncVisibilityFades } from './syncVisibilityFades';

export function applyEffect(
  state: EngineState,
  store: AppStore,
  patch: Partial<SettingsSnapshot>,
  opts: { animate: boolean },
): void {
  // One dispatch → one store notification; only the patch's own clusters are
  // merged in.
  store.dispatch(mergeSnapshot(patch));

  // Map the touched clusters to their fade keys off the manifest's `cluster`
  // field — no parallel table.
  const touched = new Set(Object.keys(patch));
  const only = FADE_LAYERS.filter(
    (r) => r.intent !== undefined && r.cluster !== undefined && touched.has(r.cluster),
  ).map((r) => r.key);

  syncVisibilityFades(state, { animate: opts.animate, only });
}
