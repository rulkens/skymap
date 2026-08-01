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
 * Additionally, constructors encode the defaults — `ease: 'easeInOutCubic'` and
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
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import type { Effect } from '../../../@types/animation/Effect';
import type { Channel } from '../../../@types/animation/Channel';
import type { Ease } from '../../../@types/animation/Ease';
import type { Space } from '../../../@types/animation/Space';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { VisibilityLayerArg } from '../../../@types/animation/VisibilityLayerArg';
import type { ScopedVisibilityArg } from '../../../@types/animation/ScopedVisibilityArg';
import { expandVisibilityLayers } from '../../../utils/animation/expandVisibilityLayers';
import { splitVisibilityArgs } from '../../../utils/animation/splitVisibilityArgs';
import type { SettingsAction } from '../../../@types/animation/SettingsAction';
import type { PathWaypoint } from '../../../@types/animation/PathWaypoint';
import type { SplineConfig } from '../../../@types/animation/SplineConfig';
import type { PassByConfig } from '../../../@types/animation/PassByConfig';
import { CHANNEL_SPACE } from './channelSpace';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_RAMP_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_SPLINE_CONFIG,
  DEFAULT_PASS_BY_CONFIG,
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
 * `ease` defaults to `'easeInOutCubic'` (the natural choice for A→B camera moves).
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
    ease: opts.ease ?? 'easeInOutCubic',
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
    ease: ease ?? 'easeInOutCubic',
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
  return { kind: 'moveTargetId', id, over, ease: ease ?? 'easeInOutCubic' };
}

/**
 * dollyToId — zoom the camera to the framing distance of the structure or
 * galaxy identified by `id`, over `over` seconds.
 *
 * The UNRESOLVED form of `dollyTo`: `resolveClipFoci` rewrites it to a concrete
 * `dollyTo(mpc, over, ease)` before `compileClip` runs. Authors use this when
 * the target distance is not known statically but must be derived from the
 * catalog at play time via a durable `FocusId`.
 *
 * `opts.scale` multiplies the resolved framing distance — the knob for "land
 * tighter (or looser) than the standard framing". Because it scales the
 * DERIVED distance rather than replacing it, the shot stays proportional if
 * the framing math or the subject's catalogued size ever changes; an absolute
 * override is what the concrete `dollyTo(mpc, ...)` is for. Options are named
 * (not positional) per the dwellDrift lesson — a bare number after the ease
 * slot is unreadable at the call site.
 */
export function dollyToId(
  id: FocusId,
  over: number,
  opts?: { ease?: Ease; scale?: number },
): FocusBoundEffect & { kind: 'dollyToId' } {
  return {
    kind: 'dollyToId',
    id,
    over,
    ease: opts?.ease ?? 'easeInOutCubic',
    ...(opts?.scale !== undefined ? { scale: opts.scale } : {}),
  };
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
    ease: opts.ease ?? 'easeInOutCubic',
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
    ease: opts.ease ?? 'easeInOutCubic',
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
    ease: opts.ease ?? 'easeInOutCubic',
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
 *
 * `layers` accepts three vocabularies in one list: atomic keys, authoring
 * aggregates (`'labels'` → every label layer), and `'family:scope'`
 * scoped entries (`'survey:milliquas'`, `'structureRing:group'`,
 * `'label:milkyWay'`) that address ONE item where the bare key would fan over
 * all. `splitVisibilityArgs` resolves the mix at construction: aggregates
 * flatten to atomic keys, scoped entries move to the effect's `scoped` field.
 * Scoped fades ride the reactive settings→fade bridge, so `over` applies to
 * the atomic layers only.
 */
export function show(
  layers: (VisibilityLayerArg | ScopedVisibilityArg)[],
  over?: number,
): SceneEffect & { kind: 'show' } {
  const split = splitVisibilityArgs(layers);
  return {
    kind: 'show',
    layers: split.layers,
    ...(split.scoped.length > 0 ? { scoped: split.scoped } : {}),
    ...(over !== undefined ? { over } : {}),
  };
}

/**
 * hide — set visibility INTENT for `layers` to hidden, fading out over `over`
 * seconds (`undefined` → default fade duration; `0` → instant). Accepts
 * aggregates (`'labels'`) and scoped entries (`'survey:milliquas'`) — see `show`.
 */
export function hide(
  layers: (VisibilityLayerArg | ScopedVisibilityArg)[],
  over?: number,
): SceneEffect & { kind: 'hide' } {
  const split = splitVisibilityArgs(layers);
  return {
    kind: 'hide',
    layers: split.layers,
    ...(split.scoped.length > 0 ? { scoped: split.scoped } : {}),
    ...(over !== undefined ? { over } : {}),
  };
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
  layers: VisibilityLayerArg[],
  to: number,
  over: number,
): SceneEffect & { kind: 'fade' } {
  return { kind: 'fade', layers: expandVisibilityLayers(layers), to, over };
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
 * frameTo — reorient the camera's "up" pole to `frame` over `opts.over` seconds.
 *
 * A cue-style effect (like `scene` / `focus`): it fires at its beat and awaits
 * ZERO duration. At fire time `applySceneEffect` dispatches `setOrientation` +
 * `startFrameTween`, seeding the roll from the LIVE basis `B(t)` — the same two
 * writes (and the same live-basis capture) the interactive
 * `watchOrientationChangeSaga` performs. A beat that should dwell through the
 * reorientation sequences a `wait(opts.over)` after it; the cue itself adds no
 * awaited time. `ease` defaults to `'easeInOutCubic'`, the natural S-curve for an A→B roll.
 */
export function frameTo(
  frame: OrientationFrameId,
  opts: { over: number; ease?: Ease },
): SceneEffect & { kind: 'frameTo' } {
  return { kind: 'frameTo', frame, over: opts.over, ease: opts.ease ?? 'easeInOutCubic' };
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

/**
 * focusOnId — focus the id AND fly the camera to its framing: the clip-land
 * equivalent of `requestFocus`. In interactive-land a focus change plants a
 * runtime camera tween; inside a clip that path is fenced off (the clip is the
 * only camera writer, and its duration must be static), so the fused verb has
 * to be authored as explicit, timed writers. This composite is that authoring:
 * the `focus` cue fires first so the selection/isolation dim rides along
 * during the approach, then target + distance glide concurrently over `over`.
 *
 * Plain `focus(id)` remains the camera-free half — use it when the clip's own
 * choreography (a flyPath, a spin) already owns the camera.
 */
export function focusOnId(id: FocusId, over: number, ease: Ease = 'easeInOutCubic'): Effect {
  return seq([focus(id), all([moveTargetId(id, over, ease), dollyToId(id, over, { ease })])]);
}

/**
 * lookAtId — swing the view so the subject identified by `id` drifts to centre
 * frame, WITHOUT flying to it. The "turn your head before you walk" verb.
 *
 * The orbit camera always faces its target, so it cannot literally rotate in
 * place — "looking at" something else means orbiting the eye around the
 * CURRENT target until the subject lines up centre-frame beyond it.
 * `resolveClipFoci` computes that bearing (`orbitAnglesLookingAlong` of the
 * subject's direction from the live orbit target) and rewrites this arm to an
 * `aimAt` — concurrent yaw/pitch tweens. Target and distance are untouched.
 *
 * The bearing is measured from the orbit target AT RESOLVE TIME (clip start),
 * so `lookAtId` is only correct as an opening move — anything that moves the
 * target before it fires (a `moveTarget`, a `flyPath`) invalidates the
 * precomputed angles. Establish the shot first, then fly (`focusOnId`).
 *
 * At the exact bearing the orbit target sits dead on the line to the subject —
 * the two stack on the boresight. Compose a concurrent `strafeId` into the
 * same `all` to break the stack: the strafe writes `target` while this writes
 * yaw/pitch, so the single-writer rule holds.
 */
export function lookAtId(
  id: FocusId,
  over: number,
  ease?: Ease,
): FocusBoundEffect & { kind: 'lookAtId' } {
  return { kind: 'lookAtId', id, over, ease: ease ?? 'easeInOutCubic' };
}

/**
 * aimAlong — swing the view to face a FIXED WORLD-space direction, resolved
 * through whichever orientation frame is live at clip start
 * (`orbitAnglesLookingAlong`, same mechanism `lookAtId` uses).
 *
 * Unlike `lookAtId`, the bearing is NOT measured from the live orbit
 * target — there is no subject to look up, so `forward` alone determines the
 * aim. That makes it the right primitive for a pose that must be
 * reproducible regardless of where the camera happened to be before the clip
 * started (a cold-open snap, or a return-to-opening-framing beat): `lookAtId`
 * would silently depend on that unknown prior pose, `aimAlong` does not.
 *
 * `over: 0` is a legal snap, same as `aimAt`.
 */
export function aimAlong(forward: Vec3, over: number, ease?: Ease): Effect & { kind: 'aimAlong' } {
  return { kind: 'aimAlong', forward, over, ease: ease ?? 'easeInOutCubic' };
}

/**
 * strafeId — slide the camera rig sideways relative to the bearing toward the
 * subject identified by `id`, WITHOUT turning. The lateral tracking move.
 *
 * In the orbit model the eye is derived from the target, so a lateral eye
 * move IS a target move: `resolveClipFoci` rewrites this arm to a concrete
 * `moveTarget` — the live orbit target displaced along the bearing's
 * horizontal right axis (`normalize(forward × worldUp)`). Because it writes
 * the `target` channel and `lookAtId` writes yaw/pitch, the two compose in
 * one `all` — aim and sidestep concurrently.
 *
 * `byDeg` is ANGULAR, so it reads the same at every scale: the displacement
 * is `tan(byDeg) × live camera distance`, which slides whatever sat at the
 * old target ~`byDeg` degrees across the frame. Positive strafes the rig
 * RIGHT (the old anchor drifts screen-left); negative strafes left. A distant
 * subject barely moves (parallax shrinks with depth), so `all([lookAtId,
 * strafeId])` reads as "aim at the subject with the old anchor pushed aside".
 *
 * Same resolve-time caveat as `lookAtId`: the axis and displacement are baked
 * from the live pose at clip start — an opening move, not a mid-clip one.
 */
export function strafeId(
  id: FocusId,
  byDeg: number,
  over: number,
  ease?: Ease,
): FocusBoundEffect & { kind: 'strafeId' } {
  return { kind: 'strafeId', id, byDeg, over, ease: ease ?? 'easeInOutCubic' };
}

/**
 * spinToId — orbit the yaw channel until it faces the structure or galaxy
 * identified by `id`, touching only yaw (pitch/target/distance untouched).
 *
 * The bearing-aware counterpart to a raw `spin('yaw', { by, ... })`: instead
 * of an author-supplied radian delta pinned to one orientation frame,
 * `resolveClipFoci` derives `by` from the LIVE yaw to the subject's world
 * sightline at resolve time, through whichever frame basis is steady at that
 * clip boundary. The same authored effect therefore lands on the same
 * subject regardless of which frame is active — a bearing is a sightline,
 * not a frame-local number.
 *
 * `opts.turns` (default 0) adds extra full revolutions on top of the
 * shortest-arc delta: negative takes the long way round, the idiom
 * `approachM31.ts`'s `NET_YAW_RAD` established with a literal `- Math.PI * 2`.
 */
export function spinToId(
  id: FocusId,
  opts: { over: number; turns?: number; ease?: Ease },
): FocusBoundEffect & { kind: 'spinToId' } {
  return {
    kind: 'spinToId',
    id,
    over: opts.over,
    ease: opts.ease ?? 'easeInOutCubic',
    ...(opts.turns !== undefined ? { turns: opts.turns } : {}),
  };
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
    lingerSec?: number;
    spline?: SplineConfig;
    passBy?: PassByConfig;
  },
): Effect & { kind: 'flyPath' } {
  return {
    kind: 'flyPath',
    waypoints,
    over: opts.over,
    ease: opts.ease ?? 'easeInOutCubic',
    align: opts.align ?? DEFAULT_ALIGN_SEC,
    rampSec: opts.rampSec ?? DEFAULT_RAMP_SEC,
    linger: opts.linger ?? DEFAULT_LINGER,
    lingerSec: opts.lingerSec ?? DEFAULT_LINGER_SEC,
    // No spline authored → the tuned cinematographic default (causal Hermite
    // with the turn-delay / look-ahead from pathDefaults).
    spline: opts.spline ?? DEFAULT_SPLINE_CONFIG,
    // No passBy authored → the tuned default (swoop 4 radii off the bend). Safe
    // to stamp on every flyPath: only galaxy waypoints (non-zero radius) are
    // displaced; structures resolve to radius 0 and fly through-centre.
    passBy: opts.passBy ?? DEFAULT_PASS_BY_CONFIG,
  };
}
