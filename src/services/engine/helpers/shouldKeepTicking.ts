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
 * Predicate breakdown:
 *   - camera drivers active: any camera mover (an in-flight tween, or idle
 *     auto-rotate) declares itself active this frame, via the same driver
 *     registry the per-frame camera write resolves through. `.some(isActive)`
 *     IS the boolean OR of those movers, so it tracks the resolver exactly —
 *     one place decides 'is the camera moving' for both the write and this gate.
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
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import { isEngineReady } from './engineReady';
import { slotReady } from '../../loading/slotReady';

export function shouldKeepTicking(
  state: EngineState,
  drivers: readonly CameraDriver[],
  nowMs: number,
): boolean {
  return (
    drivers.some((d) => d.isActive(nowMs)) ||
    (isEngineReady(state) && state.subsystems.texturedDisks.hasInFlightWork()) ||
    state.subsystems.fades.isAnyAnimating(nowMs) ||
    state.subsystems.structureFocus.isAwake(nowMs) ||
    (state.settings.flow.enabled && slotReady(state.assetSlots.flow))
  );
}
