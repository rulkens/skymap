/**
 * captionComposeContextOf — one frame's `CaptionComposeContext`, the shared
 * half every NEAR0 caption producer hands `composeForegroundCaption`.
 */

import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { CaptionComposeContext } from '../../@types/rendering/CaptionComposeContext';
import { sceneOccluderBodies } from '../../services/engine/frame/sceneOccluderBodies';

export function captionComposeContextOf(state: EngineState, ctx: FrameView): CaptionComposeContext {
  return {
    camPos: ctx.drawCamPos,
    // Orbit distance, NOT `|camPos|`: the bound the solar-system-reach kinds
    // ride, which diverges from origin distance once focus leaves the origin.
    camOrbitDistanceMpc: ctx.cam.distance,
    viewportShortSidePx: Math.min(ctx.canvasSize.width, ctx.canvasSize.height),
    drawPxPerRad: ctx.drawPxPerRad,
    focus: ctx.snapshot.focus,
    // The overlay shaders attenuate per PIXEL, which cannot tell a subject in
    // FRONT of a body from one behind it — deciding that per caption is what
    // keeps the whale's name legible over Earth's disc while the Moon's still
    // sinks behind the limb.
    occluders: sceneOccluderBodies(state, ctx),
  };
}
