/**
 * reconcileSagas — the four store sagas that translate settings writes into
 * engine side-effects, plus the FADE_ROW dispatch table.
 *
 * FADE_ROW is the flat 1:1 action→VisibilityLayerKey registry that replaces
 * a chain of near-identical setter bodies (simplicity.md §7 — data-table, not
 * a branch chain). Adding a new fade-triggering action is one line here;
 * watchFades never changes.
 *
 * watchWake centralises the render-wake 'by construction': one
 * startsWith(settingsRoute+'/') matcher over the entire write stream means
 * there is no per-action 'did we remember requestRender?' audit to maintain.
 * New actions in the slice wake the renderer automatically.
 *
 * watchFlowReseed and watchBiasBake are narrow: they fire only on their
 * specific action type and delegate immediately to the effect closure.
 * Early-return guards within the worker keep the logic explicit and
 * co-located rather than spread across predicates.
 *
 * Each worker reaches the engine via getContext — the ReconcileEffects
 * closures registered by the engine after construction. This keeps the store
 * layer free of engine imports while still letting sagas trigger render,
 * fade, and recompute effects.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { settingsRoute } from '../constants';
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
  setBiasMode,
} from '../../state/settings/settingsSlice';
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { ReconcileEffects } from './ReconcileEffects';

/**
 * FADE_ROW — flat data table: write-action type string → the
 * VisibilityLayerKey it drives. One entry per action that should trigger a
 * fade-bridge sync. Pure data; watchFades dispatches by lookup, never by
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

// Predicate: any action whose type lives under the settings-route namespace.
// The prefix check covers every slice action without enumeration — new actions
// wake the renderer automatically.
const isSettingsWrite = (a: Action): boolean =>
  typeof a.type === 'string' && a.type.startsWith(`${settingsRoute}/`);

/**
 * watchWake — request a render frame on every settings write.
 *
 * The render-on-demand scheduler is passive; something must poke it after
 * state changes that affect the drawn scene. Rather than each setter
 * remembering to call requestRender, a single prefix-matcher covers the
 * entire settings namespace by construction.
 */
export function* watchWake() {
  yield* takeEvery(isSettingsWrite, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}

/**
 * watchFades — push a visibility-layer sync to the fade bridge on every
 * action that appears in FADE_ROW.
 *
 * The table lookup replaces near-identical per-action handlers. Adding a new
 * fade-triggering action requires only a new FADE_ROW entry; this worker
 * never changes.
 */
export function* watchFades() {
  yield* takeEvery(
    (a: Action) => a.type in FADE_ROW,
    function* (action: Action) {
      const fx = yield* getContext<ReconcileEffects>('reconcile');
      fx.syncFades([FADE_ROW[action.type]!]);
    },
  );
}

/**
 * watchFlowReseed — reseed the cosmic-flow particle field when the user
 * changes the particle count or flow mode. Patch-only writes (e.g.
 * enabled toggle) skip the reseed: reseeding is only required when the
 * particle population or its generation parameters change.
 */
export function* watchFlowReseed() {
  yield* takeEvery(setFlow, function* (a) {
    if (a.payload.mode === undefined && a.payload.count === undefined) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.reseedFlow();
  });
}

/**
 * watchBiasBake — re-compute the galaxy brightness bias LUT whenever the
 * active BiasMode changes. The bake is synchronous on the engine side;
 * the saga simply forwards the new mode value.
 */
export function* watchBiasBake() {
  yield* takeEvery(setBiasMode, function* (a) {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.bakeBias(a.payload);
  });
}
