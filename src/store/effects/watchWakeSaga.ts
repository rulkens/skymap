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

import { settingsRoute, cameraRoute, timeRoute } from '../constants';
import type { ReconcileEffects } from './ReconcileEffects';

// WAKE_ROUTES — the registry of store routes whose writes affect the drawn
// scene and must poke the passive render-on-demand scheduler. Settings, camera,
// and the sim clock. Membership by route means new actions within any listed
// slice wake the renderer by construction, with no per-action `did we remember
// requestRender?` audit.
//
// `timeRoute` is a wake route so a clock intent seen while the scene is at rest
// (loop asleep) redraws immediately: pressing Play must produce the first
// playing frame at once rather than waiting up to one live-idle tick for a
// coincidental wake, and a paused rate/direction/scrub step must repaint the
// single new frame it implies. Unlike selection, the clock has no hover-style
// sub-action with no GPU consequence, so route-level membership is the right
// granularity here — every `time/` write moves the rendered instant. The
// throttled engine→store distance report is dispatched on the *engine* route
// (`engine/engineBodyDistanceReported`), not `time/`, so it does not re-enter
// this wake path — no feedback loop between the render report and this trigger.
//
// Selection is deliberately NOT a wake route: it has its own dedicated
// `watchSelectionWakeSaga` (src/state/selection/) that wakes on select / focus
// / clear via takeEvery. Route-level granularity would wake on the whole
// selection slice — including `updateSelectionHover`, which has no GPU
// consequence (it only feeds the React InfoCard) and must stay wake-free. The
// per-action saga draws that line; a route membership can't.
const WAKE_ROUTES = new Set<string>([settingsRoute, cameraRoute, timeRoute]);
const isWakeWrite = (a: Action): boolean =>
  typeof a.type === 'string' && WAKE_ROUTES.has(a.type.split('/')[0]!);

export function* watchWakeSaga() {
  yield* takeEvery(isWakeWrite, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}
