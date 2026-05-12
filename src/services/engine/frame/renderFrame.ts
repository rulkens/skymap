/**
 * renderFrame — owns the per-frame WebGPU command-encoder lifecycle.
 *
 * Before this module existed, ~140 lines of imperative GPU plumbing
 * sprawled inside `engine.ts`'s `frame()`.  D.1 (`FrameContext`) cut
 * the ad-hoc snapshot work; D.2 (this commit) cuts the inline draw
 * blocks.  What remains in this file is the encoder lifecycle plus
 * the registry loop:
 *
 *   1. `createCommandEncoder()`
 *   2. `beginRenderPass()` against the HDR offscreen target
 *   3. `for (const pass of HDR_PASSES) if (pass.enabled(...)) pass.draw(...)`
 *   4. `pass.end()`
 *   5. `postProcess.draw(...)` (HDR → swap chain tone-map blit)
 *   6. `device.queue.submit([encoder.finish()])`
 *
 * Each entry in `HDR_PASSES` is a `Pass` const declared in its own
 * file under `passes/`.  See `passes/types.ts` for the interface
 * contract and `passes/index.ts` for the canonical draw order.
 *
 * ### Why pass an explicit input bag instead of capturing closure?
 *
 * Same rationale as pre-D.2: this module owns no cross-frame state,
 * every variable it reads is recomputed each frame.  A free function
 * taking a struct of inputs is trivially testable and bounds the
 * encoder lifetime to the function body.
 *
 * ### What the encoder records, in order
 *
 *   pass 1: HDR render pass (colour-only, additive blending)
 *     - clear postProcess.view to (0, 0, 0, 1)
 *     - HDR_PASSES[0..3] dispatched in array order; each gates
 *       itself via `enabled(...)`.  See `passes/index.ts` for the
 *       canonical order rationale.
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
 * HDR pass wrote.
 *
 * ### Why tone-map isn't in `HDR_PASSES`
 *
 * Tone-map runs OUTSIDE the HDR `beginRenderPass` block: it samples
 * the HDR offscreen target the four HDR passes accumulated into and
 * blits to the swap chain.  Modelling it as a `Pass` would force a
 * divergent signature (encoder vs. pass-encoder) for one inhabitant.
 * The spec D.2 "tone-map special case" section documents the
 * rejected alternatives; the inline-after-loop approach is the
 * lightest shape that keeps `Pass` honest.
 *
 * ### What stays in `runFrame()` (NOT here)
 *
 *   - Auto-LOD mask refresh (mutates engine state + fires a callback).
 *   - Hover pick readback (mutates `hoveredIndex` + queues another GPU
 *     submit on its own — the pick renderer encodes its own commands).
 *   - The render-on-demand scheduler decision.
 *   - Camera state mutation (resize, tween advance, SpaceMouse apply,
 *     auto-rotate yaw bump).
 */

import type { EngineState } from '../../../@types';
import type { PointCloud } from '../../../@types/data/PointCloud';
import type { Source } from '../../../data/sources';
import type { BiasMode } from '../../../data/biasMode';
import type { ToneMapCurve } from '../../../data/toneMapCurve';
import type { ThumbnailRenderer } from '../../gpu/renderers/thumbnailRenderer';
import type { DiskRenderer } from '../../gpu/renderers/diskRenderer';
import type { MilkyWayRenderer } from '../../gpu/renderers/milkyWayRenderer';
import type { FilamentRenderer } from '../../gpu/renderers/filamentRenderer';
import type { ScalarVolumeRenderer } from '../../gpu/renderers/scalarVolumeRenderer';
import type { FamousMetaEntry, FamousXrefMap } from '../../loading/fetchers/famousMetaFetcher';
import type { ReadyFrameContext } from './frameContext';
import type { PassDeps } from './passes/types';
import { HDR_PASSES } from './passes';

/**
 * Settings consumed by the HDR passes and the tone-map post-process.
 *
 * Grouped into a single sub-struct rather than dumped into the top
 * level of `RenderFrameInput` so the caller can pass `{ ...settings }`
 * from a single closure-state snapshot, and so adding a new render-
 * affecting setting is a one-line addition here.
 */
export type RenderFrameSettings = {
  pointSizePx: number;
  brightness: number;
  /**
   * Selected galaxy's `(source, localIdx)` pair, or `null` when nothing
   * is selected.  Translated inside `pointSpritesPass` to the packed u32
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
   * crossfade.  Engine sources both from
   * `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` in
   * `subsystems/thumbnailSubsystem` so the two passes share a single
   * source of truth.
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
  /**
   * Master gate for the 3D scalar-field volume overlay.  When false,
   * `scalarVolumePass.enabled` returns false before consulting the
   * renderer, so no per-field checks or GPU work occurs.  When true,
   * the pass also requires `scalarVolumeRenderer.hasActiveFields()` to
   * be true (at least one registered field is enabled with intensity
   * > 0).  See `scalarVolumePass.ts` and
   * `EngineSettingsState.volumesEnabled` for the full gate rationale.
   */
  volumesEnabled: boolean;
};

/**
 * Per-frame inputs.  Every field is read; nothing is mutated.  The
 * encoder is created and finished inside this function so no GPU
 * lifecycle leaks back to the caller.
 *
 * ### `state` arrived in D.2
 *
 * Pre-D.2, `renderFrame` consumed only the per-frame snapshot
 * (`ctx`) plus settings — engine state was never read directly here.
 * D.2's `Pass.draw` signature accepts `state` so that future passes
 * can read engine-side data (selection, picking, sources) without a
 * `RenderFrameSettings` field for every consumer.  None of today's
 * four passes actually read `state`, but the field is plumbed
 * through so the type system supports passes that need it without
 * a follow-up migration.
 */
export type RenderFrameInput = {
  /**
   * Per-frame derived snapshot.  Carries the camera, view-projection
   * matrix, viewport size, camera-position tuple, pixel-per-radian
   * scalar, plus the post-bootstrap-narrowed `renderer`, `postProcess`,
   * and `thumbnails` handles.  See `frameContext.ts`.
   */
  ctx: ReadyFrameContext;
  /**
   * Engine state — forwarded to each `Pass.draw` so per-pass logic
   * can read selection / picking / source-state without going via
   * settings.  Today's four HDR passes don't read it (they consume
   * settings + ctx + deps); the parameter exists for future passes.
   */
  state: EngineState;
  /**
   * Animation time in seconds for the Milky Way impostor, already
   * scaled by the engine's chosen "slow but alive" factor (0.25× wall
   * clock).  See `engine.ts` for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;

  // ── GPU handles ───────────────────────────────────────────────────────
  device: GPUDevice;
  context: GPUCanvasContext;
  milkyWayRenderer: MilkyWayRenderer;
  /**
   * Optional cosmic-web filament-skeleton renderer.  Null when the
   * GPU init flow hasn't created it yet, or — by design — when the
   * deployment doesn't ship a `filaments.bin`.  `filamentsPass` gates
   * its own draw on this being non-null AND the user toggle being on,
   * so a missing renderer is silently a no-op.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * Optional 3D scalar-field volume renderer.  Null before `initGpu`
   * constructs it (same brief bootstrap window as the other optional
   * renderers).  `scalarVolumePass` optional-chains `hasActiveFields()`
   * so a null handle is silently a no-op — the pass's `enabled`
   * predicate returns false and `draw` is never called.
   */
  scalarVolumeRenderer: ScalarVolumeRenderer | null;
  /**
   * ThumbnailRenderer + DiskRenderer references forwarded straight to the
   * thumbnail subsystem.  The subsystem already `bindAtlas`-bound them
   * at engine-startup; the per-frame `runFrame` input still takes them
   * as explicit fields (legacy of the pre-extraction inline body) so
   * we forward them unchanged.  See thumbnailSubsystem.runFrame.
   */
  thumbnailRenderer: ThumbnailRenderer;
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
 * dispatches every enabled HDR pass in `HDR_PASSES` order, runs the
 * tone-map post-process, and submits the buffer.  No part of the
 * encoder lifecycle escapes — by the time `renderFrame` returns,
 * the GPU has the buffer queued.
 *
 * Order of operations matches the pre-D.2 inline body verbatim; the
 * visual output is identical.  Reordering the HDR passes is now a
 * one-line shuffle of the `HDR_PASSES` array literal.
 */
export function renderFrame(input: RenderFrameInput): void {
  const {
    ctx,
    state,
    milkyWayITimeSec,
    device,
    context,
    milkyWayRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    thumbnailRenderer,
    diskRenderer,
    settings,
    famousMeta,
    famousXrefs,
    clouds,
  } = input;

  // Bundle the renderer references each pass might need into a single
  // `PassDeps` bag.  We build it once per frame rather than rebuilding
  // it inside the loop because the references are stable for the
  // duration of `renderFrame`'s execution.  See `passes/types.ts`'s
  // `PassDeps` declaration for the per-field rationale.
  const deps: PassDeps = {
    thumbnailRenderer,
    diskRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    milkyWayRenderer,
    clouds,
    famousMeta,
    famousXrefs,
    milkyWayITimeSec,
  };

  // ── Encoder + HDR render pass ──────────────────────────────────────
  const encoder = device.createCommandEncoder();

  // Clear colour is pure black (0, 0, 0).
  // Additive blending starting from black gives the maximum dynamic
  // range — dense overlap regions bloom bright.
  //
  // The colour attachment is the HDR rgba16float offscreen target,
  // NOT the swap chain.  Every visible pass below accumulates into
  // this float buffer; the swap chain is written exactly once at the
  // end of the frame by the tone-map pass.  Without HDR + tone-map,
  // additive overlap >1.0 just clips and cluster cores blow out to
  // flat white.
  //
  // No depth attachment: every pipeline drawing into this pass uses
  // pure additive blending (`srcFactor: 'one', dstFactor: 'one'`) with
  // `depthWriteEnabled: false`, so per-fragment colour is order-
  // independent (A+B = B+A).  See `services/gpu/postProcess.ts` for
  // the history (a depth attachment was tried in commit 716eb6b and
  // superseded by 28aced5).
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  // ── HDR passes ─────────────────────────────────────────────────────
  //
  // Iterate the registry in declared order.  Each pass owns its own
  // `enabled` gate — we don't re-implement gating logic here.  This
  // is the entire HDR-pass body post-D.2; the four inline draw
  // blocks pre-D.2 are now four one-file pass modules under
  // `passes/`.
  for (const pass of HDR_PASSES) {
    if (pass.enabled(state, ctx, settings)) {
      pass.draw(renderPass, ctx, state, settings, deps);
    }
  }

  renderPass.end();

  // ── HDR → swap chain tone-map ──────────────────────────────────────
  //
  // After every additive contribution has been accumulated into the
  // HDR target, run the fullscreen tone-map post-process to compress
  // the linear-light values into the swap chain's displayable range.
  // Both passes are encoded into the same `encoder`, so the GPU sees:
  //
  //   1. clear+draw into hdrTarget (HDR_PASSES)
  //   2. fullscreen blit hdrTarget → swap chain (tone-map)
  //
  // Switching `toneMapCurve` between Linear / Reinhard / Asinh /
  // Gamma 2 / ACES is a single 4-byte uniform write inside the pass
  // — no pipeline rebuild, instant visual A/B.
  //
  // Tone-map stays inline rather than becoming a `Pass`: it samples
  // the HDR target the four HDR passes wrote into and runs OUTSIDE
  // the open render-pass block.  Modelling it as a `Pass` would
  // force a divergent signature (encoder vs. pass-encoder) for one
  // inhabitant.  See spec D.2 "tone-map special case".
  ctx.postProcess.draw(
    encoder,
    context.getCurrentTexture().createView(),
    settings.exposure,
    settings.toneMapCurve,
  );

  // Seal the command buffer and send it to the GPU.
  device.queue.submit([encoder.finish()]);
}
