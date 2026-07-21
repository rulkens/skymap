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
 * an explicit bag of IN-FRAME animation votes derived by planners that runFrame
 * has already run this frame (today: the star LOD-fade `anyNodeFading`, computed
 * by `prepareStarCut`). It is threaded as a PARAMETER rather than read off
 * EngineState precisely because it is a per-frame derivation, not stored state:
 * passing it in keeps the predicate a pure function of its inputs, and keeps the
 * one wake authority here — the star pass computes the vote, this predicate
 * decides. New in-frame animators extend the bag, never a hidden state read.
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

export function shouldKeepTicking(
  state: EngineState,
  s: RootState,
  nowMs: number,
  anim: { starFadeAnimating: boolean },
): boolean {
  return (
    selectCameraActive(s) ||
    (isEngineReady(state) && state.subsystems.texturedDisks.hasInFlightWork()) ||
    state.subsystems.fades.isAnyAnimating(nowMs) ||
    state.subsystems.structureFocus.isAwake(nowMs) ||
    (state.settings.flow.enabled && slotReady(state.assetSlots.flow)) ||
    selectIsManualPlaying(s) ||
    anim.starFadeAnimating
  );
}
