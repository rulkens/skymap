/**
 * shouldKeepTicking — the render-on-demand keep-alive: true while any motion
 * or async work is self-sustaining, false when a channel wake is enough. A
 * pure function of `(state, s, nowMs, anim)`: `anim` is the in-frame votes
 * the planners already computed, passed in rather than read off state so
 * nothing wakes the loop on its own behalf. Deliberately blind to what is
 * pickable — coupling hover-pick to liveness froze the flow field whenever
 * the cursor stopped. LIVE sim time is absent on purpose: it advances
 * imperceptibly per frame, so runFrame arms a coarse idle tick for it instead.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import { selectCameraActive } from '../../../state/camera/selectors';
import { selectIsManualPlaying } from '../../../state/time/selectors';
import { isEngineReady } from './engineReady';
import { slotReady } from '../../loading/slotReady';
import { FOCUS_TWEEN_MS } from '../camera/focusTweenDuration';

/**
 * Time-based ease with no camera-slice flag behind it: without this term the
 * loop sleeps mid-ease and wakes to a snapped zoom. False at saturation —
 * steady follow of a moving body is NOT a wake term (the pin re-centres on wake).
 */
function followApproachEaseActive(state: EngineState, nowMs: number): boolean {
  if (state.cameraRuntime.prevActiveId.current !== 'followBody') return false;
  const start = state.cameraRuntime.epochs.follow.startMs;
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
