/**
 * applyEffect — apply a partial `SettingsSnapshot` patch (one tour effect's
 * settings delta) onto the live engine state, then re-fade ONLY the layers
 * whose settings live in the patched clusters.
 *
 * Like `restoreSettings`, this is the silent tour path: it writes the patched
 * clusters straight onto `state.settings` (detached via `structuredClone`, so
 * the live settings don't alias the Readonly patch). It carries no `cb` — an
 * effect is a within-playback mutation, not the user-facing restore that owns
 * the single React echo.
 *
 * Two steps:
 *
 *   1. Deep-assign ONLY the clusters present in `patch`. Untouched clusters keep
 *      their live values.
 *   2. Narrow the bridge to the affected fade keys, DERIVED FROM THE MANIFEST.
 *      Each intent row declares the `SettingsSnapshot` cluster it reads via
 *      `row.cluster`, so the cluster→keys map is read off the manifest itself —
 *      not a parallel translation table that could drift. Only the patched
 *      clusters' rows re-fade (their `post` runs); rows for untouched clusters
 *      are skipped.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../@types/engine/settings/SettingsSnapshot';
import { FADE_LAYERS } from './fadeLayers';
import { syncVisibilityFades } from './syncVisibilityFades';

export function applyEffect(
  state: EngineState,
  patch: Partial<SettingsSnapshot>,
  opts: { animate: boolean },
): void {
  // Six explicit guarded assignments rather than a `keyof` loop: a union key
  // would type each write target as the INTERSECTION of all six cluster shapes,
  // which no single cluster value satisfies. Spelling each concrete key lets
  // every assignment typecheck on its own; the `undefined` guard keeps the
  // patch partial (untouched clusters retain their live values). The `as` cast
  // lands the Readonly-typed clone into the mutable slot.
  if (patch.galaxyCatalogs !== undefined)
    state.settings.galaxyCatalogs = structuredClone(
      patch.galaxyCatalogs,
    ) as EngineState['settings']['galaxyCatalogs'];
  if (patch.structures !== undefined)
    state.settings.structures = structuredClone(
      patch.structures,
    ) as EngineState['settings']['structures'];
  if (patch.volumes !== undefined)
    state.settings.volumes = structuredClone(
      patch.volumes,
    ) as EngineState['settings']['volumes'];
  if (patch.filaments !== undefined)
    state.settings.filaments = structuredClone(
      patch.filaments,
    ) as EngineState['settings']['filaments'];
  if (patch.milkyWay !== undefined)
    state.settings.milkyWay = structuredClone(
      patch.milkyWay,
    ) as EngineState['settings']['milkyWay'];
  if (patch.flow !== undefined)
    state.settings.flow = structuredClone(patch.flow) as EngineState['settings']['flow'];

  // Map the touched clusters to their fade keys off the manifest's `cluster`
  // field — no parallel table.
  const touched = new Set(Object.keys(patch));
  const only = FADE_LAYERS.filter(
    (r) => r.intent !== undefined && r.cluster !== undefined && touched.has(r.cluster),
  ).map((r) => r.key);

  syncVisibilityFades(state, { animate: opts.animate, only });
}
