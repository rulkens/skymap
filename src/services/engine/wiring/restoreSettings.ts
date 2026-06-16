/**
 * restoreSettings — put a captured `SettingsSnapshot` back onto the live engine
 * state, then re-fade every layer to the restored intent.
 *
 * This is the close of the tour's capture → play → restore round-trip
 * (`captureSettings` is the open). It is the SILENT tour path: it writes the
 * six clusters straight onto `state.settings` rather than through the
 * React-notifying settings-store actions, because a tour drives many leaves at
 * once and a per-leaf React echo per restore would thrash. The single optional
 * `cb` is that one React echo, fired once after the whole restore.
 *
 * Three steps, in order:
 *
 *   1. Silent in-place cluster restore. For each of the six snapshot clusters,
 *      `structuredClone` it onto `state.settings[k]`. The clone DETACHES the
 *      live settings from the snapshot (and vice-versa) so a later mutation of
 *      either can't bleed into the other — the same detachment `captureSettings`
 *      makes on the way in.
 *   2. One bridge pass over ALL intent rows (`syncVisibilityFades` with no
 *      `only`). A full restore should recompute everything, so the bridge reads
 *      the just-restored intent and fades each layer to it (running each row's
 *      `post`).
 *   3. One optional React echo (`cb`), AFTER the sync.
 *
 * Demand re-evaluates next frame from the restored intent — no demand changes
 * happen here.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../@types/engine/settings/SettingsSnapshot';
import { syncVisibilityFades } from './syncVisibilityFades';

export function restoreSettings(
  state: EngineState,
  snapshot: SettingsSnapshot,
  opts: { animate: boolean },
  cb?: () => void,
): void {
  // `state.settings` is the store's held object; reassigning its cluster
  // properties is the intended in-place restore. structuredClone keeps the live
  // settings from aliasing the (Readonly) snapshot. Six explicit per-cluster
  // assignments rather than a `keyof` loop: a union key would type each write
  // target as the INTERSECTION of all six cluster shapes, which no single
  // cluster value satisfies. Spelling each concrete key lets every assignment
  // typecheck on its own. The `as` cast lands the Readonly-typed clone into the
  // mutable slot.
  state.settings.galaxyCatalogs = structuredClone(
    snapshot.galaxyCatalogs,
  ) as EngineState['settings']['galaxyCatalogs'];
  state.settings.structures = structuredClone(
    snapshot.structures,
  ) as EngineState['settings']['structures'];
  state.settings.volumes = structuredClone(snapshot.volumes) as EngineState['settings']['volumes'];
  state.settings.filaments = structuredClone(
    snapshot.filaments,
  ) as EngineState['settings']['filaments'];
  state.settings.milkyWay = structuredClone(
    snapshot.milkyWay,
  ) as EngineState['settings']['milkyWay'];
  state.settings.flow = structuredClone(snapshot.flow) as EngineState['settings']['flow'];

  // Full restore → re-fade every intent row from the restored intent.
  syncVisibilityFades(state, { animate: opts.animate });

  cb?.();
}
