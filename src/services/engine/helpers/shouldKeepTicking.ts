/**
 * shouldKeepTicking — the render-on-demand keep-alive predicate.
 *
 * Render-on-demand sleeps the loop when nothing is changing, and wakes it from
 * a channel mouth (input, a fade or tween start, a slot reaching ready, a
 * selection/focus change, a settings write). But some work is self-sustaining:
 * an in-flight tween, a thumbnail fade, an animated overlay. This predicate is
 * the single authority on "must the loop schedule another frame on its own?" —
 * true while any motion or async work is in flight, false when the scene is at
 * rest and the loop may sleep until a channel wakes it.
 *
 * It deliberately takes NO information about what is pickable on screen. Frame
 * liveness and hover-pickability are independent concerns: an animated overlay
 * (the flow field) must keep the loop ticking even when every galaxy catalog is
 * hidden and nothing is pickable. Entangling the two — letting the hover-pick
 * path decide whether to keep ticking — is what froze the flow field whenever
 * the cursor stopped moving or left the canvas. The signature keeps them apart.
 *
 * Every term except the last is read off `(state, s, nowMs)` — the signature is
 * the proof the predicate depends on nothing else. The one exception is `anim`,
 * an explicit bag of IN-FRAME animation votes collected by the planners runFrame
 * has already run this frame: the star LOD-fade `anyNodeFading` from
 * `prepareStarCut`, the Earth tile subsystem's `isAnimating()`, and the two
 * label directors' runFrame votes, folded together before the call. It is
 * threaded as a PARAMETER rather than read off EngineState precisely because it
 * is gathered per frame at the drive sites: passing it in keeps the predicate a
 * pure function of its inputs, and keeps the one wake authority here — a planner
 * or subsystem computes the vote, this predicate decides, and nothing wakes the
 * loop on its own behalf. New in-frame animators extend the bag, never a hidden
 * state read.
 *
 * Predicate breakdown:
 *   - camera active: `selectCameraActive(s)` — the continuation predicate
 *     (design §4), true while a drag is held, a focus tween is in flight, or
 *     auto-rotate is spinning. It reads the camera-slice flags straight off the
 *     store `RootState`, so the keep-tick gate and the React play/pause
 *     affordance share one definition of 'the camera is moving'.
 *   - texturedDisks.hasInFlightWork(): a thumbnail fetch is racing the network
 *     OR a landed bitmap is in its 400 ms load-fade window. Guarded by
 *     isEngineReady so the subsystem is non-null before the deref.
 *   - fades.isAnyAnimating(): a galaxy-catalog / filament layer is ramping its
 *     opacity (the FadeRegistry owns every clock, filaments included). The
 *     caller must tick() the registry before calling this, so isAnyAnimating
 *     reads post-tick state.
 *   - structureFocus.isAwake(): the member-isolation fade (its own controller,
 *     not in the registry) across its 400 ms ramp.
 *   - flow enabled + loaded: the flow layer keeps animating while on (advect
 *     drifts, streamline pulses), so the loop must keep ticking. Read straight
 *     off its two authoritative sources — settings.flow.enabled and
 *     slotReady(assetSlots.flow) — rather than round-tripping through the
 *     renderer; slotReady IS the 'field loaded' truth (the slot dispatches
 *     'ready' only after upload commits), selecting exactly the animating set
 *     with no renderer mirror.
 *   - follow approach ease: `followApproachEaseActive` — the followBody driver's
 *     time-based approach ease (it replaced the body-focus tween, which used to
 *     contribute a wake term; the ease had none). True only while followBody is
 *     the winner and the ease is unsaturated; goes false at saturation so steady
 *     follow does not pin the loop. See the helper for why steady-follow-under-
 *     motion is deliberately excluded.
 *   - `anim.earthTilesAnimating`: Earth's surface virtual texture has its
 *     manifest or a tile in flight, or a landed tile still ramping through its
 *     load fade. The manifest leg is the one that matters: it is in flight
 *     BEFORE the feature can engage, so runFrame reads this vote outside its
 *     engage gate — otherwise a camera that stops moving mid-fetch sleeps the
 *     loop and the tiles never appear.
 *   - `anim.labelsAnimating`: EITHER label director's own producers or its
 *     appear/disappear envelope are mid-ramp — `labelDirector.runFrame` OR
 *     `foregroundLabelDirector.runFrame`'s vote, folded with plain `||` at
 *     the call site in `runFrame.ts` (see its comment for why the two calls
 *     stay separate statements), rather than either director calling
 *     `requestRender` itself.
 *   - manual clock playing: `selectIsManualPlaying(s)` — a manual sim clock that
 *     is advancing (not paused) moves every body every frame, so playback must
 *     be continuous. LIVE mode is deliberately absent: it advances at real-time
 *     rate, so nothing perceptible changes frame-to-frame and pinning the loop
 *     at 60 fps would be waste — runFrame arms a coarse idle tick for the live
 *     terminator instead (see its wake tail), keeping that path OUT of this
 *     predicate.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import { selectCameraActive } from '../../../state/camera/selectors';
import { selectIsManualPlaying } from '../../../state/time/selectors';
import { isEngineReady } from './engineReady';
import { slotReady } from '../../loading/slotReady';
import { FOCUS_TWEEN_MS } from '../camera/focusTweenDuration';

/**
 * The `followBody` driver's approach ease is a TIME-based animation (easeOutCubic
 * over FOCUS_TWEEN_MS since `clock.followStartMs`) with NO camera-slice flag
 * behind it — unlike a tween, which `selectCameraActive` already covers. It
 * replaced the old body-focus tween, but the tween contributed a `currentTween`
 * wake term and the ease contributed none. Without a wake term the loop renders
 * the focus frame, sleeps, the ease saturates WHILE ASLEEP, and the next
 * interaction reveals a finished (snapped) zoom. This term keeps the loop ticking
 * while followBody is the winner AND the ease is still running; it goes FALSE at
 * saturation so a steady follow does not pin 60 fps.
 *
 * `prevActiveId.current` holds THIS frame's winner (runFrame writes it before the
 * keep-tick check), and `followStartMs` is maintained by `followElapsed` on every
 * frame followBody wins — so both are current here.
 *
 * DELIBERATELY NOT a wake term: STEADY follow of a MOVING body after saturation.
 * The pivot-pin only affects a RENDERED frame, so a slept steady-follow re-centres
 * on the next wake. Manual playback already ticks (`selectIsManualPlaying`), and
 * live-1x advances sub-perceptibly (the same coarse-idle-tick regime the
 * terminator uses via runFrame's wake tail). Pinning 60 fps whenever any body is
 * focused would defeat that power-saving for a drift that is imperceptible at the
 * live rate — so steady follow stays out of this predicate, exactly as live time
 * itself does.
 */
function followApproachEaseActive(state: EngineState, nowMs: number): boolean {
  if (state.cameraRuntime.prevActiveId.current !== 'followBody') return false;
  const start = state.cameraRuntime.clock.followStartMs;
  return start !== null && nowMs - start < FOCUS_TWEEN_MS;
}

export function shouldKeepTicking(
  state: EngineState,
  s: RootState,
  nowMs: number,
  anim: { starFadeAnimating: boolean; earthTilesAnimating: boolean; labelsAnimating: boolean },
): boolean {
  return (
    selectCameraActive(s) ||
    (isEngineReady(state) && state.subsystems.texturedDisks.hasInFlightWork()) ||
    state.subsystems.fades.isAnyAnimating(nowMs) ||
    state.subsystems.structureFocus.isAwake(nowMs) ||
    (state.settings.flow.enabled && slotReady(state.assetSlots.flow)) ||
    selectIsManualPlaying(s) ||
    followApproachEaseActive(state, nowMs) ||
    anim.starFadeAnimating ||
    anim.earthTilesAnimating ||
    anim.labelsAnimating
  );
}
