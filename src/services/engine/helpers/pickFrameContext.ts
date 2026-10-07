/**
 * pickFrameContext — the pick camera as a value, so a pick can run between
 * frames. Returns `null` until the engine has bootstrapped; safe to call
 * speculatively — `deriveFrameContext` advances no clock and no fade
 * controller, and the focus is read back, not produced.
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
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';

export function pickFrameContext(state: EngineState, canvas: HTMLCanvasElement): FrameView | null {
  // A dome frame has no single cursor ray to pick against (five faces, no
  // canvas-space main view) — the rig's own `pickable` flag is the one gate.
  if (!VIEW_RIGS[state.viewRig].pickable) return null;
  const nowMs = performance.now();
  // One read of the committed orientation for this call — `poseBasis` and the
  // at-rest `upBasis` are the SAME frame, unlike `runFrame`'s live mid-slerp one.
  const poseBasis = ORIENTATION_FRAMES[state.settings.orientation];
  const { input, cam } = frameContextInputOf(state, {
    worldPose: liveWorldPose(state),
    nowMs,
    // Pick mask, not draw mask: pickability follows intent, not the fade-out
    // tail. `enabled` alone drives the pick bit, so the nowMs sample only
    // matters for `.draw` — passed anyway so this call site never relies on
    // the registry's stale last-ticked clock.
    visibleSourceMask: deriveSourceMasks(state, nowMs).pick,
    poseBasis,
    upBasis: poseBasis,
    // The instant the last frame derived its bodies at, so pickable body sprites
    // are re-derived exactly where they were drawn.
    simDays: state.cameraRuntime.outputs.simDays,
  });
  // Pick never runs a view through `executeFrame` (see `pickProgram.ts`'s
  // header), so the default `renderedTargets` is fine here.
  const snapshot = deriveFrameContext(state, input);
  if (!snapshot.isReady) return null;
  // The drawn frame's focus, not a fresh one: a pick must exclude exactly what
  // that frame dimmed, and producing a new value would tick the focus fade.
  snapshot.focus = state.subsystems.structureFocus.lastFocusUniforms();
  snapshot.focusBlend = snapshot.focus.blend;
  return deriveView(
    snapshot,
    cam,
    mainViewSpec(cam, { width: canvas.width, height: canvas.height }),
  );
}
