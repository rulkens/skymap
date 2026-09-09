/**
 * pickFrameContext — the pick camera as a plain derivation of engine state, so a
 * pick can run between frames. Returns `null` until the engine has bootstrapped
 * (`FrameContext.isReady`); safe to call speculatively — `deriveFrameContext`
 * advances no clock and no fade controller.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { deriveFrameContext } from '../frame/frameContext';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import { liveWorldPose } from './liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function pickFrameContext(
  state: EngineState,
  canvas: HTMLCanvasElement,
): ReadyFrameContext | null {
  const ctx = deriveFrameContext(
    state,
    canvas,
    liveWorldPose(state),
    // The DISPLAYED box, not the authored `lastPose`: the authored register is
    // untilted in-window and a pick against it misses (round-12c two-box contract).
    state.cameraRuntime.displayedPose.current,
    state.cameraRuntime.projection,
    // A demand read at rest, where the live `upBasis` equals the steady frame.
    ORIENTATION_FRAMES[state.settings.orientation],
    ORIENTATION_FRAMES[state.settings.orientation],
    // Pick mask, not draw mask: pickability follows intent, not the fade-out tail.
    deriveSourceMasks(state).pick,
    performance.now(),
    // The instant the last frame derived its bodies at, so pickable body sprites
    // are re-derived exactly where they were drawn.
    state.cameraRuntime.lastRenderedSimDays.current,
  );
  return ctx.isReady ? ctx : null;
}
