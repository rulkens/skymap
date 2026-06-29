/**
 * encodeForegroundOver — tone-map + OVER-composite the foreground offscreen
 * onto the swap chain, then draw the foreground body captions, in one pass.
 *
 * ### Why here, after the UI overlay
 *
 * `encodeForegroundPass` fills the foreground offscreen (opaque Sun/Earth
 * with depth) during the HDR phase, but does NOT composite it. The composite
 * is deferred to here — AFTER `postProcess` tone-map AND after
 * `encodeUiOverlay` — so the opaque foreground bodies paint over (and thus
 * occlude) the galaxy-level labels, marker-lines, and selection rings that
 * the UI overlay just drew. A label whose anchor sits behind the Sun is
 * covered by the Sun disc; a label beside it survives. A future translucent
 * atmosphere tints those labels instead of hard-masking them, because the
 * composite is a real OVER blend (not a stencil cut).
 *
 * The foreground is tone-mapped here with the same curve the scene used (the
 * swap chain is already LDR), so the Sun shares the background's response.
 *
 * ### Why captions ride in the same pass
 *
 * The Sun/Earth captions must land ON TOP of the Sun disc — so they draw
 * AFTER the composite. Keeping both in one `beginRenderPass` (rather than two)
 * keeps the OVER blends reading fully-coherent `dst.color`, avoiding the
 * tile-based-GPU coherency hazard documented in `encodeUiOverlay`.
 *
 * Self-gated: if the foreground handles are null (bootstrap / unsupported)
 * the function returns without opening a pass.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { foregroundLabelsPass } from './passes/foregroundLabelsPass';

export function encodeForegroundOver(
  encoder: GPUCommandEncoder,
  swapView: GPUTextureView,
  ctx: ReadyFrameContext,
  state: EngineState,
  deps: PassDeps,
  exposure: number,
  curve: number,
): void {
  const { foregroundOffscreen, foregroundComposite } = state.gpu;
  if (!foregroundOffscreen || !foregroundComposite) return;

  // Captions respect their own gate plus the DebugPanel renderer-toggle
  // override — same one-way semantics as `encodeUiOverlay`.
  const captionsOn =
    foregroundLabelsPass.enabled(state, ctx) &&
    state.settings.debug.disabledPasses[foregroundLabelsPass.name] !== true;

  const pass = encoder.beginRenderPass({
    label: 'foreground-over',
    colorAttachments: [
      {
        // `loadOp: 'load'` composites onto the tone-mapped scene + UI overlay
        // already in the swap chain; clearing would wipe the whole frame.
        view: swapView,
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });

  // The composite is a fullscreen blit; where the foreground offscreen is
  // transparent (alpha 0) the OVER blend is a no-op, so this is cheap when no
  // body is on screen.
  foregroundComposite.draw(pass, foregroundOffscreen.colorView, exposure, curve);

  if (captionsOn) foregroundLabelsPass.draw(pass, ctx, state, deps);

  pass.end();
}
