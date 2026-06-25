/**
 * watchFadesSaga — push a visibility-layer sync to the fade bridge on every
 * action that appears in FADE_ROW, plus the FADE_ROW dispatch table itself.
 *
 * FADE_ROW is the flat 1:1 action→VisibilityLayerKey registry that replaces
 * a chain of near-identical setter bodies (simplicity.md §7 — data-table, not
 * a branch chain). Adding a new fade-triggering action is one line in the
 * table; this worker never changes.
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
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  writeVolumeField,
  setVolumesEnabled,
  setFlow,
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
  [setMilkyWayEnabled.type]: 'milkyWayDisk',
  [setMilkyWayLabelEnabled.type]: 'milkyWayLabel',
  [setStructureItemEnabled.type]: 'structureRing',
  [setStructureLabelEnabled.type]: 'structureLabel',
  [writeVolumeField.type]: 'volumeField',
  [setVolumesEnabled.type]: 'volumesMaster',
  [setFlow.type]: 'flow',
};

export function* watchFadesSaga() {
  yield* takeEvery(
    (a: Action) => a.type in FADE_ROW,
    function* (action: Action) {
      const fx = yield* getContext<ReconcileEffects>('reconcile');
      fx.syncFades([FADE_ROW[action.type]!]);
    },
  );
}
