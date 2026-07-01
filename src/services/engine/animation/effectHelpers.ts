/**
 * effectHelpers — one-line constructors for the Effect / CameraAction /
 * SceneEffect authoring vocabulary.
 *
 * ### Why constructors instead of raw object literals?
 *
 * Every constructor here produces a plain serializable object — no functions,
 * no class instances, no closures. But the *fields* of those objects are not
 * stable public API: the `kind`, `ch`, `space`, `ease`, `over` field names
 * can drift in concert with the type definitions without breaking clip authors,
 * as long as only this file constructs them. If clip authors wrote raw
 * `{ kind: 'set', ch: 'distance', ... }` objects, a field rename would
 * require hunting down every literal across every clip; with constructors,
 * there is exactly one place to update.
 *
 * Additionally, constructors encode the defaults — `ease: 'inOut'` and
 * `space` from `CHANNEL_SPACE[ch]` — in one place. A clip author calls
 * `dollyTo(300, 4)` and gets the right `space: 'log'` automatically;
 * they never need to remember which channels are logarithmic.
 *
 * ### Why one module, not one-file-per-function?
 *
 * These helpers form a *vocabulary* — they are always imported together (a clip
 * author imports whatever subset of the vocabulary it needs, from one place).
 * Splitting them into ~18 files would impose an import tax (one import line per
 * helper) with no compensating clarity benefit, because the helpers are not
 * independently meaningful units — `dollyTo` is meaningless without `all`,
 * `seq`, and `moveTarget`. The cohesion across the vocabulary is tighter than
 * the one-export-per-file rule requires; this is an intentional, named
 * exception, following the same reasoning as `channelSpace.ts`.
 *
 * ### `tween` rejects 'target' at the type level
 *
 * The `ch` parameter of `tween` is typed `'distance' | 'yaw' | 'pitch'`
 * (not the full `Channel` union). Passing `'target'` is a compile-time error.
 * Vec3 channels use the dedicated `moveTarget` helper, which emits a `setVec`
 * arm rather than a `set` arm.
 */

import type { CameraAction } from '../../../@types/animation/CameraAction';
import type { FocusBoundEffect } from '../../../@types/animation/FocusBoundEffect';
import type { FocusId } from '../../../@types/animation/FocusId';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import type { Effect } from '../../../@types/animation/Effect';
import type { Channel } from '../../../@types/animation/Channel';
import type { Ease } from '../../../@types/animation/Ease';
import type { Space } from '../../../@types/animation/Space';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { SettingsAction } from '../../../@types/animation/SettingsAction';
import type { PathWaypoint } from '../../../@types/animation/PathWaypoint';
import type { SplineConfig } from '../../../@types/animation/SplineConfig';
import type { PassByConfig } from '../../../@types/animation/PassByConfig';
import { CHANNEL_SPACE } from './channelSpace';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_RAMP_SEC,
  DEFAULT_LINGER,
  DEFAULT_SPLINE_CONFIG,
} from './pathDefaults';

// ---------------------------------------------------------------------------
// Camera-action helpers
// ---------------------------------------------------------------------------

/**
 * tween — builds a `set` CameraAction on a SCALAR channel.
 *
 * `ch` is intentionally narrowed to `'distance' | 'yaw' | 'pitch'`. The Vec3
 * channel `'target'` is not a scalar and is NOT accepted here — use
 * `moveTarget` instead. Passing `'target'` is a compile-time error.
 *
 * `space` defaults to `CHANNEL_SPACE[ch]` (e.g. `'log'` for `distance`,
 * `'add'` for angles). Pass an explicit `space` to override — e.g.
 * `tween('distance', { to:5, over:1, space:'lin' })` for a linear zoom.
 *
 * `ease` defaults to `'inOut'` (the natural choice for A→B camera moves).
 */
export function tween(
  ch: 'distance' | 'yaw' | 'pitch',
  opts: { to: number; over: number; ease?: Ease; space?: Space },
): CameraAction & { kind: 'set' } {
  return {
    kind: 'set',
    ch,
    to: opts.to,
    over: opts.over,
    ease: opts.ease ?? 'inOut',
    space: opts.space ?? CHANNEL_SPACE[ch],
  };
}

/**
 * dollyTo — zoom the camera to `mpc` Megaparsecs over `over` seconds.
 *
 * A thin wrapper over `tween('distance', ...)`. Space resolves to `'log'`
 * from `CHANNEL_SPACE`, giving perceptually uniform zooming across the 1–600 Mpc
 * range (1→100 Mpc feels as long as 100→10 000 Mpc).
 */
export function dollyTo(mpc: number, over: number, ease?: Ease): CameraAction & { kind: 'set' } {
  return tween('distance', { to: mpc, over, ease });
}

/**
 * moveTarget — pan the camera's orbit target to `to` over `over` seconds.
 *
 * Emits a `setVec` arm (not `set`), because `target` is a Vec3 channel that
 * moves as a unit. `space` is always `'lin'` (world-space coordinates;
 * log-space is undefined for signed values). See `CameraAction.d.ts` for the
 * full rationale on the `setVec` / `set` split.
 */
export function moveTarget(to: Vec3, over: number, ease?: Ease): CameraAction & { kind: 'setVec' } {
  return {
    kind: 'setVec',
    ch: 'target',
    to,
    over,
    ease: ease ?? 'inOut',
    space: 'lin',
  };
}

/**
 * moveTargetId — pan the camera's orbit target to the position of the structure
 * or galaxy identified by `id`, over `over` seconds.
 *
 * The UNRESOLVED form of `moveTarget`: `resolveClipFoci` rewrites it to a
 * concrete `moveTarget(vec3, over, ease)` before `compileClip` runs. Authors
 * use this when the target position is not known at clip-authoring time but
 * must be looked up from the catalog at play time via a durable `FocusId`.
 */
export function moveTargetId(
  id: FocusId,
  over: number,
  ease?: Ease,
): FocusBoundEffect & { kind: 'moveTargetId' } {
  return { kind: 'moveTargetId', id, over, ease: ease ?? 'inOut' };
}

/**
 * dollyToId — zoom the camera to the distance of the structure or galaxy
 * identified by `id`, over `over` seconds.
 *
 * The UNRESOLVED form of `dollyTo`: `resolveClipFoci` rewrites it to a concrete
 * `dollyTo(mpc, over, ease)` before `compileClip` runs. Authors use this when
 * the target distance is not known statically but must be derived from the
 * catalog at play time via a durable `FocusId`.
 */
export function dollyToId(
  id: FocusId,
  over: number,
  ease?: Ease,
): FocusBoundEffect & { kind: 'dollyToId' } {
  return { kind: 'dollyToId', id, over, ease: ease ?? 'inOut' };
}

/**
 * aimAt — point the camera at a bearing (yaw + pitch) over `over` seconds.
 *
 * Constructs an `all([ tween('yaw',...), tween('pitch',...) ])`. The two scalar
 * tweens run concurrently; they finish at the same time. Shortest-arc
 * interpolation for the angular channels is the EVALUATOR's responsibility
 * (Task 6) — this constructor emits the raw `to` values without adjustment.
 */
export function aimAt(
  bearing: { yaw: number; pitch: number },
  over: number,
  ease?: Ease,
): Effect & { kind: 'all' } {
  return all([
    tween('yaw', { to: bearing.yaw, over, ease }),
    tween('pitch', { to: bearing.pitch, over, ease }),
  ]);
}

/**
 * spin — rotate a channel BY `by` radians over `over` seconds.
 *
 * Additive: "rotate BY this amount" rather than "go TO this bearing". The
 * `loop: true` flag makes the spin perpetual (no completion event) — the
 * orbit idiom. Fork a perpetual spin to let it run under an awaited timeline:
 * `fork(spin('yaw', { by: Math.PI * 2, over: 60, loop: true }))`.
 */
export function spin(
  ch: Channel,
  opts: { by: number; over: number; ease?: Ease; loop?: boolean },
): CameraAction & { kind: 'spin' } {
  const action: CameraAction & { kind: 'spin' } = {
    kind: 'spin',
    ch,
    by: opts.by,
    over: opts.over,
    ease: opts.ease ?? 'inOut',
    ...(opts.loop !== undefined ? { loop: opts.loop } : {}),
  };
  return action;
}

/**
 * rate — ramp a channel's velocity to `to` over `over` seconds.
 *
 * Writes to the velocity layer; additive with the base layer. Integrates in
 * closed form — frame-rate-independent, scrubable. Use for the "constant orbit
 * speed" idiom.
 */
export function rate(
  ch: Channel,
  opts: { to: number; over: number; ease?: Ease },
): CameraAction & { kind: 'rate' } {
  return {
    kind: 'rate',
    ch,
    to: opts.to,
    over: opts.over,
    ease: opts.ease ?? 'inOut',
  };
}

/**
 * oscillate — add a zero-mean sine bob to a channel.
 *
 * Writes to the oscillation layer; additive with both base and velocity.
 * `amp` is the peak deviation; `period` is the full cycle length in seconds.
 *
 * By default the bob is perpetual (runs for the whole clip) at full amplitude —
 * `fork(oscillate('pitch', { amp: 0.05, period: 6 }))`. What is eased is not the
 * sinusoid but its AMPLITUDE: pass `over` (a window length) and `fade` (a ramp)
 * and the amplitude eases `0 → amp → 0` across the window, shaped by `ease`, so
 * the bob fades up and settles instead of lurching at full swing. It stays
 * zero-mean throughout, so unlike a `rate` envelope it returns to centre.
 * `fade` needs `over` (there is no end to fade out toward without a window).
 */
export function oscillate(
  ch: Channel,
  opts: { amp: number; period: number; over?: number; fade?: number; ease?: Ease },
): CameraAction & { kind: 'osc' } {
  return {
    kind: 'osc',
    ch,
    amp: opts.amp,
    period: opts.period,
    ease: opts.ease ?? 'inOut',
    ...(opts.over !== undefined ? { over: opts.over } : {}),
    ...(opts.fade !== undefined ? { fade: opts.fade } : {}),
  };
}

// ---------------------------------------------------------------------------
// Timeline structural nodes
// ---------------------------------------------------------------------------

/**
 * hold — dwell for `sec` seconds holding the current camera pose.
 *
 * Intentful pause: the "pause at a meaningful scale" beat. Semantically
 * distinct from `wait` — a `hold` is a deliberate dwell that the VIEWER
 * experiences, not a mere scheduling offset.
 */
export function hold(sec: number): Effect & { kind: 'hold' } {
  return { kind: 'hold', sec };
}

/**
 * wait — delay the following cue by `sec` seconds.
 *
 * Mechanically identical to `hold`; the distinction is INTENT: `wait` is an
 * invisible scheduling offset (the viewer does not perceive it as a beat),
 * while `hold` is an explicit, authored dwell.
 */
export function wait(sec: number): Effect & { kind: 'wait' } {
  return { kind: 'wait', sec };
}

/**
 * seq — play children in order; each starts when the previous ends.
 *
 * The primary sequencing node. The block's duration is the sum of all
 * children's durations. Perpetual children (looping spin, oscillate) inside a
 * `seq` will stall it; fork them instead.
 */
export function seq(children: Effect[]): Effect & { kind: 'seq' } {
  return { kind: 'seq', children };
}

/**
 * all — play children concurrently; the block ends when the LONGEST child ends.
 *
 * The single-writer rule (one base writer per channel) is enforced here at
 * registration time — two `set` actions on `distance` in the same `all` is a
 * conflict caught by `validateSingleWriter` (Task 5), not by this constructor.
 */
export function all(children: Effect[]): Effect & { kind: 'all' } {
  return { kind: 'all', children };
}

/**
 * fork — start `child` concurrently but do NOT wait for it.
 *
 * The block's duration ignores a fork: `seq([fork(spin(...)), hold(3)])` takes
 * 3 seconds, not the duration of the spin. A forked perpetual spin runs
 * "under" the awaited timeline and is cancelled at clip end.
 */
export function fork(child: Effect): Effect & { kind: 'fork' } {
  return { kind: 'fork', child };
}

// ---------------------------------------------------------------------------
// Scene-effect helpers
// ---------------------------------------------------------------------------

/**
 * show — set visibility INTENT for `layers` to visible, fading in over `over`
 * seconds (`undefined` → default fade duration; `0` → instant).
 *
 * Dispatches the same settings actions the UI does. The bridge in
 * `syncVisibilityFades` handles the translation to per-layer fade controllers.
 */
export function show(layers: VisibilityLayerKey[], over?: number): SceneEffect & { kind: 'show' } {
  return { kind: 'show', layers, ...(over !== undefined ? { over } : {}) };
}

/**
 * hide — set visibility INTENT for `layers` to hidden, fading out over `over`
 * seconds (`undefined` → default fade duration; `0` → instant).
 */
export function hide(layers: VisibilityLayerKey[], over?: number): SceneEffect & { kind: 'hide' } {
  return { kind: 'hide', layers, ...(over !== undefined ? { over } : {}) };
}

/**
 * fade — move the transient clip opacity of `layers` to `to` over `over`
 * seconds.
 *
 * Does NOT touch intent (the layer stays loaded/enabled). Only drives
 * `clipOpacity` — the clip-owned channel that multiplies into final alpha.
 * Resets to 1 at clip end. Use for cross-dissolve and "load behind mask then
 * reveal" idioms.
 */
export function fade(
  layers: VisibilityLayerKey[],
  to: number,
  over: number,
): SceneEffect & { kind: 'fade' } {
  return { kind: 'fade', layers, to, over };
}

/**
 * scene — dispatch a settings action as a one-shot cue.
 *
 * `action` is a `SettingsAction` — a narrow union of settings-slice creators
 * the clip model has approved. Every reconcile saga fires for free. The union
 * widens in Plan C as the tour needs additional knobs.
 */
export function scene(action: SettingsAction): SceneEffect & { kind: 'scene' } {
  return { kind: 'scene', action };
}

/**
 * focus — build a `focusId` cue addressed by a durable `FocusId` handle, or
 * `null` to clear the selection focus.
 *
 * This is the UNRESOLVED form: it carries a `FocusId` string rather than a
 * concrete `SelectionRef`. `resolveClipFoci` rewrites it to the resolved
 * `kind:'focus'` arm (in `SceneEffect`) — which carries a `SelectionRef` — at
 * play time, before `compileClip` runs. `compileClip` throws if it encounters a
 * `focusId` cue that was not resolved.
 *
 * The resolved `kind:'focus'` arm remains in `SceneEffect` and is what
 * `applySceneEffect` dispatches: the split keeps the clip-authoring vocabulary
 * (durable IDs) separate from the runtime dispatch vocabulary (concrete refs).
 */
export function focus(id: FocusId | null): FocusBoundEffect & { kind: 'focusId' } {
  return { kind: 'focusId', id };
}

// ---------------------------------------------------------------------------
// Path helpers — waypoints + the flythrough that flies a spline through them
// ---------------------------------------------------------------------------

type WaypointOpts = { yaw?: number; pitch?: number; over?: number; linger?: number };

function waypointExtras(opts?: WaypointOpts): WaypointOpts {
  return {
    ...(opts?.yaw !== undefined ? { yaw: opts.yaw } : {}),
    ...(opts?.pitch !== undefined ? { pitch: opts.pitch } : {}),
    ...(opts?.over !== undefined ? { over: opts.over } : {}),
    ...(opts?.linger !== undefined ? { linger: opts.linger } : {}),
  };
}

/**
 * atPoint — a `flyPath` waypoint at a concrete world position and distance.
 *
 * `opts.over` pins the seconds of the leg leading into this waypoint (omit for
 * the arc-length share of the path total — uniform speed). `opts.yaw`/`pitch`
 * pin the approach angle (omit to interpolate it across the leg).
 */
export function atPoint(at: Vec3, distance: number, opts?: WaypointOpts): PathWaypoint {
  return { at, distance, ...waypointExtras(opts) };
}

/**
 * atFocus — a `flyPath` waypoint addressed by a durable `FocusId`. The UNRESOLVED
 * form: `resolveClipFoci` rewrites it to an `atPoint`-shaped waypoint (the
 * structure/galaxy's framed position + distance) before `compileClip` runs.
 */
export function atFocus(id: FocusId, opts?: WaypointOpts): PathWaypoint {
  return { id, ...waypointExtras(opts) };
}

/**
 * flyPath — fly a smooth spline through `waypoints` over `opts.over` total
 * seconds. The default pacing comes from `pathDefaults`: `align`
 * (`DEFAULT_ALIGN_SEC`) turns the camera into the path as it launches, and
 * `rampSec` (`DEFAULT_RAMP_SEC`) gives a trapezoidal speed envelope — short
 * accel, long constant-speed cruise, short decel — so a flythrough feels right
 * with no per-clip tuning. The named `opts.ease` is the OPT-OUT: it shapes the
 * envelope only when `rampSec` is 0, otherwise the trapezoid wins.
 *
 * Unlike chained `seq([moveTarget, …])` tweens (which corner at each point),
 * the path is C1-smooth. It owns all four camera channels for its window, so
 * don't also drive them with `set` / `dollyTo` / `moveTarget` in the same window.
 */
export function flyPath(
  waypoints: PathWaypoint[],
  opts: {
    over: number;
    ease?: Ease;
    align?: number;
    rampSec?: number;
    linger?: number;
    spline?: SplineConfig;
    passBy?: PassByConfig;
  },
): Effect & { kind: 'flyPath' } {
  return {
    kind: 'flyPath',
    waypoints,
    over: opts.over,
    ease: opts.ease ?? 'inOut',
    align: opts.align ?? DEFAULT_ALIGN_SEC,
    rampSec: opts.rampSec ?? DEFAULT_RAMP_SEC,
    linger: opts.linger ?? DEFAULT_LINGER,
    // No spline authored → the tuned cinematographic default (causal Hermite
    // with the turn-delay / look-ahead from pathDefaults).
    spline: opts.spline ?? DEFAULT_SPLINE_CONFIG,
    // Absent = fly through centres (right for a group cloud); a galaxy flythrough
    // opts in. No default stamped, so groups stay through-centre.
    ...(opts.passBy !== undefined ? { passBy: opts.passBy } : {}),
  };
}
