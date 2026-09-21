/**
 * pickFrameContext — the pick camera as a value, so a pick can run between
 * frames. Returns `null` until the engine has bootstrapped; safe to call
 * speculatively — `deriveFrameContext` advances no clock and no fade
 * controller.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { deriveFrameContext } from '../frame/frameContext';
import { deriveView } from '../frame/deriveView';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import { frameContextInputOf } from '../frame/frameContextInputOf';
import { mainViewSpec } from '../../../utils/camera/mainViewSpec';
import { liveWorldPose } from './liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function pickFrameContext(state: EngineState, canvas: HTMLCanvasElement): FrameView | null {
  const nowMs = performance.now();
  const { input, cam } = frameContextInputOf(state, {
    worldPose: liveWorldPose(state),
    nowMs,
    // Pick mask, not draw mask: pickability follows intent, not the fade-out
    // tail. `enabled` alone drives the pick bit, so the nowMs sample only
    // matters for `.draw` — passed anyway so this call site never relies on
    // the registry's stale last-ticked clock.
    visibleSourceMask: deriveSourceMasks(state, nowMs).pick,
    // A demand read at rest, where the live upBasis equals the steady frame.
    upBasis: ORIENTATION_FRAMES[state.settings.orientation],
    // The instant the last frame derived its bodies at, so pickable body sprites
    // are re-derived exactly where they were drawn.
    simDays: state.cameraRuntime.outputs.simDays,
  });
  const snapshot = deriveFrameContext(state, input);
  if (!snapshot.isReady) return null;
  return deriveView(
    snapshot,
    cam,
    mainViewSpec(cam, { width: canvas.width, height: canvas.height }),
  );
}
