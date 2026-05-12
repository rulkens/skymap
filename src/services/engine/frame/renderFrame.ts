/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`.  D.1 (`FrameContext`) cut
 * the ad-hoc snapshot work; D.2 (this commit) cuts the inline draw
 * blocks.  What remains in this file is the encoder lifecycle plus
 * the registry loop:
 *
 *   1. `createCommandEncoder()`
 *   2. `beginRenderPass()` against the HDR offscreen target
 *   3. `for (const pass of HDR_PASSES) if (pass.enabled(...)) pass.draw(...)`
 *   4. `pass.end()`
 *   5. `postProcess.draw(...)` (HDR → swap chain tone-map blit)
 *   6. `device.queue.submit([encoder.finish()])`
 *
 * Each entry in `HDR_PASSES` is a `Pass` const declared in its own
 * file under `passes/`.  See `passes/types.ts` for the interface
 * contract and `passes/index.ts` for the canonical draw order.
 *
 * ### Why pass an explicit input bag instead of capturing closure?
 *
 * Same rationale as pre-D.2: this module owns no cross-frame state,
 * every variable it reads is recomputed each frame.  A free function
 * taking a struct of inputs is trivially testable and bounds the
 * encoder lifetime to the function body.
 *
 * ### What the encoder records, in order
 *
 *   pass 1: HDR render pass (colour-only, additive blending)
 *     - clear postProcess.view to (0, 0, 0, 1)
 *     - HDR_PASSES[0..3] dispatched in array order; each gates
 *       itself via `enabled(...)`.  See `passes/index.ts` for the
 *       canonical order rationale.
 *     - pass.end()
 *
 *   pass 2: tone-map post-process
 *     - sample the HDR target, write to swap chain
 *     - applies the user's `toneMapCurve` and `exposure` uniforms
 *     - is called via `postProcess.draw`, which begins+ends its own
 *       internal render pass on the same encoder
 *
 *   submit: device.queue.submit([encoder.finish()])
 *
 * The two passes share an encoder so the GPU sees them in deterministic
 * order — critical because the tone-map pass reads the texture the
 * HDR pass wrote.
 *
 * ### Why tone-map isn't in `HDR_PASSES`
 *
 * Tone-map runs OUTSIDE the HDR `beginRenderPass` block: it samples
 * the HDR offscreen target the four HDR passes accumulated into and
 * blits to the swap chain.  Modelling it as a `Pass` would force a
 * divergent signature (encoder vs. pass-encoder) for one inhabitant.
 * The spec D.2 "tone-map special case" section documents the
 * rejected alternatives; the inline-after-loop approach is the
 * lightest shape that keeps `Pass` honest.
 *
 * ### What stays in `runFrame()` (NOT here)
 *
 *   - Auto-LOD mask refresh (mutates engine state + fires a callback).
 *   - Hover pick readback (mutates `hoveredIndex` + queues another GPU
 *     submit on its own — the pick renderer encodes its own commands).
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, SpaceMouse apply,
 *     auto-rotate yaw bump).
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { HDR_PASSES } from './passes';

/**
 * Encode and submit one frame's worth of HDR + tone-map work.
 *
 * The function is synchronous: it builds the command encoder,
 * dispatches every enabled HDR pass in `HDR_PASSES` order, runs the
 * tone-map post-process, and submits the buffer.  No part of the
 * encoder lifecycle escapes — by the time `renderFrame` returns,
 * the GPU has the buffer queued.
 *
 * Order of operations matches the pre-D.2 inline body verbatim; the
 * visual output is identical.  Reordering the HDR passes is now a
 * one-line shuffle of the `HDR_PASSES` array literal.
 */
export function renderFrame(input: RenderFrameInput): void {
  const {
    ctx,
    state,
    milkyWayITimeSec,
    device,
    context,
    milkyWayRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    thumbnailRenderer,
    texturedDiskRenderer,
    settings,
    famousMeta,
    famousXrefs,
    clouds,
  } = input;

  // Bundle the renderer references each pass might need into a single
  // `PassDeps` bag.  We build it once per frame rather than rebuilding
  // it inside the loop because the references are stable for the
  // duration of `renderFrame`'s execution.  See `passes/types.ts`'s
  // `PassDeps` declaration for the per-field rationale.
  const deps: PassDeps = {
    thumbnailRenderer,
    texturedDiskRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    milkyWayRenderer,
    clouds,
    famousMeta,
    famousXrefs,
    milkyWayITimeSec,
  };

  // ── Encoder + HDR render pass ──────────────────────────────────────
  const encoder = device.createCommandEncoder();

  // Clear colour is pure black (0, 0, 0).
  // Additive blending starting from black gives the maximum dynamic
  // range — dense overlap regions bloom bright.
  //
  // The colour attachment is the HDR rgba16float offscreen target,
  // NOT the swap chain.  Every visible pass below accumulates into
  // this float buffer; the swap chain is written exactly once at the
  // end of the frame by the tone-map pass.  Without HDR + tone-map,
  // additive overlap >1.0 just clips and cluster cores blow out to
  // flat white.
  //
  // No depth attachment: every pipeline drawing into this pass uses
  // pure additive blending (`srcFactor: 'one', dstFactor: 'one'`) with
  // `depthWriteEnabled: false`, so per-fragment colour is order-
  // independent (A+B = B+A).  See `services/gpu/postProcess.ts` for
  // the history (a depth attachment was tried in commit 716eb6b and
  // superseded by 28aced5).
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  // ── HDR passes ─────────────────────────────────────────────────────
  //
  // Iterate the registry in declared order.  Each pass owns its own
  // `enabled` gate — we don't re-implement gating logic here.  This
  // is the entire HDR-pass body post-D.2; the four inline draw
  // blocks pre-D.2 are now four one-file pass modules under
  // `passes/`.
  for (const pass of HDR_PASSES) {
    if (pass.enabled(state, ctx, settings)) {
      pass.draw(renderPass, ctx, state, settings, deps);
    }
  }

  renderPass.end();

  // ── HDR → swap chain tone-map ──────────────────────────────────────
  //
  // After every additive contribution has been accumulated into the
  // HDR target, run the fullscreen tone-map post-process to compress
  // the linear-light values into the swap chain's displayable range.
  // Both passes are encoded into the same `encoder`, so the GPU sees:
  //
  //   1. clear+draw into hdrTarget (HDR_PASSES)
  //   2. fullscreen blit hdrTarget → swap chain (tone-map)
  //
  // Switching `toneMapCurve` between Linear / Reinhard / Asinh /
  // Gamma 2 / ACES is a single 4-byte uniform write inside the pass
  // — no pipeline rebuild, instant visual A/B.
  //
  // Tone-map stays inline rather than becoming a `Pass`: it samples
  // the HDR target the four HDR passes wrote into and runs OUTSIDE
  // the open render-pass block.  Modelling it as a `Pass` would
  // force a divergent signature (encoder vs. pass-encoder) for one
  // inhabitant.  See spec D.2 "tone-map special case".
  ctx.postProcess.draw(
    encoder,
    context.getCurrentTexture().createView(),
    settings.exposure,
    settings.toneMapCurve,
  );

  // Seal the command buffer and send it to the GPU.
  device.queue.submit([encoder.finish()]);
}
