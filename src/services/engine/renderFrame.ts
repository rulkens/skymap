/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`:
 *
 *   1. `createCommandEncoder()`
 *   2. `beginRenderPass()` against the HDR offscreen target
 *   3. compute `pxPerRad` + `camPos` snapshot
 *   4. `pointRenderer.draw(...)` (17 args)
 *   5. `thumbnails.runFrame(...)` (10 fields)
 *   6. `pass.end()`
 *   7. `toneMapPass.draw(...)` (HDR → swap chain)
 *   8. `device.queue.submit([encoder.finish()])`
 *
 * That whole block reads the engine's per-frame closure state but
 * doesn't *write* anything of its own — it's pure GPU dispatch.
 * Pulling it into a single function lets `frame()` focus on what's
 * left: camera-state management, auto-LOD mask refresh, hover-pick
 * readback, and render-on-demand scheduling.
 *
 * ### Why pass an explicit input bag instead of capturing closure?
 *
 * The thumbnail and SpaceMouse subsystems use the closure-returning-
 * factory pattern because they own *internal state* across frames
 * (atlas, queue, dt baselines, axes cache).  This module owns no
 * cross-frame state — every variable it reads is recomputed each
 * frame from the engine's current camera + settings.  A free function
 * that takes a struct of inputs is a better fit:
 *
 *   - Trivially testable.  A unit test constructs a fixture once and
 *     calls `renderFrame(input)` with stub renderers; it doesn't have
 *     to instantiate a stateful subsystem first.
 *   - Encoder lifetime is bounded.  The encoder is created and finished
 *     inside this function — no caller can leak a half-encoded
 *     reference back to the engine.
 *
 * ### What the encoder records, in order
 *
 *   pass 1: HDR render pass
 *     - clear hdrTargetView to (0, 0, 0, 1)
 *     - pointRenderer.draw  (instanced billboards)
 *     - thumbnails.runFrame (quad + disk passes — gated on
 *       galaxyTexturesEnabled inside the subsystem caller; this
 *       function calls runFrame unconditionally because the gate is
 *       a per-call decision the engine makes by passing or omitting
 *       the subsystem reference — see the engine call site)
 *     - pass.end()
 *
 *   pass 2: tone-map post-process
 *     - sample hdrTargetView, write to swap chain
 *     - applies the user's `toneMapCurve` and `exposure` uniforms
 *     - is called via `toneMapPass.draw`, which begins+ends its own
 *       internal render pass on the same encoder
 *
 *   submit: device.queue.submit([encoder.finish()])
 *
 * The two passes share an encoder so the GPU sees them in deterministic
 * order — critical because the tone-map pass reads the texture the
 * HDR pass wrote.  Splitting into two encoders + two submits would
 * still work via the queue ordering guarantee, but it's strictly
 * extra overhead.
 *
 * ### What stays in `frame()` (NOT here)
 *
 *   - Auto-LOD mask refresh (mutates engine state + fires a callback).
 *   - Hover pick readback (mutates `hoveredIndex` + queues another GPU
 *     submit on its own — the pick renderer encodes its own commands).
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, SpaceMouse apply,
 *     auto-rotate yaw bump).
 *
 * If you find yourself wanting to read engine closure state from
 * inside this module, that's a sign the field should be added to
 * `RenderFrameInput` (or the work belongs in `frame()`).
 */

import type { mat4 } from 'gl-matrix';
import type { OrbitCamera, PointCloud } from '../../@types';
import type { Source } from '../../data/sources';
import type { BiasMode } from '../../data/biasMode';
import type { ToneMapCurve } from '../../data/toneMapCurve';
import type { PointRenderer } from '../gpu/pointRenderer';
import type { ToneMapPass } from '../gpu/toneMapPass';
import type { QuadRenderer } from '../gpu/quadRenderer';
import type { DiskRenderer } from '../gpu/diskRenderer';
import type { MilkyWayRenderer } from '../gpu/milkyWayRenderer';
import type { ThumbnailSubsystem } from './thumbnailSubsystem';
import type { FamousMetaEntry, FamousXrefMap } from './famousMetaLoader';
import { milkyWayFadeAlpha } from '../../utils/math/milkyWayFade';

/**
 * Settings consumed by `pointRenderer.draw` and `toneMapPass.draw`.
 *
 * Grouped into a single sub-struct rather than dumped into the top
 * level of `RenderFrameInput` so the caller can pass `{ ...settings }`
 * from a single closure-state snapshot — and so adding a new render-
 * affecting setting in Phase 4 (when the public-handle setter table
 * lands) is a one-line addition here.
 */
export type RenderFrameSettings = {
  pointSizePx: number;
  brightness: number;
  /**
   * Selected galaxy's `globalInstanceIdx` (u32) or `null` when nothing
   * is selected.  We accept `null` here and translate to the sentinel
   * `0xffffffff` inside the function so the caller doesn't have to
   * remember the encoding.
   */
  selectedIndex: number | null;
  visibleSourceMask: number;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  biasMode: BiasMode;
  absMagLimit: number;
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
  depthFadeEnabled: boolean;
  /**
   * Procedural-disk crossfade-OUT thresholds for the points-pass
   * fragment shader (Task 8 of the procedural-disk-impostor plan).
   * Below `pxFadeStartPoints` the points pass renders at full alpha;
   * above `pxFadeEndPoints` it renders at zero alpha (handing off to
   * the procedural-disk pass entirely); inside the band a smoothstep
   * complementary to the disk pass's fade-IN does a continuous
   * crossfade.  Engine should source both from
   * `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` in
   * `./thumbnailSubsystem` so the two passes share a single source
   * of truth.
   */
  pxFadeStartPoints: number;
  pxFadeEndPoints: number;
  exposure: number;
  toneMapCurve: ToneMapCurve;
  /**
   * Whether to invoke the thumbnail subsystem's `runFrame` this tick.
   * Lives in settings (not as a `subsystem | null` parameter) because
   * the engine surfaces it as a user-facing toggle and re-enabling
   * mid-session shouldn't tear down the subsystem.
   */
  galaxyTexturesEnabled: boolean;
  /**
   * Whether to render the procedural Milky Way impostor at the world
   * origin.  See `services/gpu/milkyWayRenderer.ts` for the rationale.
   * When false, the pass is skipped entirely (zero GPU cost beyond a
   * branch in the host CPU code).
   */
  milkyWayEnabled: boolean;
};

/**
 * Per-frame inputs.  Every field is read; nothing is mutated.  The
 * encoder is created and finished inside this function so no GPU
 * lifecycle leaks back to the caller.
 */
export type RenderFrameInput = {
  // ── Camera + viewport ─────────────────────────────────────────────────
  cam: OrbitCamera;
  canvasWidth: number;
  canvasHeight: number;
  viewProj: mat4;
  /**
   * Animation time in seconds for the Milky Way impostor, already
   * scaled by the engine's chosen "slow but alive" factor (0.25× wall
   * clock).  See `engine.ts` for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;

  // ── GPU handles ───────────────────────────────────────────────────────
  device: GPUDevice;
  context: GPUCanvasContext;
  hdrTargetView: GPUTextureView;
  pointRenderer: PointRenderer;
  milkyWayRenderer: MilkyWayRenderer;
  toneMapPass: ToneMapPass;
  thumbnails: ThumbnailSubsystem;
  /**
   * QuadRenderer + DiskRenderer references forwarded straight to the
   * thumbnail subsystem.  The subsystem already `bindAtlas`-bound them
   * at engine-startup; the per-frame `runFrame` input still takes them
   * as explicit fields (legacy of the pre-extraction inline body) so
   * we forward them unchanged.  See thumbnailSubsystem.runFrame.
   */
  quadRenderer: QuadRenderer;
  diskRenderer: DiskRenderer;

  // ── Settings ──────────────────────────────────────────────────────────
  settings: RenderFrameSettings;

  // ── Forwarded to the thumbnail subsystem ──────────────────────────────
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  clouds: Map<Source, PointCloud>;
};

/**
 * Encode and submit one frame's worth of HDR + tone-map work.
 *
 * The function is synchronous: it builds the command encoder,
 * dispatches the HDR pass, runs the tone-map post-process, and submits
 * the buffer.  No part of the encoder lifecycle escapes — by the time
 * `renderFrame` returns, the GPU has the buffer queued.
 *
 * Order of operations matches the pre-extraction inline body byte-for-
 * byte; the visual output is identical.
 */
export function renderFrame(input: RenderFrameInput): void {
  const {
    cam,
    canvasWidth,
    canvasHeight,
    viewProj,
    milkyWayITimeSec,
    device,
    context,
    hdrTargetView,
    pointRenderer,
    milkyWayRenderer,
    toneMapPass,
    thumbnails,
    quadRenderer,
    diskRenderer,
    settings,
    famousMeta,
    famousXrefs,
    clouds,
  } = input;

  // ── Per-frame uniform-pack inputs ──────────────────────────────────
  //
  // pxPerRad = viewport.height / (2 · tan(fovY/2)) — the standard
  // pinhole conversion from radians to screen pixels.  Pre-computed on
  // the CPU because `tan` is one of the more expensive shader
  // intrinsics on mobile GPUs and the value is frame-constant.
  //
  // We also share this scalar with the thumbnail subsystem (instead of
  // letting it recompute internally) so both passes use a bit-identical
  // pxPerRad — small but non-zero shader divergence otherwise.
  const drawPxPerRad = canvasHeight / (2 * Math.tan(cam.fovYRad / 2));

  // Snapshot the camera position into a plain readonly tuple.  The
  // OrbitCamera's `position` is a gl-matrix vec3 (Float32Array); copying
  // to a fixed-length tuple avoids accidental mutation downstream and
  // matches the shape both `pointRenderer.draw` and
  // `thumbnails.runFrame` expect.
  const drawCamPos: Readonly<[number, number, number]> = [
    cam.position[0]!,
    cam.position[1]!,
    cam.position[2]!,
  ];

  // ── Encoder + HDR render pass ──────────────────────────────────────
  const encoder = device.createCommandEncoder();

  // Clear colour is pure black (0, 0, 0).
  // Additive blending starting from black gives the maximum dynamic
  // range — dense overlap regions bloom bright.
  //
  // The colour attachment is the HDR rgba16float offscreen target,
  // NOT the swap chain.  Every visible pass below (points, quads,
  // disks) accumulates into this float buffer; the swap chain is
  // written exactly once at the end of the frame by the tone-map
  // pass.  Without HDR + tone-map, additive overlap >1.0 just clips
  // and cluster cores blow out to flat white.
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: hdrTargetView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  // ── Milky Way impostor (procedural backdrop at world origin) ──────
  //
  // Drawn before the points pass so per-galaxy point billboards
  // overdraw the impostor where they overlap (an SDSS row at the
  // dead centre would compete; in practice there isn't one, but the
  // ordering is the principled choice regardless).  The pass is
  // skipped entirely when:
  //
  //   - the user has toggled "Show Milky Way" off, or
  //   - the camera is far enough from the world origin that the
  //     distance fade has fully attenuated alpha to zero.
  //
  // Both are CPU branches; neither costs GPU time when the gate is
  // closed.  See `utils/math/milkyWayFade.ts` for the band.
  if (settings.milkyWayEnabled) {
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc);
    if (fadeAlpha > 0) {
      milkyWayRenderer.draw(
        pass,
        // viewProj is uploaded for ABI symmetry only; the impostor's
        // vertex stage emits clip-space directly without sampling it.
        viewProj as Float32Array,
        [canvasWidth, canvasHeight],
        fadeAlpha,
        milkyWayITimeSec,
      );
    }
  }

  // ── Point sprites (instanced billboards) ───────────────────────────
  //
  // selectedIndex sentinel: 0xffffffff is "nothing selected" — the max
  // u32 value, which can never match a real point index.  The caller
  // passes `null` when nothing is selected and we translate here so
  // settings stay in plain TS-land (null vs. number) and the GPU side
  // sees a single u32.
  pointRenderer.draw(
    pass,
    viewProj,
    [canvasWidth, canvasHeight],
    settings.pointSizePx,
    settings.brightness,
    settings.selectedIndex !== null ? settings.selectedIndex : 0xffffffff >>> 0,
    settings.visibleSourceMask,
    drawCamPos,
    drawPxPerRad,
    settings.highlightFallback,
    settings.realOnlyMode,
    settings.biasMode,
    settings.absMagLimit,
    settings.apparentMagLimit,
    settings.schechterMStar,
    settings.schechterAlpha,
    settings.depthFadeEnabled,
    // Task 8 (procedural-disk-impostor): the points-pass fragment
    // fades alpha to zero across this same apparent-pixel-size band
    // that the procedural-disk pass fades IN over.  Both thresholds
    // come from `./thumbnailSubsystem`'s exported constants — single
    // source of truth shared between the two passes so they can never
    // drift apart and re-introduce the double-bright donut artefact.
    settings.pxFadeStartPoints,
    settings.pxFadeEndPoints,
  );

  // ── Galaxy thumbnail pass ──────────────────────────────────────────
  //
  // Gated on `galaxyTexturesEnabled` so users who disable thumbnails
  // pay nothing per frame.  The subsystem owns its own bitmap-fetch /
  // atlas-LRU / back-to-front-sort logic; we just hand it the
  // per-frame inputs the loop reads.
  //
  // Note: the subsystem's `bound` flag guards against a runFrame call
  // before `bindToRenderers`, so even if a future engine re-orders
  // initialisation this stays safe.
  if (settings.galaxyTexturesEnabled) {
    thumbnails.runFrame({
      cam,
      clouds,
      visibleSourceMask: settings.visibleSourceMask,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      pass,
      viewProj,
      pxPerRad: drawPxPerRad,
      camPos: drawCamPos,
      quadRenderer,
      diskRenderer,
      famousMeta,
      famousXrefs,
    });
  }

  pass.end();

  // ── HDR → swap chain tone-map ──────────────────────────────────────
  //
  // After every additive contribution has been accumulated into the
  // HDR target, run the fullscreen tone-map post-process to compress
  // the linear-light values into the swap chain's displayable range.
  // Both passes are encoded into the same `encoder`, so the GPU sees:
  //
  //   1. clear+draw into hdrTarget (points/quads/disks)
  //   2. fullscreen blit hdrTarget → swap chain (tone-map)
  //
  // Switching `toneMapCurve` between Linear / Reinhard / Asinh /
  // Gamma 2 / ACES is a single 4-byte uniform write inside the pass
  // — no pipeline rebuild, instant visual A/B.
  toneMapPass.draw(
    encoder,
    context.getCurrentTexture().createView(),
    hdrTargetView,
    settings.exposure,
    settings.toneMapCurve,
  );

  // Seal the command buffer and send it to the GPU.
  device.queue.submit([encoder.finish()]);
}
