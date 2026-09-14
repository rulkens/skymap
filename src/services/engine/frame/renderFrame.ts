/**
 * renderFrame — the per-frame WebGPU command-encoder lifecycle: the
 * once-per-frame focus-uniform write, encoder create + swap-view acquire +
 * submit, the timing frame window, and the one call into
 * `scheduleCubemapCaptures`.
 *
 * Order of operations is DATA (`FRAME_ORDER` walked by `executeFrame`), so this
 * module knows no individual pass. The pick-debug overlay, the render-on-demand
 * decision and camera mutation stay in `runFrame`.
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';
import { executeFrame } from './executeFrame';
import { expandFrameOrder } from './expandFrameOrder';
import { FRAME_ORDER } from './frameOrder';
import { resolveStrategy } from './resolveStrategy';
import { foregroundChainOrder } from './slabs';
import { CONTENT_PASSES } from './passes';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import { lensBodySlabs } from './lensBodySlabs';
import { scheduleCubemapCaptures } from './scheduleCubemapCaptures';

/**
 * Encode and submit one frame. Synchronous: by the time it returns, the GPU
 * has the buffer queued. Order of operations is `FRAME_ORDER`'s expansion,
 * walked by `executeFrame`.
 */
export function renderFrame(input: RenderFrameInput): void {
  const { ctx, state, device, context, timingService } = input;

  // Write the single shared cluster-focus uniform once per frame, before any
  // pass (points, impostor disks, and the later pick submit) reads it.
  // blend=0 at rest makes the per-vertex multiplier a no-op. `ctx.focus` is the
  // per-frame FocusUniformsValue derived in deriveFrameContext.
  state.gpu.focusUniform?.write(ctx.focus);

  const encoder = device.createCommandEncoder();
  const swapView = context.getCurrentTexture().createView();

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

  executeFrame({
    encoder,
    ctx,
    state,
    program: expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
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
        [...captureContexts].map(([key, faces]): [CubemapCaptureKey, readonly CubeFace[]] => [
          key,
          [...faces.keys()],
        ]),
      ),
      lensBodySlabs: lensBodySlabs(state, ctx),
    }),
    strategy,
    timing: timingService,
    swapView,
    captureContexts,
  });
  timingService.endFrame(timingCtx, encoder);

  device.queue.submit([encoder.finish()]);
}
