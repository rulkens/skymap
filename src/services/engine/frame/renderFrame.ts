/**
 * renderFrame — the per-frame WebGPU command-encoder lifecycle: the
 * once-per-frame focus-uniform write, encoder create + swap-view acquire +
 * submit, the timing frame window, and the one call into
 * `scheduleCubemapCaptures`.
 *
 * Each scheduled capture face submits its OWN command buffer ahead of the
 * frame's: a body renderer rewrites its per-body uniform buffer per draw, so
 * a body drawn for a face and again for the view can only share a submission
 * by handing both draws the last write (`docs/RENDERER.md`, landmine #1).
 * Order of operations is DATA (`FRAME_ORDER` walked by `executeFrame`), so
 * this module knows no individual pass.
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import { executeFrame } from './executeFrame';
import { expandFrameOrder } from './expandFrameOrder';
import { finishCubemapCapture } from './finishCubemapCapture';
import { FRAME_ORDER } from './frameOrder';
import { partitionCaptureSteps } from './partitionCaptureSteps';
import { resolveStrategy } from './resolveStrategy';
import { foregroundChainOrder } from './slabs';
import { CONTENT_PASSES } from './passes';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import { lensBodySlabs } from './lensBodySlabs';
import { scheduleCubemapCaptures } from './scheduleCubemapCaptures';

/**
 * Encode and submit one frame. Synchronous: by the time it returns, the GPU
 * has the buffers queued. Order of operations is `FRAME_ORDER`'s expansion,
 * walked by `executeFrame`.
 */
export function renderFrame(input: RenderFrameInput): void {
  const { ctx, state, device, context, timingService } = input;

  // Write the single shared cluster-focus uniform once per frame, before any
  // pass (points, impostor disks, and the later pick submit) reads it.
  // blend=0 at rest makes the per-vertex multiplier a no-op. `ctx.focus` is the
  // per-frame FocusUniformsValue derived in deriveFrameContext.
  state.gpu.focusUniform?.write(ctx.focus);

  const swapView = context.getCurrentTexture().createView();

  // One timing window spans the face submissions and the frame's: the query
  // set is shared and `endFrame` resolves the whole of it, so a face pass's
  // timestamps land in the same readback as the frame's.
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

  const captureContexts = scheduleCubemapCaptures({ state, ctx });

  const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
    tone: {
      exposure: state.settings.tonemap.exposure,
      curve: state.settings.tonemap.curve,
      hdrKnee: hdrOn ? state.settings.hdr.knee : 0,
      hdrHeadroom: hdrOn ? state.settings.hdr.headroom : 0,
    },
    // The master bloom toggle is the ONLY bloom value that shapes the step
    // list; strength/threshold are read live by the bloom passes each draw.
    bloomEnabled: state.settings.bloom.enabled,
    // Painter-ordered NEAR0 + body-row indices — the chain the
    // foreground:0 line expands over, one step per entry.
    foregroundChain: foregroundChainOrder(ctx.slabs),
    // Derived from the one map, so the step list and the per-face cameras
    // cannot drift: a face is expanded iff it has a context.
    captureFaces: new Map(
      [...captureContexts].map(
        ([key, faces]) =>
          [key, [...faces].map(([face, { bodySlabs }]) => ({ face, bodySlabs }))] as const,
      ),
    ),
    lensBodySlabs: lensBodySlabs(state, ctx),
  });
  const { faces, frame } = partitionCaptureSteps(program);
  const shared = { ctx, state, strategy, timing: timingService, swapView, captureContexts };

  for (const face of faces) {
    const faceEncoder = device.createCommandEncoder();
    executeFrame({ ...shared, encoder: faceEncoder, program: face.steps });
    device.queue.submit([faceEncoder.finish()]);
  }
  for (const key of new Set(faces.map((face) => face.key))) {
    finishCubemapCapture(key, state, device);
  }

  const encoder = device.createCommandEncoder();
  executeFrame({ ...shared, encoder, program: frame });
  timingService.endFrame(timingCtx, encoder);
  device.queue.submit([encoder.finish()]);
}
