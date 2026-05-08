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
 *   7. `postProcess.draw(...)` (HDR → swap chain tone-map blit)
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
 *   pass 1: HDR render pass (colour-only — no depth attachment;
 *     every overlay is emissive + additive so ordering is moot)
 *     - clear postProcess.view to (0, 0, 0, 1)
 *     - pointRenderer.draw  (instanced billboards, additive)
 *     - thumbnails.runFrame (quad + disk passes, additive; gated on
 *       galaxyTexturesEnabled inside the subsystem caller)
 *     - filamentRenderer.draw (cosmic-web skeleton overlay, additive;
 *       gated on the user's "Filaments" toggle AND the renderer being
 *       non-null — `filaments.bin` is an optional asset).  Drawn AFTER
 *       thumbnails so the skeleton sits on top of the per-galaxy
 *       overlays it threads between, and BEFORE the Milky Way so the
 *       bright impostor at the world origin still feels like the
 *       dominant local backdrop instead of an underlay punched through
 *       by glowing lines.
 *     - milkyWayRenderer.draw (procedural impostor, additive; gated
 *       on the user's "Show Milky Way" toggle and the distance-fade
 *       threshold).  Drawn LAST so the deterministic crossfade between
 *       the impostor and the per-galaxy overlays composes the same
 *       way every frame even though additive blending makes the
 *       per-fragment colour value order-independent.
 *     - pass.end()
 *
 *   pass 2: tone-map post-process
 *     - sample the HDR target, write to swap chain
 *     - applies the user's `toneMapCurve` and `exposure` uniforms
 *     - is called via `postProcess.draw`, which begins+ends its own
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
import type { OrbitCamera, PointCloud } from '../../../@types';
import type { Source } from '../../../data/sources';
import type { BiasMode } from '../../../data/biasMode';
import type { ToneMapCurve } from '../../../data/toneMapCurve';
import type { PointRenderer } from '../../gpu/renderers/pointRenderer';
import type { PostProcess } from '../../gpu/passes/postProcess';
import type { QuadRenderer } from '../../gpu/renderers/quadRenderer';
import type { DiskRenderer } from '../../gpu/renderers/diskRenderer';
import type { MilkyWayRenderer } from '../../gpu/renderers/milkyWayRenderer';
import type { FilamentRenderer } from '../../gpu/renderers/filamentRenderer';
import type { ThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
import type { FamousMetaEntry, FamousXrefMap } from '../../loading/fetchers/famousMetaFetcher';
import { milkyWayFadeAlpha } from '../../../utils/math/milkyWayFade';

/**
 * Settings consumed by `pointRenderer.draw` and `postProcess.draw`.
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
   * Selected galaxy's `(source, localIdx)` pair, or `null` when nothing
   * is selected.  Translated inside `renderFrame` to the packed u32
   * `(source << 27) | localIdx` (or the `0xFFFFFFFF` "no selection"
   * sentinel) the shader's halo path expects, so the caller doesn't
   * have to remember the encoding.
   */
  selected: { source: Source; localIdx: number } | null;
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
  /**
   * Whether to draw the cosmic-web filament-skeleton overlay (output of
   * the optional `npm run build-filaments` pipeline; see
   * `services/gpu/filamentRenderer.ts`).  Default OFF — opt-in feature
   * since the binary is not always present.  When true but the
   * renderer has no instance buffer (binary missing or still loading),
   * the call is a cheap no-op.
   */
  filamentsEnabled: boolean;
  /**
   * Multiplicative intensity scale for the filament overlay, in [0, 1].
   * Multiplied into the fragment-stage's final pre-multiplied alpha so
   * the user can dim the cosmic-web skeleton against the bright HDR
   * catalogue when high-σ datasets (longer, denser ridges) saturate
   * to flat white under the tone-mapped pass.  1.0 = full strength;
   * 0.0 = invisible (logically equivalent to filamentsEnabled=false).
   */
  filamentIntensity: number;
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
  /**
   * Combined HDR offscreen target + tone-map post-process.  This module
   * reads `postProcess.view` for the HDR pass's colour attachment and
   * calls `postProcess.draw(...)` for the fullscreen blit at the end
   * of the frame.  See `services/gpu/postProcess.ts` for the merge
   * rationale.
   */
  postProcess: PostProcess;
  pointRenderer: PointRenderer;
  milkyWayRenderer: MilkyWayRenderer;
  /**
   * Optional cosmic-web filament-skeleton renderer.  Null when the
   * GPU init flow hasn't created it yet, or — by design — when the
   * deployment doesn't ship a `filaments.bin`.  The HDR-pass draw site
   * gates on both this being non-null AND `settings.filamentsEnabled`,
   * so a missing renderer is silently a no-op.
   */
  filamentRenderer: FilamentRenderer | null;
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
    postProcess,
    pointRenderer,
    milkyWayRenderer,
    filamentRenderer,
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
  //
  // No depth attachment: every pipeline drawing into this pass uses
  // pure additive blending (`srcFactor: 'one', dstFactor: 'one'`) with
  // `depthWriteEnabled: false`, so per-fragment colour is order-
  // independent (A+B = B+A).  See `services/gpu/postProcess.ts` for
  // the history (a depth attachment was tried in commit 716eb6b and
  // superseded by 28aced5).
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  // ── Point sprites (instanced billboards) ───────────────────────────
  //
  // Pack the `(source, localIdx)` selection into the u32 the shader
  // compares against per-vertex `(sourceCode << 27u) | instance_index`.
  // Sentinel `0xffffffff` means "nothing selected" — the max u32 value,
  // outside any realistic packed identity range (top 5 bits = 31, which
  // we don't currently allocate to any survey).  The caller passes
  // `null` when nothing is selected and we translate here so settings
  // stay in plain TS-land (structured shape) and the GPU side sees a
  // single u32.
  const selectedPacked =
    settings.selected !== null
      ? ((settings.selected.source << 27) | settings.selected.localIdx) >>> 0
      : 0xffffffff >>> 0;
  pointRenderer.draw(
    pass,
    viewProj,
    [canvasWidth, canvasHeight],
    settings.pointSizePx,
    settings.brightness,
    selectedPacked,
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

  // ── Filament-skeleton overlay (cosmic-web cartography) ────────────
  //
  // Draws into the SAME HDR pass as points/thumbnails so the additive
  // contribution accumulates in float-precision before tone mapping.
  // No depth attachment in this pass (mirrors the point/quad/disk
  // convention; commit d69ab75 removed the experimental depth target
  // since every HDR pipeline now uses pure additive blend).  Cheap to
  // skip when toggled off — a single null check + boolean test.
  //
  // ### Why between thumbnails and Milky Way?
  //
  // The plan called for "after thumbnails, before milky way" and that
  // ordering was preserved here.  The rationale: the filament skeleton
  // is a *local-universe overlay* threaded between the galaxies it was
  // computed from, so it belongs visually on top of the per-galaxy
  // billboards + thumbnails.  But the Milky Way impostor at the world
  // origin is a *bright foreground feature* — drawing it last keeps
  // its bulge from being veiled by overlapping filament strands when
  // the camera sits inside the local supercluster.  Additive blending
  // makes per-fragment colour mathematically order-independent, so
  // this ordering is purely a "deterministic encoder record" decision
  // (HMR-stable, easy to reason about), not a correctness one.
  if (settings.filamentsEnabled && filamentRenderer) {
    filamentRenderer.draw(
      pass,
      viewProj,
      [canvasWidth, canvasHeight],
      // 1.5 → 3-px-thick lines at the screen-space halfwidth the
      // shader expands.  Empirically pleasant — fine enough to feel
      // like a wireframe, thick enough to read against dense fields.
      1.5,
      settings.filamentIntensity,
    );
  }

  // ── Milky Way impostor (procedural backdrop at world origin) ──────
  //
  // Drawn LAST inside the HDR pass.  All HDR pipelines now use pure
  // additive blending, so per-fragment colour is mathematically
  // order-independent — but the deterministic draw order (points →
  // thumbnails → milky way) is still meaningful: it keeps the
  // crossfade composition between the procedural impostor and the
  // per-galaxy overlays bit-stable across frames, makes the encoder
  // record reproducible across HMR reloads, and matches the
  // conceptual layering "background atlas → cluster overlays".
  //
  // The pass is skipped entirely when:
  //   - the user has toggled "Show Milky Way" off, or
  //   - the camera is far enough from the world origin that the
  //     distance fade has fully attenuated alpha to zero.
  // Both are CPU branches; neither costs GPU time when the gate is
  // closed.  See `utils/math/milkyWayFade.ts` for the band.
  if (settings.milkyWayEnabled) {
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc);
    if (fadeAlpha > 0) {
      milkyWayRenderer.draw(
        pass,
        viewProj as Float32Array,
        [canvasWidth, canvasHeight],
        fadeAlpha,
        milkyWayITimeSec,
        // World-space camera position drives both the impostor's
        // view-aligned billboard basis (vertex stage) and the
        // fragment stage's synthetic-camera ray origin — the
        // raymarched spiral now follows the user's orbit instead of
        // showing the same hard-coded vantage every frame.
        [drawCamPos[0], drawCamPos[1], drawCamPos[2]],
      );
    }
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
  //
  // Post-Phase-4 the HDR view is owned by `postProcess` itself rather
  // than being passed in alongside the swap view; the aggregate knows
  // its own view, which prevents a stale-after-resize view from
  // sneaking in via this callsite.
  postProcess.draw(
    encoder,
    context.getCurrentTexture().createView(),
    settings.exposure,
    settings.toneMapCurve,
  );

  // Seal the command buffer and send it to the GPU.
  device.queue.submit([encoder.finish()]);
}
