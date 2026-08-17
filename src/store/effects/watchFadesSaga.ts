/**
 * watchFadesSaga — drive the intent→fade bridge off settings writes. Two arms:
 *
 *   1. Per-leaf writes in FADE_ROW → fade the one affected layer.
 *   2. `mergeSnapshot` (a bulk settings write) → fade EVERY row.
 *
 * FADE_ROW is the flat 1:1 action→VisibilityLayerKey registry that replaces
 * a chain of near-identical setter bodies (simplicity.md §7 — data-table, not
 * a branch chain). Adding a new fade-triggering leaf write is one line in the
 * table; that arm never changes.
 *
 * The `mergeSnapshot` arm is why a tour scene-restore needs NO restore-specific
 * engine effect: `restoreSceneSaga` simply `put`s `mergeSnapshot(settings)`, and
 * this arm reacts by re-fading every layer to the restored intent — the same
 * "settings write → fade" rule the per-leaf arm applies, just over the whole set.
 * `mergeSnapshot` is the only bulk write, so a full pass (`syncFades()` with no
 * rows) is the right scope; the bridge's no-op-if-unchanged guard makes re-fading
 * untouched rows free.
 *
 * The worker reaches the engine via getContext — the ReconcileEffects closure
 * registered by the engine after construction. This keeps the store layer free
 * of engine imports while still letting the saga trigger the fade effect.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import {
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setFilamentsEnabled,
  setOrbitTrailsEnabled,
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setStarCatalogLabelEnabled,
  setBodyLabelEnabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  writeVolumeField,
  setVolumesEnabled,
  setFlowEnabled,
  setConstellationsEnabled,
  setZoneOfAvoidanceEnabled,
  mergeSnapshot,
} from '../../state/settings/settingsSlice';
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { ReconcileEffects } from './ReconcileEffects';

/**
 * FADE_ROW — flat data table: write-action type string → the
 * VisibilityLayerKey it drives. One entry per action that should trigger a
 * fade-bridge sync. Pure data; watchFadesSaga dispatches by lookup, never by
 * if/switch.
 *
 * Every matching write fires `syncFades`, including numeric-only patches via
 * `writeVolumeField` (contrast, intensity, …). The fade bridge owns the
 * no-op-if-unchanged guard, so a patch that doesn't cross a visibility
 * boundary is a cheap lookup with no visible effect.
 */
export const FADE_ROW: Partial<Record<string, VisibilityLayerKey>> = {
  [setGalaxyCatalogVisible.type]: 'survey',
  [setGalaxyCatalogLabelEnabled.type]: 'surveyLabel',
  [setFilamentsEnabled.type]: 'filaments',
  [setOrbitTrailsEnabled.type]: 'orbitTrails',
  [setMilkyWayEnabled.type]: 'milkyWayDisk',
  [setMilkyWayLabelEnabled.type]: 'milkyWayLabel',
  [setStarCatalogLabelEnabled.type]: 'starCatalogLabel',
  [setBodyLabelEnabled.type]: 'bodyLabel',
  [setStructureItemEnabled.type]: 'structureRing',
  [setStructureLabelEnabled.type]: 'structureLabel',
  [writeVolumeField.type]: 'volumeField',
  [setVolumesEnabled.type]: 'volumesMaster',
  [setFlowEnabled.type]: 'flow',
  // Only the ENABLE setter drives the visibility fade. setConstellationIntensity
  // is a brightness scale with no fade layer — deliberately absent, mirroring
  // setFilamentIntensity.
  [setConstellationsEnabled.type]: 'constellations',
  [setZoneOfAvoidanceEnabled.type]: 'zoneOfAvoidance',
};

export function* watchFadesSaga() {
  // Arm 1 — per-leaf writes: fade the single affected layer.
  yield* takeEvery(
    (a: Action) => a.type in FADE_ROW,
    function* (action: Action) {
      const fx = yield* getContext<ReconcileEffects>('reconcile');
      fx.syncFades([FADE_ROW[action.type]!]);
    },
  );

  // Arm 2 — bulk restore: a mergeSnapshot re-fades every row to the merged intent.
  yield* takeEvery(mergeSnapshot, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.syncFades();
  });
}
