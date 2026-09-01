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
 * This module owns no cross-frame state of its OWN — every local value it
 * computes is recomputed each frame. It DOES read/write one Resource, Task
 * 12's `state.cameraRuntime.skyCubemapCapture` (the black-hole lens's
 * amortized sky-capture bookkeeping), the same amortized-Resources shape
 * `cameraRuntime`'s other fields already carry — see
 * `SkyCubemapCaptureRuntime.d.ts`. A free function taking a struct of inputs
 * is trivially testable and bounds the encoder lifetime to the function body.
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
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { executeFrame } from './executeFrame';
import { frameProgram } from './frameProgram';
import { resolveStrategy } from './resolveStrategy';
import { foregroundChainOrder } from './slabs';
import { CONTENT_LAYERS } from './passes';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import {
  skyCubemapCaptureSchedule,
  SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_AU,
} from './skyCubemapCaptureSchedule';
import { skyCubemapFaceContext } from './skyCubemapFaceContext';
import { sceneBodyStates } from './sceneBodyStates';
import { regionById } from '../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SGR_A_STAR, SGR_A_STAR_ANCHOR } from '../../../data/bodies/sceneSgrAStar';

const SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_MPC =
  SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_AU * SCALE_UNITS.AU_TO_MPC;

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

  // The black-hole lens's amortized sky-cubemap capture schedule (Task 12).
  // `bandAlpha` keys on the CAMERA's distance from the galactic-centre
  // anchor, same quantity + region every `sgrAStarLensing`-band consumer
  // reads (`scaleFadeBands.ts`). Bookkeeping lives on `cameraRuntime`, not
  // here — see `SkyCubemapCaptureRuntime.d.ts` for why `renderFrame` (which
  // owns no cross-frame state of its own) is still this bag's sole writer.
  const captureRuntime = state.cameraRuntime.skyCubemapCapture;
  const gcDistanceMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    regionById('galactic-centre'),
    sceneBodyStates(state, ctx),
  );
  const bandActive = fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, gcDistanceMpc) > 0;

  // Sgr A*'s own body-m slab row this frame, if the band is active (Task 14,
  // Ruling 8): `frameProgram` never emitted an (hdr, BODY[k]) step for
  // `sgrAStarLensingLayer` before this task, so it compiled and registered
  // but never drew (Task 13's own finding). Resolved here, not in
  // `frameProgram`, because the row's painter-order index comes from
  // `deriveSlabs` (computed upstream of this function) — the same
  // "resolve here, hand data down" split `earthSlab` in `runFrame.ts`
  // already follows for the identical `frame.kind === 'body-m'` lookup.
  // `null` outside the band, or when the row isn't in `ctx.slabs` this frame
  // (e.g. frustum-culled despite the distance band).
  const sgrAStarBodySlab = bandActive
    ? (ctx.slabs.find(
        (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id,
      )?.index ?? null)
    : null;
  const bandJustEngaged = bandActive && !captureRuntime.wasBandActive;
  // Every captured face's content (which galaxies/stars are visible, their
  // backdrop-fade alpha) is keyed on the PLAYER's camera position, not the
  // fixed capture eye at Sgr A* — so a big enough move stales every face at
  // once, same as band entry.
  const cameraMovedBeyondThreshold =
    captureRuntime.lastSweepCamPosMpc !== null &&
    distanceMpc(ctx.drawCamPos, captureRuntime.lastSweepCamPosMpc) >
      SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_MPC;
  const skyCubemapFacesToCapture: readonly CubeFace[] = bandActive
    ? skyCubemapCaptureSchedule({
        bandJustEngaged,
        frameIndex: captureRuntime.frameIndex,
        lastCapturedAtMs: captureRuntime.lastCapturedAtMs,
        nowMs: ctx.nowMs,
        cameraMovedBeyondThreshold,
      }).facesToCapture
    : [];
  for (const face of skyCubemapFacesToCapture) {
    captureRuntime.lastCapturedAtMs.set(face, ctx.nowMs);
  }
  if (bandJustEngaged || cameraMovedBeyondThreshold) {
    captureRuntime.lastSweepCamPosMpc = ctx.drawCamPos;
  }
  captureRuntime.wasBandActive = bandActive;
  captureRuntime.frameIndex += 1;

  // The runtime hand-off (Task 12's brief, "Name the runtime hand-off"):
  // `frameProgram` only knows WHICH faces to capture (static data); resolving
  // each face's own synthetic camera is `renderFrame`'s job, done fresh every
  // frame since the schedule's face LIST can change frame to frame.
  // `faceSizePx` reads the sky-cubemap row's own declared size rather than a
  // hard-coded constant, so the two can never drift. A face whose context
  // comes back null (pre-bootstrap) is simply omitted — `executeFrame` treats
  // a missing map entry as "skip this step cleanly" (see its module header).
  const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>();
  if (skyCubemapFacesToCapture.length > 0) {
    const faceSizePx = ctx.renderTargets.specOf('sky-cubemap').fixedSizePx!.size;
    for (const face of skyCubemapFacesToCapture) {
      const faceCtx = skyCubemapFaceContext({
        state,
        eyeMpc: SGR_A_STAR_ANCHOR.positionMpc,
        face,
        faceSizePx,
      });
      if (faceCtx !== null) skyCubemapFaceContexts.set(face, faceCtx);
    }
  }

  executeFrame({
    encoder,
    ctx,
    state,
    program: frameProgram(
      {
        exposure: state.settings.tonemap.exposure,
        curve: state.settings.tonemap.curve,
        hdrKnee: hdrOn ? state.settings.hdr.knee : 0,
        hdrHeadroom: hdrOn ? state.settings.hdr.headroom : 0,
      },
      // The master bloom toggle is the ONLY bloom value that shapes the step
      // list; strength/threshold are read live by the bloom layers each draw.
      state.settings.bloom.enabled,
      // Painter-ordered NEAR0 + body-row indices (Task 4) — the chain the
      // foreground:0 render expands into, one step per entry.
      foregroundChainOrder(ctx.slabs),
      skyCubemapFacesToCapture,
      sgrAStarBodySlab === null ? [] : [sgrAStarBodySlab],
    ),
    layers: CONTENT_LAYERS,
    strategy,
    timing: timingService,
    swapView,
    skyCubemapFaceContexts,
  });
  timingService.endFrame(timingCtx, encoder);

  device.queue.submit([encoder.finish()]);
}
