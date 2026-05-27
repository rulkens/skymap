/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`.  D.1 (`FrameContext`) cut
 * the ad-hoc snapshot work; D.2 cut the inline draw blocks into the
 * `HDR_PASSES` registry.  What remains in this file is the encoder
 * lifecycle, the conditional HDR-rendering branch, the tone-map blit,
 * and the post-tone-map UI overlay — see "What the encoder records,
 * in order" below.
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
 *   1. HDR rendering — `encodeHdrSingle` (default) OR `encodeHdrSplit`
 *      (when `timingService.enabled`, so each pass can carry its own
 *      `timestampWrites`).  Both shapes write into the rgba16float
 *      HDR target; the per-pass-split variant pays a tile-RAM round-
 *      trip per boundary on M1, which is acceptable in dev mode but
 *      not in production.
 *
 *   2. Tone-map post-process.  Samples the HDR target and writes the
 *      compressed [0, 1] range to the swap chain.  Begins+ends its
 *      own internal render pass on the same encoder via
 *      `postProcess.draw`.
 *
 *   3. UI overlay (`encodeUiOverlay`).  Composites marker-lines + labels
 *      onto the tone-mapped swap chain via premultiplied OVER blend.
 *      Lives post-tone-map so the OVER overlays bypass the tone-map
 *      curve (no `[8, 8, 8, 1]` overshoot hack needed) and so their
 *      blend reads coherent `dst.color` from the swap-chain target
 *      (the additive HDR passes can't corrupt UI overlay coherency
 *      because they target a different texture).  See `encodeUiOverlay.ts`
 *      for the full coherency / colour-mismatch rationale.
 *
 *   4. (timing path only) `resolveQuerySet` + `copyBufferToBuffer`
 *      recorded via `timingService.endFrame`.
 *
 *   submit: device.queue.submit([encoder.finish()])
 *
 * Every pass shares one encoder so the GPU sees them in deterministic
 * order — critical because each pass reads what the previous one wrote.
 *
 * ### Why tone-map and encodeUiOverlay aren't in `HDR_PASSES`
 *
 * Tone-map and encodeUiOverlay both target the swap chain (not the HDR
 * offscreen target), and encodeUiOverlay's blend is premultiplied OVER
 * rather than additive.  Modelling them as `Pass` entries would
 * require divergent signatures (target view, blend semantics) for
 * the two outliers.  Keeping them as named functions called inline
 * from this orchestrator is the lightest shape that lets `Pass` stay
 * a uniform additive-HDR contract.
 *
 * ### What stays in `runFrame()` (NOT here)
 *
 *   - Hover pick readback (mutates `hoveredIndex` + queues another GPU
 *     submit on its own — the pick renderer encodes its own commands).
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, SpaceMouse apply,
 *     auto-rotate yaw bump).
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { encodeHdrSingle } from './encodeHdrSingle';
import { encodeHdrSplit } from './encodeHdrSplit';
import { encodeUiOverlay } from './encodeUiOverlay';

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
    horizonShellRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    settings,
    famousMeta,
    catalogs,
    timingService,
  } = input;

  // Bundle the renderer references each pass might need into a single
  // `PassDeps` bag.  We build it once per frame rather than rebuilding
  // it inside the loop because the references are stable for the
  // duration of `renderFrame`'s execution.  See `passes/types.ts`'s
  // `PassDeps` declaration for the per-field rationale.
  const deps: PassDeps = {
    texturedDiskRenderer,
    proceduralDiskRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    milkyWayRenderer,
    horizonShellRenderer,
    catalogs,
    famousMeta,
    milkyWayITimeSec,
  };

  // ── Encoder + HDR rendering ───────────────────────────────────────
  //
  // Two HDR-rendering shapes, picked at frame start based on whether
  // timing is enabled:
  //
  //   • `!timingService.enabled` (production path, no `?gpuTimings`):
  //     one mega-pass via `encodeHdrSingle`.  All HDR draws run inside
  //     one `beginRenderPass(loadOp: 'clear')` block, keeping the
  //     target tile-local for the whole pass.
  //
  //   • `timingService.enabled` (dev path, `?gpuTimings` active):
  //     per-pass split via `encodeHdrSplit` — one `beginRenderPass`
  //     per enabled HDR_PASSES entry so each pass can carry its own
  //     `timestampWrites` descriptor.  Pays a tile-RAM round-trip per
  //     boundary on M1, acceptable in dev mode.
  //
  // Both shapes are byte-equivalent on a spec-compliant desktop GPU
  // and feed the same downstream tone-map + UI-overlay sequence.
  const encoder = device.createCommandEncoder();
  const swapView = context.getCurrentTexture().createView();

  if (timingService.enabled) {
    const timingCtx = timingService.beginFrame();
    encodeHdrSplit(encoder, ctx, state, settings, deps, timingService);
    ctx.postProcess.draw(
      encoder,
      swapView,
      settings.exposure,
      settings.toneMapCurve,
      timingService.descriptorFor('tone-map'),
    );
    encodeUiOverlay(
      encoder,
      swapView,
      ctx,
      state,
      settings,
      deps,
      timingService.descriptorFor('ui-overlay'),
    );
    timingService.endFrame(timingCtx, encoder);
  } else {
    encodeHdrSingle(encoder, ctx, state, settings, deps);
    ctx.postProcess.draw(encoder, swapView, settings.exposure, settings.toneMapCurve, undefined);
    encodeUiOverlay(encoder, swapView, ctx, state, settings, deps, undefined);
  }

  device.queue.submit([encoder.finish()]);
}
