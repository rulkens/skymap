/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`.  D.1 (`FrameContext`) cut
 * the ad-hoc snapshot work; D.2 cut the inline draw blocks into the
 * `HDR_PASSES` registry; the per-pass-split refactor turned the
 * single shared HDR render pass into nine (1 clear + 8 sub-passes)
 * so each enabled pass can attach its own `timestampWrites`
 * descriptor.  What remains in this file is the encoder lifecycle,
 * the dedicated clear pass, the per-pass loop, and the tone-map
 * blit — see "What the encoder records, in order" below for the
 * step-by-step shape.
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
 *   1. Clear pass.  `loadOp: 'clear'`, no draws.  Wipes the HDR
 *      target to black.  Empty pass; ended immediately.
 *
 *   2..9. HDR_PASSES sub-passes.  One `beginRenderPass` per enabled
 *      pass, `loadOp: 'load'`, exactly one `pass.draw(...)`, end.
 *      The for-loop body is the entire HDR draw work post-split.
 *
 *   10. Tone-map post-process.  Samples the HDR target, writes the
 *       swap chain.  Begins+ends its own internal render pass on the
 *       same encoder via `postProcess.draw`.
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
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
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

  // ── Encoder + per-pass HDR rendering ──────────────────────────────
  //
  // Pre-split (commits before this one): one `beginRenderPass` opened
  // the HDR target with `loadOp: 'clear'`, every entry in HDR_PASSES
  // drew into that single open encoder, and `renderPass.end()` closed
  // it.
  //
  // Post-split: nine render passes per frame, all targeting the same
  // HDR view.  The first is a dedicated `loadOp: 'clear'` no-draw pass
  // — it wipes the target to black so subsequent passes can start
  // their additive accumulation from zero.  The remaining eight are
  // one per `HDR_PASSES` entry, each using `loadOp: 'load'`, calling
  // exactly one `pass.draw(...)`, then closing.
  //
  // Visual output is identical: every additive draw still composites
  // into the same float framebuffer in the same order.  See
  // `tests/visual/renderFrameSplitBaseline.test.ts` for the hash-
  // equivalence proof.
  //
  // Why a separate clear pass instead of `clear` on the first HDR_PASSES
  // entry: if HDR_PASSES[0] were gated off (e.g. `pointSpritesPass.enabled
  // = false` in some future configuration), the clear would silently
  // vanish.  A no-draw clear pass at the top of renderFrame keeps the
  // clear as a frame-lifecycle invariant — always runs, regardless of
  // which subsequent passes are enabled.  Cost: ~µs on desktop GPUs,
  // amortised by the subsequent draws.  See spec "Why a dedicated
  // clear pass instead of `clear` on pass 1".
  const encoder = device.createCommandEncoder();

  // ── Per-frame timing window ───────────────────────────────────────
  //
  // When the timing service is non-null we open a frame-scoped context
  // here so each pass's `descriptorFor(slot)` call writes into the
  // same staging-buffer slot the service rotated to in `beginFrame`,
  // and so the `endFrame(ctx, encoder)` call at the bottom of this
  // function knows which staging buffer to resolve into.  Null when
  // the service is null (the common, no-op-mode path) — every
  // downstream timing call short-circuits via the optional-chain
  // `timingService?.…` pattern, and the spread literal
  // `...(timestampWrites ? { timestampWrites } : {})` keeps the
  // beginRenderPass descriptors byte-identical to the pre-timing path.
  // See `tests/visual/renderFrameSplitBaseline.test.ts` for the
  // byte-identity proof.
  const timingCtx = timingService?.beginFrame() ?? null;

  // ── Clear pass (no draws) ─────────────────────────────────────────
  const clearPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  clearPass.end();

  // ── HDR sub-passes — one beginRenderPass per enabled pass ─────────
  //
  // Each pass owns its own enabled-gate.  Per-pass begin/end is
  // necessary so a future `timestampWrites` descriptor can attach to
  // each pass boundary individually (see Task 9 — wires the timing
  // service in).  Today, with no timing service attached, this is
  // pure structural prep: the GPU sees N "load + draw + store"
  // passes where it previously saw "clear + N draws + store".
  for (const pass of HDR_PASSES) {
    if (!pass.enabled(state, ctx, settings)) continue;

    // The pass-name → slot mapping is statically defined by
    // TIMING_SLOT_NAMES.  `pass.name` is typed `string`, but the
    // HDR_PASSES inhabitants' names are all keys of that table by
    // construction — the cast is safe and documented.  If a future
    // pass file forgets to add a slot, `descriptorFor` returns
    // `undefined` (active-mode lookup miss) or the service is in
    // no-op mode — either way the pass simply isn't measured and
    // still draws.  The optional-spread merge below keeps the
    // descriptor byte-identical to the pre-timing shape when the
    // result is `undefined`.
    const timestampWrites = timingService?.descriptorFor(pass.name as TimingSlotName);

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.postProcess.view,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
      ...(timestampWrites ? { timestampWrites } : {}),
    });
    pass.draw(passEncoder, ctx, state, settings, deps);
    passEncoder.end();
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
