/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`.  D.1 (`FrameContext`) cut
 * the ad-hoc snapshot work; D.2 cut the inline draw blocks into the
 * `HDR_PASSES` registry.  What remains in this file is the encoder
 * lifecycle, the conditional HDR-rendering branch, and the tone-map
 * blit — see "What the encoder records, in order" below.
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
 * ### Two HDR-rendering shapes, one per timing-service state
 *
 * `timingService === null` → `hdrSinglePass`: one
 * `beginRenderPass(loadOp: 'clear')` block, all enabled HDR passes
 * draw inside, one `pass.end`.  This is the default production
 * shape — keeps the HDR target tile-local for the full pass, which
 * the premultiplied-OVER overlay passes (marker-lines, labels)
 * require for correct blending on tile-based GPUs.
 *
 * `timingService !== null` → `hdrSplitPasses`: 1 clear pass +
 * one `beginRenderPass(loadOp: 'load')` per enabled HDR pass.  Each
 * sub-pass carries its own `timestampWrites` descriptor so the
 * timing service can record begin/end ticks per pass.  Required for
 * `?gpuTimings` granular reporting; pays a tile-RAM round-trip per
 * boundary on M1, which is acceptable in dev mode but not in
 * production.
 *
 * Both shapes feed into the same tone-map post-process and submit.
 *
 * ### What the encoder records, in order
 *
 *   1. HDR rendering — single mega-pass OR (clear + per-pass split),
 *      depending on `timingService`.
 *
 *   2. Tone-map post-process.  Samples the HDR target, writes the
 *      swap chain.  Begins+ends its own internal render pass on the
 *      same encoder via `postProcess.draw`.
 *
 *   3. (timing path only) `resolveQuerySet` + `copyBufferToBuffer`
 *      recorded via `timingService.endFrame`.
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
import { hdrSinglePass } from './hdrSinglePass';
import { hdrSplitPasses } from './hdrSplitPasses';

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
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    settings,
    famousMeta,
    famousXrefs,
    clouds,
    timingService,
  } = input;

  // Bundle the renderer references each pass might need into a single
  // `PassDeps` bag.  We build it once per frame rather than rebuilding
  // it inside the loop because the references are stable for the
  // duration of `renderFrame`'s execution.  See `passes/types.ts`'s
  // `PassDeps` declaration for the per-field rationale.
  const deps: PassDeps = {
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    milkyWayRenderer,
    clouds,
    famousMeta,
    famousXrefs,
    milkyWayITimeSec,
  };

  // ── Encoder + HDR rendering ───────────────────────────────────────
  //
  // Two HDR-rendering shapes, picked at frame start based on whether a
  // timing service is attached:
  //
  //   • `timingService === null` (production path, no `?gpuTimings`):
  //     one mega-pass via `hdrSinglePass`.  All HDR draws run
  //     inside one `beginRenderPass(loadOp: 'clear')` block, keeping
  //     the target tile-local for the whole pass.  This is required
  //     for correctness of the premultiplied-OVER overlay passes
  //     (marker-lines, labels) on tile-based GPUs — see the helper's
  //     docstring for the coherency rationale.
  //
  //   • `timingService !== null` (dev path, `?gpuTimings` active):
  //     per-pass split via `hdrSplitPasses` — one
  //     `beginRenderPass` per enabled HDR_PASSES entry so each pass
  //     can carry its own `timestampWrites` descriptor.  WebGPU's
  //     timestamp-query attaches to pass boundaries, not draws, so
  //     per-pass timing has no other shape.  The OVER overlays may
  //     render at wrong alpha on M1 in this mode; that's the
  //     accepted cost of profiling.
  //
  // Both shapes are byte-equivalent on a spec-compliant desktop GPU
  // implementation; the split path's M1 coherency issue is a
  // tile-based-GPU driver behaviour the single-pass path sidesteps.
  const encoder = device.createCommandEncoder();

  // ── Per-frame timing window ───────────────────────────────────────
  //
  // When the timing service is non-null we open a frame-scoped context
  // here so each pass's `descriptorFor(slot)` call writes into the
  // same staging-buffer slot the service rotated to in `beginFrame`,
  // and so the `endFrame(ctx, encoder)` call at the bottom of this
  // function knows which staging buffer to resolve into.  Null when
  // the service is null (the common path) — `endFrame` is then
  // skipped entirely below.
  const timingCtx = timingService?.beginFrame() ?? null;

  if (timingService !== null) {
    hdrSplitPasses(encoder, ctx, state, settings, deps, timingService);
  } else {
    hdrSinglePass(encoder, ctx, state, settings, deps);
  }

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
    timingService?.descriptorFor('tone-map'),
  );

  // Record the `resolveQuerySet` + `copyBufferToBuffer` commands onto
  // this same encoder so the timing readback rides along with the
  // HDR + tone-map submits.  A single submit keeps the GPU's view of
  // the frame deterministic: every pass's begin/end timestamp lands
  // in the staging buffer before the next frame's `beginFrame`
  // rotates the slot cursor.  A no-op when `timingCtx` is null
  // (service was null or `beginFrame` returned null), which is the
  // common path.
  if (timingCtx && timingService) timingService.endFrame(timingCtx, encoder);

  // Seal the command buffer and send it to the GPU.
  device.queue.submit([encoder.finish()]);
}
