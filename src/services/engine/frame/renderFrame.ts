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
 * computes is recomputed each frame. It DOES read/write one Resource,
 * `state.cameraRuntime.skyCubemapCapture` (the black-hole lens's amortized
 * sky-capture bookkeeping), the same amortized-Resources shape
 * `cameraRuntime`'s other fields already carry. A free function taking a
 * struct of inputs bounds the encoder lifetime to the function body.
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
import { skyCubemapNeedsBake } from './skyCubemapNeedsBake';
import { skyCubemapFaceContext } from './skyCubemapFaceContext';
import { sceneBodyStates } from './sceneBodyStates';
import { regionById } from '../../../utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';

// Hoisted rather than resolved per frame (a linear `.find` over `BODY_REGIONS`),
// matching the other two consumers of the same lookup — `sgrAStarLensingLayer`
// and `bodyGlintsLayer`.
const GALACTIC_CENTRE_REGION = regionById('galactic-centre');

const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

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

  // The black-hole lens's sky-cubemap bake. The band keys on the CAMERA's
  // distance from the galactic-centre anchor, the same quantity + region
  // every `sgrAStarLensing`-band consumer reads. The bookkeeping lives on
  // `cameraRuntime` — see `SkyCubemapCaptureRuntime`.
  const captureRuntime = state.cameraRuntime.skyCubemapCapture;
  const gcDistanceMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    GALACTIC_CENTRE_REGION,
    sceneBodyStates(state, ctx),
  );
  // Recorded unconditionally (not just while the band is active) — the
  // `sky-cubemap` row's release-margin check needs the distance on the very
  // frame the band closes, not one frame later.
  captureRuntime.gcDistanceMpc = gcDistanceMpc;
  const bandActive = fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, gcDistanceMpc) > 0;

  // The `sky-cubemap` row's 50 MB exists only while the band does (its
  // `allocateWhen`, renderTargets.ts). `runFrame`'s per-frame `reconcile`
  // runs BEFORE this frame's camera pose is produced, so it cannot see the
  // band open; the edge reconciles here instead. `bakedFrom` is `null`
  // whenever the band is inactive (seeded null, reset null on close below),
  // so the band-entry frame is always the frame `skyCubemapNeedsBake` finds
  // nothing baked and sweeps all six faces — it needs the row to already
  // exist.
  if (bandActive !== captureRuntime.bandActive) {
    captureRuntime.bandActive = bandActive;
    ctx.renderTargets.reconcile(state, ctx.canvasSize);
    if (!bandActive) captureRuntime.bakedFrom = null;
  }

  // The captured "sky" is kpc away and static: a 1024² face covers 90°, so
  // one texel is ~1.5 mrad, and shifting content at 8 kpc by a texel needs
  // ~12 pc of camera travel — the whole lens band is 500 AU. One bake is
  // texel-exact for the entire band; the lens shader already samples the
  // cubemap as at-infinity, so there is no pinned-eye tracking to do. A
  // re-bake fires only when the roster's inputs actually change (settings,
  // selection, tier, the row's allocated size, or a fade ramp in flight).
  const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>();
  let skyCubemapFacesToCapture: readonly CubeFace[] = [];
  // Sgr A*'s own body-m slab row this frame: `frameProgram` emits the
  // (hdr, BODY[k]) lens step off it. Resolved here, not in `frameProgram`,
  // because the row's painter-order index comes from `deriveSlabs` (computed
  // upstream of this function) — the same "resolve here, hand data down"
  // split `earthSlab` in `runFrame.ts` already follows for the identical
  // `frame.kind === 'body-m'` lookup. Stays `null` when the row isn't in
  // `ctx.slabs` this frame (e.g. frustum-culled despite the distance band).
  let sgrAStarBodySlab: number | null = null;
  if (bandActive) {
    sgrAStarBodySlab =
      ctx.slabs.find((slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id)
        ?.index ?? null;

    const faceSizePx = ctx.renderTargets.sizeOf('sky-cubemap').width;
    const bakeKey = {
      settings: state.settings,
      selection: state.selection,
      tier: state.tier,
      faceSizePx,
      // Two roster inputs move without a settings write: a source-visibility
      // ramp (settings write fires once, at the ramp's START), and a
      // famous-galaxy thumbnail's atlas upload + 400 ms load fade (arrives
      // async, after the ramp has already settled). Either forces a re-bake
      // every frame it runs, plus one final settled bake.
      rosterSettling:
        state.subsystems.fades.isAnyAnimating(ctx.nowMs) ||
        (state.subsystems.texturedDisks?.hasInFlightWork() ?? false),
    };
    if (skyCubemapNeedsBake(captureRuntime.bakedFrom, bakeKey)) {
      for (const face of ALL_CUBE_FACES) {
        const faceCtx = skyCubemapFaceContext({
          state,
          eyeMpc: ctx.drawCamPos,
          face,
          faceSizePx,
          nowMs: ctx.nowMs,
        });
        if (faceCtx !== null) skyCubemapFaceContexts.set(face, faceCtx);
      }
      // Pre-bootstrap: a face's context can come back null before the first
      // real camera pose exists. Leave `bakedFrom` untouched so the next
      // frame retries the full sweep rather than caching a partial bake.
      if (skyCubemapFaceContexts.size === ALL_CUBE_FACES.length) {
        skyCubemapFacesToCapture = ALL_CUBE_FACES;
        captureRuntime.bakedFrom = bakeKey;
      }
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
      // Painter-ordered NEAR0 + body-row indices — the chain the
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
