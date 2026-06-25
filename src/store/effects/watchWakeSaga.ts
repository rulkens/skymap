/**
 * watchWakeSaga — request a render frame on every write to a WAKE_ROUTE.
 *
 * The render-on-demand scheduler is passive; something must poke it after
 * state changes that affect the drawn scene. A single route-membership check
 * covers all writes to settings and camera by construction, without per-action
 * `did we remember requestRender?` audits.
 *
 * WAKE_ROUTES centralises the wake 'by construction': membership (settings and
 * camera) covers every action that affects the drawn scene. New actions in any
 * wake-route slice wake the renderer automatically.
 *
 * The worker reaches the engine via getContext — the ReconcileEffects closure
 * registered by the engine after construction. This keeps the store layer free
 * of engine imports while still letting the saga trigger the render effect.
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { settingsRoute, cameraRoute } from '../constants';
import type { ReconcileEffects } from './ReconcileEffects';

// WAKE_ROUTES — the registry of store routes whose writes affect the drawn
// scene and must poke the passive render-on-demand scheduler. Settings and
// camera today; selection joins when it lands. Membership by route means new
// actions within any listed slice wake the renderer by construction, with no
// per-action `did we remember requestRender?` audit.
const WAKE_ROUTES = new Set<string>([settingsRoute, cameraRoute]);
const isWakeWrite = (a: Action): boolean =>
  typeof a.type === 'string' && WAKE_ROUTES.has(a.type.split('/')[0]!);

export function* watchWakeSaga() {
  yield* takeEvery(isWakeWrite, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
