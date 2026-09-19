/**
 * renderFrame — the per-frame WebGPU command-encoder lifecycle: focus-uniform
 * write, encoder create + submit, the timing window, and the one call into
 * `scheduleCubemapCaptures`. Order of operations is DATA (the rig's
 * `program`), so this module knows no individual pass.
 *
 * Each capture face and each `perView` section run submits its OWN command
 * buffer ahead of the rest: a body renderer rewrites its per-body uniform
 * buffer per draw, so two draws sharing a destination buffer cannot share a
 * submission (`docs/RENDERER.md`'s `queue.writeBuffer` race).
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import { executeFrame } from './executeFrame';
import { expandFrameOrder } from './expandFrameOrder';
import { finishCubemapCapture } from './finishCubemapCapture';
import { partitionCaptureSteps } from './partitionCaptureSteps';
import { resolveStrategy } from './resolveStrategy';
import { foregroundChainOrder } from './slabs';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import { bodyRowSlabs } from './bodyRowSlabs';
import { scheduleCubemapCaptures } from './scheduleCubemapCaptures';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';

export function renderFrame(input: RenderFrameInput): void {
  const { ctx, views, state, device, context, timingService } = input;

  // The shared cluster-focus uniform, before any pass or the later pick submit
  // reads it; blend=0 at rest makes the per-vertex multiplier a no-op.
  state.gpu.focusUniform?.write(ctx.focus);

  const swapView = context.getCurrentTexture().createView();

  // One timing window spans every submit below (faces, and every `once`/
  // `perView` batch): the query set is shared and `endFrame` resolves the
  // whole of it, so a face pass's or a view's timestamps land in the same
  // readback as the frame's.
  const timingCtx = timingService.beginFrame();
  // 'auto' = per-layer timed passes when timing is on, else the merged
  // tile-local passes OVER blends need on Apple Silicon.
  const strategy: RenderStrategy = resolveStrategy(
    state.settings.debug.renderStrategy,
    timingService.enabled,
  );
  // Both conjuncts: the swap-format saga and the settings write it reacts to
  // land in separate frames, and headroom 0 is exactly SDR, so gating on both
  // keeps that in-between frame correct.
  const hdrActive = hdrActiveOf(ctx.renderTargets);
  const hdrOn = hdrActive && state.settings.hdr.enabled;
  const tone = {
    exposure: state.settings.tonemap.exposure,
    curve: state.settings.tonemap.curve,
    hdrKnee: hdrOn ? state.settings.hdr.knee : 0,
    hdrHeadroom: hdrOn ? state.settings.hdr.headroom : 0,
  };
  // The master bloom toggle is the ONLY bloom value that shapes the step
  // list; strength/threshold are read live by the bloom passes each draw.
  const bloomEnabled = state.settings.bloom.enabled;

  const captureContexts = scheduleCubemapCaptures({ state, ctx });
  // Derived from the one map, so the step list and the per-face cameras
  // cannot drift: a face is expanded iff it has a context.
  const captureFaces = new Map(
    [...captureContexts].map(
      ([key, faces]) =>
        [key, [...faces].map(([face, { bodySlabs }]) => ({ face, bodySlabs }))] as const,
    ),
  );
  const shared = { state, strategy, timing: timingService, swapView, captureContexts };

  /** One section's steps, expanded from `viewCtx` — captures/bloom/tone are frame-wide, the rest view-derived. */
  const expand = (
    steps: readonly FrameStepSpec[],
    viewCtx: ReadyFrameContext,
  ): readonly FrameStep[] =>
    expandFrameOrder(steps, state.passes, {
      tone,
      bloomEnabled,
      foregroundChain: foregroundChainOrder(viewCtx.slabs),
      captureFaces,
      bodyRowSlabs: bodyRowSlabs(state, viewCtx),
    });

  const rig = VIEW_RIGS[state.viewRig];

  // Every batch this frame still has to submit, in program order — each gets
  // its OWN encoder below: a `once` section's non-capture steps are one
  // batch, and a `perView` section contributes one batch per view (the
  // writeBuffer race this guards against — docs/RENDERER.md). Captures are
  // the exception, submitted eagerly per face as the loop reaches them
  // (unaffected by which section-batch follows).
  const mainBatches: {
    readonly viewCtx: ReadyFrameContext;
    readonly steps: readonly FrameStep[];
  }[] = [];

  for (const section of rig.program) {
    if (section.scope === 'once') {
      const program = expand(section.steps, ctx);
      const { faces, frame } = partitionCaptureSteps(program);
      for (const face of faces) {
        const faceEncoder = device.createCommandEncoder();
        executeFrame({ ...shared, ctx, encoder: faceEncoder, program: face.steps });
        device.queue.submit([faceEncoder.finish()]);
      }
      for (const key of new Set(faces.map((face) => face.key))) {
        finishCubemapCapture(key, state, device);
      }
      if (frame.length > 0) mainBatches.push({ viewCtx: ctx, steps: frame });
    } else {
      for (const view of views) {
        const program = expand(section.steps, view);
        if (program.length > 0) mainBatches.push({ viewCtx: view, steps: program });
      }
      // First-touch across views: each view keeps its OWN renderedTargets
      // (a second view clears `hdr` rather than loading the first view's
      // pixels — `deriveViewContext`, a later task, is what mints one per
      // view). Folding the union into the main ctx's set here is what lets a
      // following `once` section see those targets as already rendered.
      // Mono's views are `[ctx]` itself, so this is a no-op there.
      const mainTouched = ctx.renderedTargets as Set<string>;
      for (const view of views) {
        for (const target of view.renderedTargets) mainTouched.add(target);
      }
    }
  }

  mainBatches.forEach(({ viewCtx, steps }, i) => {
    const encoder = device.createCommandEncoder();
    executeFrame({ ...shared, ctx: viewCtx, encoder, program: steps });
    // The resolve + copy commands ride the FRAME's last submit, whichever
    // batch that turns out to be — attached before `finish()` so they land in
    // the same command buffer as that batch's draws.
    if (i === mainBatches.length - 1) timingService.endFrame(timingCtx, encoder);
    device.queue.submit([encoder.finish()]);
  });
}
