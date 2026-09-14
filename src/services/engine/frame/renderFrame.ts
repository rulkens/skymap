/**
 * renderFrame — the per-frame WebGPU command-encoder lifecycle: the
 * once-per-frame focus-uniform write, encoder create + swap-view acquire +
 * submit, the timing frame window, and the lens capture's cross-frame
 * bookkeeping on `state.cubemapCaptures`.
 *
 * Order of operations is DATA (`FRAME_ORDER`, expanded by `expandFrameOrder`)
 * walked by `executeFrame`, so this module knows no individual pass; the
 * strategy fork, the first-touch clear and per-step slab resolution live
 * there. The pick-debug overlay, the render-on-demand decision and camera
 * mutation stay in `runFrame`.
 */

import type { RenderFrameInput } from '../../../@types/engine/frame/RenderFrameInput';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { executeFrame } from './executeFrame';
import { expandFrameOrder } from './expandFrameOrder';
import { FRAME_ORDER } from './frameOrder';
import { resolveStrategy } from './resolveStrategy';
import { foregroundChainOrder } from './slabs';
import { CONTENT_PASSES } from './passes';
import { hdrActiveOf } from '../../../utils/gpu/hdrActiveOf';
import { skyCubemapFaceContext } from './skyCubemapFaceContext';
import { sceneBodyStates } from './sceneBodyStates';
import { lensBodySlabs } from './lensBodySlabs';
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { fadeBand } from '../../../utils/math/fadeBand';
import { ALL_CUBE_FACES, CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';

/**
 * Encode and submit one frame. Synchronous: by the time it returns, the GPU
 * has the buffer queued. Order of operations is `FRAME_ORDER`'s expansion,
 * walked by `executeFrame`; the visual output is identical to the
 * pre-unification inline body.
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
  // distance from the row's anchor, the same quantity + region every
  // `sgrAStarLensing`-band consumer reads. See `CubemapCaptureRuntime`.
  const capture = CUBEMAP_CAPTURES.sgrAStar;
  const captureRuntime = state.cubemapCaptures.get('sgrAStar')!;
  const anchorDistanceMpc = regionRelativeDistanceMpc(
    ctx.drawCamPos,
    capture.anchor,
    sceneBodyStates(state, ctx),
  );
  // Recorded unconditionally (not just while the band is active) — the
  // `sky-cubemap` row's release-margin check needs the distance on the very
  // frame the band closes, not one frame later.
  captureRuntime.lastAnchorDistanceMpc = anchorDistanceMpc;
  const bandActive = fadeBand(capture.band, anchorDistanceMpc) > 0;

  // The `sky-cubemap` row's 50 MB exists only while the band does (its
  // `allocateWhen`, renderTargets.ts). `runFrame`'s per-frame `reconcile`
  // runs BEFORE this frame's camera pose is produced, so it cannot see the
  // band open; the edge reconciles here instead. `bakedSettings` is `null`
  // whenever the band is inactive (seeded null, reset null on close below),
  // so the band-entry frame always finds nothing baked and sweeps all six
  // faces — it needs the row to already exist.
  if (bandActive !== captureRuntime.lastBandActive) {
    captureRuntime.lastBandActive = bandActive;
    ctx.renderTargets.reconcile(state, ctx.canvasSize);
    if (!bandActive) captureRuntime.bakedSettings = null;
  }

  // The captured "sky" is kpc away and static: a 1024² face covers 90°, so
  // one texel is ~1.5 mrad, and shifting content at 8 kpc by a texel needs
  // ~12 pc of camera travel — the whole lens band is 500 AU. One bake is
  // texel-exact for the entire band; the lens shader already samples the
  // cubemap as at-infinity, so there is no pinned-eye tracking to do.
  //
  // A settings-reference change re-bakes. Dropped from the key on purpose:
  // `tier` — a tier swap dissolves through `fades.fadeTo` (`dissolveCatalogBuffer.ts`),
  // so `rosterSettling` already catches it; `faceSizePx` — the resolution
  // knob is a settings write, and `reconcile` (above) reallocates the row
  // earlier in the same `runFrame`, so the settings-ref bake lands in the
  // new texture; `selection` — a stale selection halo in the lensed sky is
  // accepted.
  const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>();
  let skyCubemapFacesToCapture: readonly CubeFace[] = [];
  if (bandActive) {
    // Two roster inputs move without a settings write: a source-visibility
    // ramp (settings write fires once, at the ramp's START), and a
    // famous-galaxy thumbnail's atlas upload + 400 ms load fade (arrives
    // async, after the ramp has already settled).
    const rosterSettling =
      state.subsystems.fades.isAnyAnimating(ctx.nowMs) ||
      (state.subsystems.texturedDisks?.hasInFlightWork() ?? false);
    if (rosterSettling || captureRuntime.bakedSettings !== state.settings) {
      const faceSizePx = ctx.renderTargets.sizeOf('sky-cubemap').width;
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
      // real camera pose exists. Leave `bakedSettings` untouched so the next
      // frame retries the full sweep rather than caching a partial bake.
      if (skyCubemapFaceContexts.size === ALL_CUBE_FACES.length) {
        skyCubemapFacesToCapture = ALL_CUBE_FACES;
        // Recorded only for a settled bake: while the roster is still moving,
        // null keeps the next frame baking, and the first settled frame
        // bakes once more.
        captureRuntime.bakedSettings = rosterSettling ? null : state.settings;
      }
    }
  }

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
      skyCubemapFacesToCapture,
      lensBodySlabs: lensBodySlabs(state, ctx),
    }),
    strategy,
    timing: timingService,
    swapView,
    skyCubemapFaceContexts,
  });
  timingService.endFrame(timingCtx, encoder);

  device.queue.submit([encoder.finish()]);
}
