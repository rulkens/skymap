/**
 * renderFrame — the per-frame command-encoder lifecycle: steps accumulate into
 * one pending program per view, flushed (executed, then submitted) only when
 * the next batch's view differs — the only place the `queue.writeBuffer` race
 * (`docs/RENDERER.md`) applies. Mono's one view never differs, so the whole
 * frame lands in a single submit, as today.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
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
  const { canvas, views, state, device, context, timingService } = input;

  // The shared cluster-focus uniform, before any pass or the later pick submit
  // reads it; blend=0 at rest makes the per-vertex multiplier a no-op.
  state.gpu.focusUniform?.write(canvas.snapshot.focus);

  const swapView = context.getCurrentTexture().createView();

  // One timing window spans every submit below (faces, and every flushed
  // batch): the query set is shared and `endFrame` resolves the whole of it,
  // so a face pass's or a view's timestamps land in the same readback as the
  // frame's.
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
  const hdrActive = hdrActiveOf(canvas.snapshot.renderTargets);
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

  const captureContexts = scheduleCubemapCaptures({ state, ctx: canvas });
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
  const expand = (steps: readonly FrameStepSpec[], viewCtx: FrameView): readonly FrameStep[] =>
    expandFrameOrder(steps, state.passes, {
      tone,
      bloomEnabled,
      foregroundChain: foregroundChainOrder(viewCtx.slabs),
      captureFaces,
      bodyRowSlabs: bodyRowSlabs(state, viewCtx),
    });

  // The batch building up for `currentView` — several sections' steps land in
  // ONE encoder as long as the view encoding into it doesn't change (`===`;
  // mono's rig hands back `canvas` itself for every section, so this never
  // changes and the whole frame lands in one submit, exactly as before the
  // rig split).
  let pending: FrameStep[] = [];
  let currentView: FrameView | null = null;

  /** Execute + submit whatever's pending. `executeFrame`'s own per-run first-touch
   *  bookkeeping is private to each call; the frame-wide "does target X hold this
   *  frame's content" fact every overlay pass reads lives on `canvas.snapshot`,
   *  shared by every view, so a `perView` section's draws are visible to the
   *  `once` overlays with no folding-back needed here. */
  const flush = (isFinal: boolean): void => {
    if (currentView === null) {
      if (!isFinal) return;
      // Guaranteed once per `beginFrame`, even on an otherwise-empty frame.
      const encoder = device.createCommandEncoder();
      timingService.endFrame(timingCtx, encoder);
      device.queue.submit([encoder.finish()]);
      return;
    }
    const view = currentView;
    const encoder = device.createCommandEncoder();
    executeFrame({ ...shared, ctx: view, encoder, program: pending });
    if (isFinal) timingService.endFrame(timingCtx, encoder);
    device.queue.submit([encoder.finish()]);
    pending = [];
    currentView = null;
  };

  /** Queue `steps` against `view`, flushing first if the running batch belongs to a different one. */
  const accumulate = (view: FrameView, steps: readonly FrameStep[]): void => {
    if (steps.length === 0) return;
    if (view !== currentView) {
      flush(false);
      currentView = view;
    }
    pending.push(...steps);
  };

  for (const section of VIEW_RIGS[state.viewRig].program) {
    if (section.scope === 'once') {
      const program = expand(section.steps, canvas);
      const { faces, frame } = partitionCaptureSteps(program);
      if (faces.length > 0) {
        // A capture face always gets its own encoder and submit, ahead of
        // the running batch — flush that out of the way first so a body
        // drawn for both never shares a submission (docs/RENDERER.md).
        flush(false);
        for (const face of faces) {
          const faceEncoder = device.createCommandEncoder();
          executeFrame({ ...shared, ctx: canvas, encoder: faceEncoder, program: face.steps });
          device.queue.submit([faceEncoder.finish()]);
        }
        for (const key of new Set(faces.map((face) => face.key))) {
          finishCubemapCapture(key, state, device);
        }
      }
      accumulate(canvas, frame);
    } else {
      for (const view of views) accumulate(view, expand(section.steps, view));
    }
  }

  flush(true);
}
