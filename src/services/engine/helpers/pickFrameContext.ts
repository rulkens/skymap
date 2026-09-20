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
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { pivotSurfaceRangeMpc } from '../camera/pivotSurfaceRangeMpc';
import { mainViewSpec } from '../../../utils/camera/mainViewSpec';
import { liveWorldPose } from './liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function pickFrameContext(state: EngineState, canvas: HTMLCanvasElement): FrameView | null {
  const nowMs = performance.now();
  const worldPose = liveWorldPose(state);
  // A demand read at rest, where the live `upBasis` equals the steady frame.
  const basis = ORIENTATION_FRAMES[state.settings.orientation];
  const cam = assembleOrbitCamera(worldPose, state.cameraRuntime.outputs.projection, basis, basis);
  // The DISPLAYED pose, not the authored register: the authored register is
  // untilted in-window and a pick against it misses (round-12c two-box contract).
  const arm = state.cameraRuntime.outputs.displayed;
  const snapshot = deriveFrameContext(state, {
    cam,
    arm,
    altitudeMpc: pivotSurfaceRangeMpc(arm, worldPose.distance, state.selectionRows.focus),
    nowMs,
    // The instant the last frame derived its bodies at, so pickable body sprites
    // are re-derived exactly where they were drawn.
    simDays: state.cameraRuntime.outputs.simDays,
    // Pick mask, not draw mask: pickability follows intent, not the fade-out
    // tail. `enabled` alone drives the pick bit, so the nowMs sample only
    // matters for `.draw` — passed anyway so this call site never relies on
    // the registry's stale last-ticked clock.
    visibleSourceMask: deriveSourceMasks(state, nowMs).pick,
  });
  if (!snapshot.isReady) return null;
  return deriveView(
    snapshot,
    mainViewSpec(snapshot.cam, { width: canvas.width, height: canvas.height }),
  );
}
