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
 * Each entry in `HDR_PASSES` is a `ContentLayer` const declared in its own
 * file under `passes/`.  See `@types/engine/frame/ContentLayer.d.ts` for the
 * interface contract and `passes/index.ts` for the canonical draw order.
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
 *   - `drawPickDebugOverlay` — composites the pick-buffer debug overlay over
 *     the swap chain using its own encoder/submit (AFTER this function's
 *     submit), so it can read `state.picking.lastFrameUniformBytes`.
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, auto-rotate yaw
 *     bump).
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
    device,
    context,
    milkyWayCloudRenderer,
    horizonShellRenderer,
    filamentRenderer,
    volumeFieldRenderer,
    flowFieldRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    timingService,
  } = input;

  // Bundle the renderer references `UI_PASSES` might need into a single
  // `PassDeps` bag.  The nine HDR layers no longer read this bag — they're
  // `ContentLayer`s now and read their renderers straight off `state.gpu.*`
  // (see `passes/index.ts`) — but `UI_PASSES` is still `Pass`-shaped until
  // a follow-up task converts it, so `encodeUiOverlay` below still needs
  // `deps`.  See `PassDeps.d.ts` for the per-field rationale.
  const deps: PassDeps = {
    texturedDiskRenderer,
    proceduralDiskRenderer,
    filamentRenderer,
    volumeFieldRenderer,
    flowFieldRenderer,
    milkyWayCloudRenderer,
    horizonShellRenderer,
  };

  // Write the single shared cluster-focus uniform once per frame, before
  // any pass (points, impostor disks, and the later pick submit) reads it.
  // blend=0 at rest makes the per-vertex multiplier a no-op.
  // ctx.focus is the per-frame FocusUniformsValue derived in deriveFrameContext.
  state.gpu.focusUniform?.write(ctx.focus);

  // ── Encoder + HDR rendering ───────────────────────────────────────
  //
  // The HDR draws take one of two shapes, the ONLY frame-level branch:
  //
  //   • `encodeHdrSingle` (production, no `?gpuTimings`): one mega-pass.
  //     All HDR draws run inside one `beginRenderPass(loadOp: 'clear')`
  //     block, keeping the target tile-local for the whole pass.
  //
  //   • `encodeHdrSplit` (dev, `?gpuTimings` active): one `beginRenderPass`
  //     per enabled HDR_PASSES entry so each can carry its own
  //     `timestampWrites` descriptor.  Pays a tile-RAM round-trip per
  //     boundary on M1, acceptable in dev mode.
  //
  // That split is essential — you can't attach per-pass timestamps inside
  // a single merged pass.  Everything around it is shape-invariant: the
  // tone-map + UI-overlay sequence is identical, and the timing
  // bookkeeping (`beginFrame`/`descriptorFor`/`endFrame`) is a cheap no-op
  // when `!timingService.enabled` (see GpuTimingService's no-op contract),
  // so it runs unconditionally rather than mirrored across both branches.
  const encoder = device.createCommandEncoder();
  const swapView = context.getCurrentTexture().createView();

  const timingCtx = timingService.beginFrame();
  if (timingService.enabled) {
    encodeHdrSplit(encoder, ctx, state, timingService);
  } else {
    encodeHdrSingle(encoder, ctx, state);
  }
  ctx.postProcess.draw(
    encoder,
    swapView,
    state.settings.tonemap.exposure,
    state.settings.tonemap.curve,
    timingService.descriptorFor('tone-map'),
  );
  encodeUiOverlay(encoder, swapView, ctx, state, deps, timingService.descriptorFor('ui-overlay'));
  timingService.endFrame(timingCtx, encoder);

  device.queue.submit([encoder.finish()]);
}
