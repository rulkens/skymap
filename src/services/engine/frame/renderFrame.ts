/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle, and
 * runs the FRAME program into it.
 *
 * Before the renderer unification, ~140 lines of imperative GPU plumbing
 * sprawled here: a two-way HDR-encoder branch, a tone-map blit, and a
 * post-tone-map UI overlay, each a hand-wired call whose order was implicit
 * in which function called which. That order is now DATA — `frameProgram(tone)`
 * returns the ordered
 * `FrameStep[]`, and `executeFrame` is the single imperative site that walks
 * it into one encoder. This module shrank to three responsibilities: the
 * once-per-frame focus-uniform write, the encoder lifecycle (create + swap-view
 * acquire + submit), and the timing frame window.
 *
 * ### What this function does, in order
 *
 *   1. Write the shared cluster-focus uniform once, before any pass reads it.
 *   2. Create the frame's single command encoder + acquire the swap-chain view.
 *   3. Open the timing frame (`beginFrame`) and pick the render strategy:
 *      `'perLayerTimed'` when timing is enabled (one pass per layer so each can
 *      carry its own `timestampWrites`), else `'merged'` (one pass per target
 *      group — the tile-local production path OVER blends need).
 *   4. `executeFrame` walks `frameProgram(tone)` over `CONTENT_LAYERS`: the flow
 *      compute, the scalar-volume render, the HDR render, the `hdr→swap`
 *      tone-map composite, then the swap-chain overlay render.
 *   5. Record the timing resolve/copy (`endFrame`) and submit.
 *
 * The strategy fork, the tile-local coherency rationale, the first-touch clear,
 * and the single slab resolution per render step all now live in `executeFrame`
 * — see its module header. `renderFrame` no longer knows about individual
 * passes; adding, removing, or reordering one is a registry / program edit.
 *
 * ### Why pass an explicit input bag instead of capturing closure?
 *
 * This module owns no cross-frame state — every value it reads is recomputed
 * each frame. A free function taking a struct of inputs is trivially testable
 * and bounds the encoder lifetime to the function body.
 *
 * ### What stays in `runFrame()` (NOT here)
 *
 *   - `drawPickDebugOverlay` — composites the pick-buffer debug overlay over the
 *     swap chain using its own encoder/submit (AFTER this function's submit); it
 *     rebuilds the pick uniform bytes at pick time from the slab view (see
 *     `pickUniformBytesOf`).
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, auto-rotate yaw bump).
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import { executeFrame } from './executeFrame';
import { frameProgram } from './frameProgram';
import { resolveStrategy } from './resolveStrategy';
import { CONTENT_LAYERS } from './passes';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import { vrOverride, applyVrEyeToCtx } from '../../xr/vrSpikeState';

/**
 * Encode and submit one frame. Synchronous: by the time it returns, the GPU
 * has the buffer queued. Order of operations is the `frameProgram` step list
 * walked by `executeFrame`; the visual output is identical to the pre-unification
 * inline body.
 */
export function renderFrame(input: RenderFrameInput): void {
  const { ctx, state, device, context, timingService } = input;

  // Write the single shared cluster-focus uniform once per frame, before any
  // pass (points, impostor disks, and the later pick submit) reads it.
  // blend=0 at rest makes the per-vertex multiplier a no-op. `ctx.focus` is the
  // per-frame FocusUniformsValue derived in deriveFrameContext.
  state.gpu.focusUniform?.write(ctx.focus);

  const encoder = device.createCommandEncoder();
  // THROWAWAY (vrSpike): in an XR session the presented targets are the
  // projection layer's per-eye textures; the canvas swap chain is not
  // acquired at all (its size is pinned to the eye size purely so the
  // offscreen chain reconciles to XR resolution).
  const vrEyes = vrOverride.active && vrOverride.eyes.length > 0 ? vrOverride.eyes : null;
  const swapView = vrEyes ? null : context.getCurrentTexture().createView();

  const timingCtx = timingService.beginFrame();
  // The frame's pass shape: `settings.debug.renderStrategy` overrides it, defaulting
  // to 'auto' — per-layer timed passes when timing is enabled (each carries its own
  // `timestampWrites`), else the merged tile-local passes OVER blends need on Apple
  // Silicon. `resolveStrategy` decouples that shape from the timing flag (Joint 1);
  // `executeFrame` applies the result uniformly across every render step.
  const strategy: RenderStrategy = resolveStrategy(
    state.settings.debug.renderStrategy,
    timingService.enabled,
  );
  // Zeroed unless BOTH conjuncts hold. `hdrActive` mirrors the swap chain's
  // live format (`hdrActiveOf`); `hdr.enabled` is the visitor's toggle. The
  // saga that reconfigures the swap format and the settings write it's
  // reacting to land in separate frames, so a frame can be caught with the
  // surface already `rgba16float` while `enabled` is still false, or vice
  // versa. Headroom 0 is exactly the SDR result, so gating on both conjuncts
  // makes that in-between frame correct, not just a safe fallback.
  const hdrActive = hdrActiveOf(ctx.renderTargets);
  const hdrOn = hdrActive && state.settings.hdr.enabled;
  const program = frameProgram(
    {
      exposure: state.settings.tonemap.exposure,
      curve: state.settings.tonemap.curve,
      hdrKnee: hdrOn ? state.settings.hdr.knee : 0,
      hdrHeadroom: hdrOn ? state.settings.hdr.headroom : 0,
    },
    // The master bloom toggle is the ONLY bloom value that shapes the step
    // list; strength/threshold are read live by the bloom layers each draw.
    state.settings.bloom.enabled,
  );
  if (vrEyes) {
    // THROWAWAY (vrSpike): walk the same program once per eye, each into its
    // own encoder (see the per-eye submit below). applyVrEyeToCtx swaps the
    // per-eye vp/slabs/camPos onto ctx and resets the first-touch set so
    // every target clears again — the offscreen chain is reused sequentially
    // across eyes, which pass ordering (each eye fully submitted before the
    // next starts recording) makes safe.
    //
    // `layerAllow` is the spike's Earth-only start mode: non-null restricts
    // the walked layer list to the named subset (vrSpike.ts sets it at
    // session start), leaving the non-VR path's `CONTENT_LAYERS` untouched.
    const eyeLayers = vrOverride.layerAllow
      ? CONTENT_LAYERS.filter((l) => vrOverride.layerAllow!.has(l.name))
      : CONTENT_LAYERS;
    for (const eye of vrEyes) {
      // THROWAWAY (vrSpike): each eye gets its OWN encoder + submit here.
      // `device.queue.writeBuffer` (per-draw uniform uploads) lands in queue
      // order IMMEDIATELY, ahead of any encoder's eventual `submit` — it is
      // NOT ordered against the draws recorded between writes (the same
      // writeBuffer-vs-submit landmine `planetRenderer`/`earthLayer` document
      // for a single encoder). Sharing the outer `encoder` across both eyes
      // meant eye 1's uniform writes clobbered eye 0's before either eye's
      // draws were submitted, so both eyes presented eye 1's matrices —
      // submitting per eye forces each eye's writes to land before its own
      // draws submit.
      const eyeEncoder = device.createCommandEncoder();
      applyVrEyeToCtx(ctx, eye);
      executeFrame({
        encoder: eyeEncoder,
        ctx,
        state,
        program,
        layers: eyeLayers,
        strategy,
        timing: timingService,
        swapView: eye.textureView,
      });
      device.queue.submit([eyeEncoder.finish()]);
    }
  } else {
    executeFrame({
      encoder,
      ctx,
      state,
      program,
      layers: CONTENT_LAYERS,
      strategy,
      timing: timingService,
      swapView: swapView!,
    });
  }
  timingService.endFrame(timingCtx, encoder);

  // THROWAWAY (vrSpike): in the VR branch `encoder` above never receives a
  // draw — each eye records and submits its own encoder — so GPU timing
  // (bracketed on `encoder` by `beginFrame`/`endFrame`) isn't meaningful in
  // VR spike mode. Still submitting it here closes out its timing
  // resolve/copy and keeps the non-VR path's single `submit` call untouched.
  device.queue.submit([encoder.finish()]);
}
