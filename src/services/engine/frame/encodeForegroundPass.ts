/**
 * encodeForegroundPass — two-step offscreen → OVER-composite for foreground
 * geometry (Earth, Moon, Sun) into the HDR pipeline.
 *
 * ### Why two steps, not direct-to-HDR
 *
 * The HDR target (PostProcess.view) has no depth attachment — every existing
 * galaxy/disk/volume renderer uses additive blending with depthWriteEnabled:
 * false (see postProcess.ts:48-62 for the history of why depth was removed).
 * Foreground geometry is OPAQUE and must depth-test against itself:
 * Earth occludes its far hemisphere, a Moon in front of Earth must win the
 * depth test, and so on. Adding a depth attachment to the HDR target would
 * require re-declaring depthStencil state in every additive pipeline — a
 * cross-cutting change that previously caused regressions.
 *
 * The two-step solution: render opaque geometry into a dedicated
 * 'rgba16float + depth32float' offscreen (ForegroundOffscreen), then
 * OVER-composite the colour result onto the HDR target in a second pass.
 * The OVER composite uses 'loadOp: load' so existing HDR content (the galaxy
 * backdrop) is preserved and only covered where the foreground has non-zero
 * alpha.
 *
 * ### Why between HDR and tone-map
 *
 * Earth must participate in the same tone-map curve as the galaxy backdrop —
 * its surface brightness can exceed 1.0 in 'rgba16float' (e.g. sunlit limb
 * vs deep-space black). Compositing after postProcess.draw would apply the
 * OVER blend in [0,1] LDR space, compressing Earth's brightness range
 * incorrectly. By landing the composite in the HDR target before tone-map,
 * Earth and the background share the same tonemapping pass and the brightness
 * transition across the limb is physically coherent.
 *
 * ### Template
 *
 * The volume-offscreen → volume-upsample pattern in encodeVolumePrepass /
 * volumeUpsamplePass is the structural template: pre-pass writes to an
 * offscreen target, HDR pass samples it back in. This foreground variant
 * differs in blend mode (OVER vs additive) and target (full-res vs
 * quarter-res), but the two-encoder-pass shape is the same.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { composeBodyMvp } from '../../../utils/camera/composeBodyMvp';
import { DEBUG_SPHERE_BODIES } from '../../../data/bodies/debugSphereBody';

/**
 * Encode the foreground depth pass + OVER-composite into the HDR target.
 *
 * Step 1: render opaque foreground geometry into ForegroundOffscreen
 * (full-res 'rgba16float' + 'depth32float').  Cleared to transparent black
 * each frame so the OVER composite only covers pixels the foreground drew.
 *
 * Step 2: OVER-composite the foreground colour texture onto the HDR target
 * (ctx.postProcess.view) with 'loadOp: load' to preserve the galaxy backdrop.
 *
 * Self-gated: if any required handle is null the function returns without
 * opening any render pass, mirroring how other passes null-check their
 * optional handles (e.g. volumeUpsamplePass, flowFieldPass).
 */
export function encodeForegroundPass(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  _deps: PassDeps,
): void {
  const { foregroundOffscreen, foregroundComposite, debugSphereRenderer } = state.gpu;

  // Self-gate: all three handles must be constructed before this pass can run.
  // During early bootstrap or on platforms where initGpu is in flight these
  // will be null — a silent no-op keeps the frame loop correct.
  if (!foregroundOffscreen || !foregroundComposite || !debugSphereRenderer) return;

  // ── Step 1 — render opaque geometry into the foreground offscreen ─────────
  //
  // Clear colour to transparent black (r:0,g:0,b:0,a:0) so pixels the
  // foreground does NOT draw retain full transparency — the OVER composite
  // will leave those pixels unchanged in the HDR target.
  //
  // Clear depth to 1.0 (far plane) so the first foreground fragment always
  // wins the initial depth test regardless of draw order.
  const fgPass = encoder.beginRenderPass({
    label: 'foreground-depth-pass',
    colorAttachments: [
      {
        view: foregroundOffscreen.colorView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: foregroundOffscreen.depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  // One MVP per debug body, each composed fully in f64 before narrowing to
  // f32 (see composeBodyMvp for the catastrophic-cancellation rationale). The
  // renderer draws each into the depth-tested foreground in array order.
  const mvps = DEBUG_SPHERE_BODIES.map((body) =>
    composeBodyMvp(ctx.foregroundVp, body.positionMpc, ctx.renderOrigin, body.radiusMpc),
  );
  debugSphereRenderer.draw(fgPass, mvps);

  fgPass.end();

  // ── Step 2 — OVER-composite the foreground colour onto the HDR target ─────
  //
  // 'loadOp: load' preserves the galaxy/disk/volume backdrop already in
  // ctx.postProcess.view.  The ForegroundComposite pipeline uses straight-alpha
  // OVER blending (src-alpha / one-minus-src-alpha), so transparent foreground
  // pixels are no-ops and opaque pixels fully replace the HDR backdrop.
  //
  // No depth attachment: the composite is a fullscreen blit — depth ordering
  // was already resolved inside the foreground offscreen pass above.
  const compositePass = encoder.beginRenderPass({
    label: 'foreground-composite-pass',
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });

  foregroundComposite.draw(compositePass, foregroundOffscreen.colorView);

  compositePass.end();
}
