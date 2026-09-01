/**
 * createGalaxyEngine — GPU orchestration for the v1 sprite tier and the post
 * chain: device, targets, per-frame encode. The whole analytic field belongs
 * to `createGalaxyFieldRenderer` (shared with the app); galaxy state to
 * `model/createGalaxyModel.ts`; camera to `createOrbitCameraInput`;
 * `timing/timingSlots.ts` is the one account of the pass chain. What is still
 * DUPLICATED here rather than shared is `runBloom`'s pass order and the cloud
 * pipelines, so a runtime sequence change must be mirrored by hand.
 */

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { InstanceDraw } from '../../@types/engine/InstanceDraw';
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { HiiTier } from '../../../../src/@types/galaxy/HiiTier';
import type { GalaxyIsmMap } from '../../../../src/@types/galaxy/GalaxyIsmMap';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './timing/createFrameTimer';
import { createReportThrottle } from './timing/createReportThrottle';
import { TIMING_SLOTS } from './timing/timingSlots';
import { createRafLoop } from './createRafLoop';
import { createGalaxyFieldRenderer } from '../../../../src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer';
import type { GalaxyFieldRenderTargets } from '../../../../src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer';
import { createGalaxyRenderTargets } from './gpu/createGalaxyRenderTargets';
import type { TargetDivisors } from './gpu/createGalaxyRenderTargets';
import { readTextureChannelSum } from './gpu/readTextureChannelSum';
import { createOrbitCameraInput } from './camera/createOrbitCameraInput';
import { createPassTimingWindows } from './timing/createPassTimingWindows';
import { beginClearPass } from '../../../../src/services/gpu/lib/beginClearPass';
import { encodeBloomPyramid } from './post/encodeBloomPyramid';
import { createGradePipeline } from './post/createGradePipeline';
import { createCloudPipelines } from './sprites/createCloudPipelines';
import { encodeSceneComposites } from './passes/encodeSceneComposites';
import { encodeSplatPass } from '../../../../src/services/gpu/renderers/galaxyField/field/encodeSplatPass';
import { findHiiSegment } from '../../../../src/services/gpu/renderers/galaxyField/field/findHiiSegment';
import { encodeStarPass } from './sprites/encodeStarPass';
import { encodeTransmittanceDust } from './sprites/encodeTransmittanceDust';
import { createArmRidgeDebugSample } from './field/createArmRidgeDebugSample';
import { createIsmMapDustCdfScanDebugSample } from './ismMap/createIsmMapDustCdfScanDebugSample';
import { createGalaxyModel } from './model/createGalaxyModel';
import { gradeIsActive } from './post/gradeIsActive';
import { toMilkyWayTuning } from './sprites/toMilkyWayTuning';
import { deriveFrameView } from './frame/deriveFrameView';
import { createOffscreenProbe } from './probe/createOffscreenProbe';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './sprites/packCloudUniforms';
import {
  GRADE_UNIFORM_BUFFER_SIZE,
  GRADE_UNIFORM_FLOATS,
  packGradeUniforms,
} from './post/packGradeUniforms';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';
import { DEFAULT_RENDER_SETTINGS } from '../data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../data/defaultLodSettings';
import { HII_TIERS } from '../data/hiiTiers';
import { mapHiiTiers } from '../../../../src/data/hiiTiers';

/** HDR working format for the scene + bloom pyramid — the runtime's `hdr` row. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Format of `dustMapTex`: four channels, one optical depth per depth slice
 * (tau_0..tau_3, see io.wesl's dustSlices doc), `float16` for headroom since a
 * summed column has no natural upper bound. One channel per slice because a
 * single tau-weighted mean depth puts a hard 50% floor on obscuration.
 */
const DUST_MAP_FORMAT: GPUTextureFormat = 'rgba16float';

/** rAF deltas kept for the median — one second at 60 Hz. */
const FRAME_WINDOW = 60;

/** Timestamp spans kept per slot for its rolling mean — same window. */
const PASS_WINDOW = 60;

/**
 * Frames a slot may go unreported before its row is dropped. The query set
 * retains a gated-off pass's last tick values, so a row that stops running has
 * to disappear rather than freeze at a stale-but-plausible number.
 */
const PASS_STALE_FRAMES = 30;

/** How often the engine hands a `PerfReport` to the UI. */
const PERF_REPORT_INTERVAL_MS = 500;

/**
 * How often the engine hands a `MilkyWayFadeReadout` to the UI. Five times the
 * perf cadence: the fade tracks the camera, so at the perf interval a wheel
 * zoom would land a half-second before the numbers explaining it did.
 */
const FADE_REPORT_INTERVAL_MS = 100;

export async function createGalaxyEngine(
  canvas: HTMLCanvasElement,
  opts: GalaxyEngineOptions = {},
): Promise<GalaxyEngineHandle> {
  // ---- device + canvas ----
  if (!navigator.gpu) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-adapter');
  // WebGPU features are opt-in both ways: requesting one the adapter lacks
  // throws, not requesting one it has leaves it off the device. Mirror the
  // adapter's advertised set, matching `services/gpu/device.ts`; on an
  // adapter without it, `createGpuTimingService` takes its no-op branch.
  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) requiredFeatures.push('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures });
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
  // Swap-chain config copied from `services/gpu/device.ts`, incl. alphaMode:
  // `getPreferredCanvasFormat()` is NON-sRGB (`bgra8unorm` on macOS), so no
  // transfer function applies between the compositor's tone-mapped output and
  // the display. `alphaMode: 'premultiplied'` matches too — the compositor
  // forces alpha to 1.0 on a 'replace' composite, so it's behaviourally
  // identical to 'opaque', but matching removes one more place the two chains
  // could quietly diverge.
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'premultiplied' });

  // ---- ownership ledger ----
  // Every engine-scope GPU allocation registers at its own allocation site;
  // `dispose` walks this in reverse. An HMR remount hands the next engine the
  // same canvas, so a missed registration leaks a full set per remount.
  // Resources that own their own teardown (`targets`, `model`, `field`,
  // `bloomPyramid`, `compositor`, `aggregateUpsample`) keep delegating and are
  // deliberately absent here — which is also why nothing registered here is
  // ever reassigned.
  const owned: { destroy(): void }[] = [];
  const own = <T extends { destroy(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };

  // ---- static fullscreen-billboard quad ----
  const quad = own(
    device.createBuffer({
      label: 'galaxy:quad',
      size: 6 * 2 * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    }),
  );
  new Float32Array(quad.getMappedRange()).set([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
  quad.unmap();

  const makeShader = (code: string, label: string): GPUShaderModule =>
    createShaderModuleWithDevLog(device, code, label);

  // ---- the analytic field: `createGalaxyFieldRenderer` ----
  // Construction order follows its own header (header UBOs, baked volumes,
  // ISM-map chain, splat pipelines). The two hooks are the CPU readback path
  // it deliberately does not own — `model` is in scope by the time either
  // fires (nothing rebuilds at construction).
  const field = createGalaxyFieldRenderer(device, {
    makeShader,
    hdrFormat: HDR,
    dustMapFormat: DUST_MAP_FORMAT,
    onIsmMapRebuilt: (grid) => model.noteIsmMapRebuilt(grid),
    onOrientationRebuilt: (grid) => model.noteOrientationRebuilt(grid),
  });

  // Tool-only grade trailer — see `packGradeUniforms` for the lanes. The bloom
  // and compositor uniforms are owned by their shared factories below.
  const gradeBuf = own(
    device.createBuffer({
      label: 'galaxy:grade',
      size: GRADE_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );

  // ---- sprite-billboard pipelines: `createCloudPipelines.ts` ----
  // The two additive/transmittance sprite passes, their own `io.wesl` shader
  // pairs, and the one bind group each needs — see that module's own header
  // for the "ONE uniform buffer per pass" and "SEPARATE shader module per
  // pass" landmines. `starUbo`/`dustUbo` are the module's own allocations, so
  // they're wrapped in this file's ownership ledger here.
  const cloudPipelines = createCloudPipelines({ device, makeShader, hdrFormat: HDR });
  const starUbo = own(cloudPipelines.starUbo);
  const dustUbo = own(cloudPipelines.dustUbo);
  const { starPipe, dustPipe, starBG, dustBG } = cloudPipelines;

  // Numeric-validation exception (armRidge.wesl vs. armRidgeGeometry.ts) —
  // see createArmRidgeDebugSample.ts's own header.
  const armRidgeDebugSample = createArmRidgeDebugSample(device, { makeShader });
  // Numeric-validation exception (ismMapDustCdfScan.wesl vs.
  // buildIsmMapDustCdf.ts) — see createIsmMapDustCdfScanDebugSample.ts's own
  // header.
  const ismMapDustCdfScanDebugSample = createIsmMapDustCdfScanDebugSample(device, { makeShader });

  // ---- the aggregate composite: the RUNTIME's additive upsample ----
  // Fully generic — a covering-triangle 4-tap low-pass of whatever view it is
  // handed, additively blended into an `rgba16float` target. Its `draw`
  // rebuilds its bind group per call, so a reallocated aggregate view needs no
  // invalidation here.
  const aggregateUpsample = createAdditiveUpsample(device, HDR);

  // ---- post chain: the RUNTIME's bloom pyramid + compositor ----
  // Both factories own their pipelines, samplers, and uniform buffers, and
  // both link the runtime's shaders (symlinked into this tool's WESL root).
  // Nothing about the glow or the tone curve is re-implemented here.
  const bloomPyramid = createBloomPyramid(device, HDR);
  const compositor = createCompositor({ device });

  // ---- the one tool-only post pipeline: `createGradePipeline.ts` ----
  const { gradePipe, gradeSampler } = createGradePipeline({
    device,
    makeShader,
    swapFormat: format,
  });

  // One internal render bag, merged by `setRender`. Seeded from the same two
  // constants the UI pushes on its first sync, so it can't drift from the
  // store slice + preset envelope — and, through them, the app's own
  // defaults. Declared before the model because the model's rebuild gates
  // read three of its lanes live.
  const render = { ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS };

  // ---- the galaxy itself: sprite buffers, extras, ISM-map readbacks ----
  // Everything the analytic field derives from (geometry, tuning, seed) is the
  // field renderer's; the model feeds it and keeps the v1 sprite tier, the
  // bubble overlay and the CPU readbacks.
  const model = createGalaxyModel({
    device,
    field,
    render,
    onStats: opts.onStats,
    onOrientationDiagnostics: opts.onOrientationDiagnostics,
  });

  // ---- size-dependent targets: HDR scene + star aggregate + bloom mips + LDR ----
  // Allocates nothing yet — the first `rebuildAll` is the unconditional one
  // below the ResizeObserver, once the canvas has adopted its backing size.
  const targets = createGalaxyRenderTargets(device, canvas, {
    hdr: HDR,
    swap: format,
    dustMap: DUST_MAP_FORMAT,
  });

  /**
   * This tool's own target rows in the field renderer's shape. Built fresh at
   * every call rather than captured: a resize or a divisor drag REPLACES these
   * textures, and the module packs each pass's `targetSizePx` straight off the
   * one it is handed.
   */
  function fieldTargets(): GalaxyFieldRenderTargets {
    return {
      fieldTex: targets.fieldTex,
      dustMapTex: targets.dustMapTex,
      dustViewTex: targets.dustViewTex,
      hiiTex: targets.hiiTex,
      hiiTiers: mapHiiTiers((kind) => targets.tierTex(kind)),
    };
  }

  // ---- camera state (orbit) ----
  const camera = createOrbitCameraInput(canvas, { autoRotate: opts.autoRotate !== false });

  // The targets module never reads the render bag, so every divisor is handed
  // at once — `tiers` built off `HII_TIERS`' own `divisorKey` so a fourth tier
  // row is the only edit a fourth divisor needs here.
  const allDivisors = (): TargetDivisors => ({
    aggregate: render.aggregateDivisor,
    field: render.fieldDivisor,
    dust: render.dustDivisor,
    hii: render.extrasDivisor,
    tiers: Object.fromEntries(
      HII_TIERS.map((tier) => [tier.kind, render[tier.divisorKey]]),
    ) as Record<HiiTier, number>,
  });

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  // One scratch serves both cloud passes: each pack writes every lane before
  // its `writeBuffer`, so nothing of the star pass's fill survives into the
  // dust pass's (the BUFFERS still have to be separate — see
  // `makeCloudUniformBuffer`).
  const cloudData = new Float32Array(CLOUD_UNIFORM_FLOATS);
  const gradeData = new Float32Array(GRADE_UNIFORM_FLOATS);

  // Every knob reaches the next frame through the uniform pack, so a merge is
  // all that's needed — except the four divisors (size render targets) and
  // the two orientation sigmas (key a rebuild the model gates), which own
  // their own comparisons downstream.
  function setRender(patch: Partial<RenderSettings & LodSettings>): void {
    Object.assign(render, patch);
    targets.setDivisors(allDivisors());
    model.noteRenderChanged();
  }

  // ---- resize ----
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingSize = (): Vec2 => [
    Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  ];
  function resize(): void {
    const [w, h] = backingSize();
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    targets.rebuildAll(allDivisors());
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  // Adopt the backing size and allocate UNCONDITIONALLY rather than leaning on
  // `resize`: an HMR remount hands the new engine the SAME canvas node,
  // already at the right size, so `resize`'s early return would leave this
  // engine with no targets at all and the first `drawFrame` would throw on
  // `aggregateTex`. Every input `rebuildAll` reads — the device, the backing
  // size, the four divisors — is live by here.
  const [initialW, initialH] = backingSize();
  canvas.width = initialW;
  canvas.height = initialH;
  targets.rebuildAll(allDivisors());

  // ---- perf instrumentation ----

  // The honest instrument: wall time between consecutive rAF callbacks. Marked
  // from `rafLoop` rather than `drawFrame`, so the matcher's offscreen frames
  // (`sample`, `grab`, `step`) never enter the window — those render off the
  // rAF cadence and would read as impossibly fast frames.
  const frameTimer = createFrameTimer(FRAME_WINDOW);

  // The ordinal instrument: the runtime's timing service, imported whole. It
  // allocates nothing when the gate is off or the adapter lacks the feature.
  const timing = createGpuTimingService(device, hasUrlGate('gpuTimings'), TIMING_SLOTS);

  // Per-slot rolling means, accumulated off the service's subscription. See
  // createPassTimingWindows for why rows keep TIMING_SLOTS order and why a
  // slot is dropped after PASS_STALE_FRAMES unreported frames.
  const passTimingWindows = createPassTimingWindows(TIMING_SLOTS, PASS_WINDOW, PASS_STALE_FRAMES);
  const unsubscribeTiming = timing.subscribe((frame) => passTimingWindows.record(frame));
  const passTimings = (): readonly PassTiming[] => passTimingWindows.timings();

  // ---- post chain encoding ----

  /**
   * encodePost — sceneTex through the shared compositor (exposure + one tone
   * curve) into `dstView`, then, only if a tool-only grade knob is off
   * identity, through the local grade trailer. `scratchView` is the LDR
   * intermediate the trailer reads; it must match `dstView`'s size and format,
   * and is untouched when the trailer is skipped.
   * `timed` is false for the offscreen readback paths (`sample`, `grab`):
   * letting them attach `timestampWrites` would overwrite the on-screen
   * composite's ticks with an offscreen pass's, marking slots consumed on a
   * frame they didn't belong to.
   */
  function encodePost(
    enc: GPUCommandEncoder,
    dstView: GPUTextureView,
    scratchView: GPUTextureView,
    timed: boolean,
  ): void {
    const graded = gradeIsActive(render);
    const compositeWrites = timed ? timing.descriptorFor('composite') : undefined;
    const tonePass = beginClearPass(
      enc,
      'galaxy:compositePass',
      graded ? scratchView : dstView,
      compositeWrites,
      1,
    );
    compositor.draw(
      tonePass,
      targets.sceneTex.createView(),
      'replace',
      // Both HDR fields zero: the tool configures an SDR swap chain, where
      // spilled over-white energy would just clamp back to 1.0. The app's own
      // SDR path passes the same zeros — see ToneMap's field docs.
      { exposure: render.exposure, curve: render.tonemap, hdrKnee: 0, hdrHeadroom: 0 },
      format,
    );
    tonePass.end();
    if (!graded) return;

    packGradeUniforms(render, gradeData);
    device.queue.writeBuffer(gradeBuf, 0, gradeData);
    // Reached only when the trailer is live, so the `'grade'` slot is consumed
    // exactly on the frames the pass runs — which is what makes the row vanish
    // from the HUD (rather than freeze) when the knobs return to identity.
    const gradeWrites = timed ? timing.descriptorFor('grade') : undefined;
    const gradePass = beginClearPass(enc, 'galaxy:gradePass', dstView, gradeWrites, 1);
    gradePass.setPipeline(gradePipe);
    gradePass.setBindGroup(
      0,
      device.createBindGroup({
        label: 'galaxy:gradeBG',
        layout: gradePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: gradeSampler },
          { binding: 1, resource: scratchView },
          { binding: 2, resource: { buffer: gradeBuf } },
        ],
      }),
    );
    gradePass.draw(3);
    gradePass.end();
  }

  // ---- frame loop ----
  // `drawFrame`'s own clock, and NOT the perf median's. This one is clamped
  // and advances on the offscreen paths too (`step`, `sample`, `grab`);
  // `createFrameTimer`'s is unclamped and advances only on rAF callbacks.
  // Folding them would silently change animation timing under a frame hitch.
  let prev = performance.now();
  // Last frame's fade, published by `rafLoop` on its own cadence. Null until the
  // first `drawFrame`; the offscreen paths write it too, which is harmless —
  // they render the same camera the on-screen frame does.
  let lastFade: MilkyWayFadeReadout | null = null;

  function drawFrame(now: number): void {
    // Clamped so a long stall (tab restore, shader recompile) can't teleport
    // the damped camera.
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    const { eye, target, fov, dist } = camera.update(dt, now);
    const shiftX = camera.shiftX(canvas.clientWidth);
    // Every camera-and-settings derivation for this frame, in one pure call —
    // the sprite passes and BOTH field headers below read the same objects out
    // of it, which is what keeps the two representations of the cloud summing
    // to the same image as they fade and dim.
    const frameView = deriveFrameView({
      eye,
      target,
      fov,
      dist,
      shiftX,
      viewportPx: [canvas.width, canvas.height],
      render,
      dustReachR: field.dustHeaderLanes.reachR,
    });
    const { view, viewProj: vp, fade, galaxyWeight, debugViews } = frameView;
    lastFade = fade;

    // Two packs of the same struct, differing only in `viewportPx`: star gets
    // the AGGREGATE's dimensions (`stars.wesl` clamps sprite half-extents
    // against it), dust gets the canvas's. Both writes land before either
    // pass is encoded — safe since they target different buffers.
    // `fadeAlpha` carries `debugGalaxyWeight`, dimming the legacy sprites the
    // same way the analytic field's fieldSplat/hiiSplat shaders do: a
    // symmetric dim, never a hard suppression of the primary alone.
    const tuning = toMilkyWayTuning(render, model.starCount);
    const aggregatePx = targets.reducedSize(render.aggregateDivisor);
    packCloudUniforms(vp, view, aggregatePx, tuning, fade.alpha * galaxyWeight, cloudData);
    device.queue.writeBuffer(starUbo, 0, cloudData);
    packCloudUniforms(
      vp,
      view,
      [canvas.width, canvas.height],
      tuning,
      fade.alpha * galaxyWeight,
      cloudData,
    );
    device.queue.writeBuffer(dustUbo, 0, cloudData);

    // The five field headers are packed and written inside `field.encode`
    // below; the post chain's uniforms are written by the shared factories at
    // draw time, so there is nothing else to pack here.

    // Before the encoder exists, not after: a rebuild can destroy and replace
    // `bubbleComps`'s buffer, which a recorded draw would already be holding,
    // and the orientation chain submits an encoder of its own that must
    // precede this frame's.
    const { bubblesLive } = model.ensureFresh();

    const timingCtx = timing.beginFrame();
    const enc = device.createCommandEncoder({ label: 'galaxy:frame' });
    // Star pass: additive billboards into the reduced-resolution aggregate,
    // like the app's `mw-aggregate` row. `spriteField` OFF (boot default, see
    // `defaultRenderSettings.ts`) empties this list wholesale — sprites off
    // means sprite COST off, which `encodeStarPass` gives by issuing only its
    // clear. The four debug views never suppress a draw; they dim the galaxy
    // through fadeAlpha's debugGalaxyWeight factor packed above, so k=0.5
    // reads as half galaxy / half map, not a hard cut.
    // No `setViewport`: the pass's only attachment is `aggregateTex`, whose
    // default viewport is its full size — the same `floor(canvas / divisor)`
    // the uniform above was packed with.
    const starInstances: InstanceDraw[] = render.spriteField ? model.starInstances() : [];
    encodeStarPass({
      enc,
      timestampWrites: timing.descriptorFor('stars'),
      targetView: targets.aggregateTex.createView(),
      pipeline: starPipe,
      bindGroup: starBG,
      quad,
      instances: starInstances,
    });
    // Each segment lookup below gates the scene pass's composite that reads a
    // target — `field.encode` below runs its own independent lookup gating
    // the pass that FILLS the same target, off this same frame's
    // `field.hiiSegments`, so the two can't drift into compositing a target
    // this frame never cleared (which sums the previous frame's content into
    // HDR with nothing to catch it) — per tier independently, since a galaxy
    // with DIG but no shells/young/extras must still skip those targets'
    // composite push.
    const analytic = render.analyticField;
    const tierSegments = HII_TIERS.map((tier) => ({
      tier,
      segment: findHiiSegment(field.hiiSegments, tier.label),
    }));
    const extrasSegment = findHiiSegment(field.hiiSegments, 'hii:extras');
    const drawDustView = debugViews.dust > 0;
    // Every field/HII pass this frame, into the caller-owned targets above —
    // `dustMap` before `field` is the only ordering the module owns; where
    // this galaxy's passes sit in the frame stays here.
    field.encode(enc, fieldTargets(), {
      eye,
      fov,
      shiftX,
      view: frameView,
      render,
      ismMapSeeding: model.ismMapSeedingView,
      youngStars: model.youngStars,
      timestampWrites: (slot) => timing.descriptorFor(slot),
    });

    // Scene pass: the aggregate folded into HDR, then transmittance dust over
    // it. The order matches the app's HDR content order — dust multiplies the
    // upsampled starlight, silhouetting a lane against the glow it blocks.
    {
      // One `'scene'` slot for the upsample AND dust — they share this pass,
      // and a timestamp pair brackets a pass. See TIMING_SLOTS.
      const sceneWrites = timing.descriptorFor('scene');
      const pass = beginClearPass(
        enc,
        'galaxy:scenePass',
        targets.sceneTex.createView(),
        sceneWrites,
        1,
      );
      // Every representation here is additive into the SAME attachment, so the
      // crossfade is just which of them ran this frame, each already carrying
      // its own weight — summation order carries no meaning. Each push is
      // gated on the SAME segment lookup that gated its pass
      // (`tierSegments`/`extrasSegment`), which keeps a target this frame
      // never drew out of the composite with no separate staleness tracking.
      const compositeViews = [targets.aggregateTex.createView()];
      if (analytic) {
        compositeViews.push(targets.fieldTex.createView());
        for (const { tier, segment } of tierSegments) {
          if (segment) compositeViews.push(targets.tierTex(tier.kind).createView());
        }
        if (extrasSegment) compositeViews.push(targets.hiiTex.createView());
        if (drawDustView) compositeViews.push(targets.dustViewTex.createView());
      }
      encodeSceneComposites(pass, aggregateUpsample, compositeViews);
      if (analytic) {
        // The three diagnostics present straight into `sceneTex` at full
        // canvas resolution — a divisor-matched offscreen and the upsample's
        // 4-tap reconstruction are both wrong for them; see the field pass.
        // All three blend additively into whatever the composites added.
        // `bubbles` takes both conjuncts, neither the other's duplicate:
        // `bubblesLive` is "a consumer wants this", `bubbleComps.count` is
        // "we have geometry to draw". Nothing rebuilds on the falling edge,
        // so the count outlives the overlay being switched off.
        field.encodeOverlays(pass, {
          ismMap: debugViews.ismMap > 0,
          orientation: debugViews.orientation > 0,
          bubbles:
            bubblesLive && model.bubbleComps.count > 0
              ? { buf: model.bubbleComps.getBuffer(), count: model.bubbleComps.count }
              : null,
        });
      }
      // Primary AND extras, and — unlike the star list above — under no
      // `spriteField` gate: that's the legacy STAR half; the legacy DUST half
      // gates UPSTREAM of generation instead. `legacyDustEnabled` off (boot
      // state) makes `engineBridge`'s `paramsForEngine` hand `spriteDust: 0`,
      // so `carveDustLayout` carves capacity 0 and `generateGalaxy` allocates
      // no dust buffer — this list is empty at boot with no gate needed here.
      // Adding one would double-gate the dust pill behind the star pill.
      // Debug views only dim it, through the same debugGalaxyWeight factor the
      // sprites carry.
      const dustInstances = model.dustInstances();
      encodeTransmittanceDust(pass, dustPipe, dustBG, quad, dustInstances);
      pass.end();
    }
    // bloom pyramid, folded back into sceneTex before the tone curve.
    // `bloomMips` is read HERE, not captured once: a resize reallocates them.
    encodeBloomPyramid(enc, {
      pyramid: bloomPyramid,
      hdrView: targets.sceneTex.createView(),
      mips: targets.bloomMips,
      texelSize: targets.bloomTexelSize,
      threshold: render.bloomThreshold,
      strength: render.bloom,
      timestamps: timing.descriptorFor('bloom'),
    });
    // tone-map composite -> canvas (+ the tool-only grade trailer, if active)
    encodePost(enc, ctx.getCurrentTexture().createView(), targets.ldrTex.createView(), true);
    // Resolve + copy the query set into this frame's staging buffer. Must be
    // recorded into the encoder before it is finished, and the service's own
    // `mapAsync` is deferred to a microtask so it lands after this submit —
    // don't add synchronisation of any kind around it.
    timing.endFrame(timingCtx, enc);
    device.queue.submit([enc.finish()]);
  }

  // ---- headless readback paths ----
  // Owns its own allocations, so it is absent from the ownership ledger and
  // `dispose` calls its `destroy` alongside the other self-owning modules.
  const offscreenProbe = createOffscreenProbe({
    device,
    format,
    drawFrame,
    encodePost,
    starCount: () => model.starCount,
  });

  // Both readouts drive React state, so a per-frame dispatch would put the
  // readout's own re-render inside the frame it is describing.
  const perfReport = createReportThrottle(PERF_REPORT_INTERVAL_MS);
  const fadeReport = createReportThrottle(FADE_REPORT_INTERVAL_MS);

  const rafLoop = createRafLoop((now) => {
    frameTimer.mark(now);
    drawFrame(now);
    // `lastFade` first: nothing to publish yet must not consume the interval.
    if (lastFade && fadeReport.due(now)) opts.onFade?.(lastFade);
    if (perfReport.due(now)) {
      const frameMs = frameTimer.medianMs();
      opts.onPerf?.({
        frameMs,
        fps: frameMs > 0 ? 1000 / frameMs : 0,
        passes: passTimings(),
        timingEnabled: timing.enabled,
      });
    }
  });
  rafLoop.start();

  return {
    setParams: model.setParams,
    setRender,
    setFieldTuning: model.setFieldTuning,
    setView: camera.setView,
    setAutoRotate: camera.setAutoRotate,
    setInsets: camera.setInsets,
    setExtras: model.setExtras,
    step: (now?: number): void => drawFrame(now ?? performance.now()),
    sample: offscreenProbe.sample,
    getCamera: camera.getCamera,
    // The ISM-map generator's packed output (ismMapFluidPack.wesl) — a
    // persistent GPU texture, always non-null, whose CONTENT is only
    // meaningful once the `ismMap` stage row has run at least once (setParams).
    getIsmMapTexture: (): GPUTexture => field.ismMapGenerator.texture,
    // The CPU-side readback of the same output (`scheduleIsmMapReadback`):
    // null until the first one lands. `placeDust.wesl` reads the GPU texture
    // directly, never this readback; it feeds the seeding debug view and
    // `youngStars.invMeanNorm`'s contrast normalisation instead.
    getIsmMapData: (): GalaxyIsmMap | null => model.ismMapData,
    // Debug-only: composes the field renderer's own probe share with the
    // readbacks that need `device`/`targets` and so can't live inside it —
    // see `GalaxyProbeApi.d.ts` for the full member docs. No production
    // caller touches this.
    probe: {
      peekRecords: field.probe.peekRecords,
      requestDustPlacementReadback: field.probe.requestDustPlacementReadback,
      requestArmSpurCloudPlacementReadback: field.probe.requestArmSpurCloudPlacementReadback,
      requestArmCloudPlacementReadback: field.probe.requestArmCloudPlacementReadback,
      requestDigVeilPlacementReadback: field.probe.requestDigVeilPlacementReadback,
      get fieldCounts() {
        return field.fieldCounts;
      },
      get hiiSegments() {
        return field.hiiSegments;
      },
      get armCloudReservation() {
        return field.armCloudReservation;
      },
      get spurCloudReservation() {
        return field.spurCloudReservation;
      },
      // `reject` matters here: this is the queue's first EXTERNALLY-AWAITED
      // request (every other caller is fire-and-forget) — without it, a
      // mapAsync rejection would leave this Promise pending forever.
      requestRingMeansReadback: (): Promise<Float32Array> =>
        new Promise((resolve, reject) => model.probe.requestRingMeansReadback(resolve, reject)),
      requestArmRidgeSampleReadback: (): Promise<Float32Array> =>
        armRidgeDebugSample.dispatchAndReadback(),
      requestIsmMapDustCdfScanReadback: () => ismMapDustCdfScanDebugSample.dispatchAndReadback(),
      // Observes dustMap/fragment.wesl's ACTUAL rendered output (not the
      // dustRenormBuffer both the compute kernel and a buffer readback would
      // read directly), so this catches a dropped/misrouted consuming
      // multiply a buffer-only check cannot. `targets.dustMapTex` is read
      // live, not captured, since a resize or divisor drag replaces it.
      requestDustMapChannelSum: () => readTextureChannelSum(device, targets.dustMapTex),
      // Draws ONLY the arm-cloud reservation's own instance range
      // (`field.armCloudReservation`) into `targets.fieldTex`, through the
      // SAME `fieldSplatPipe`/`fieldSplatBG` the production draw uses — this
      // exercises the REAL fragment shader's REAL `armCloudRenorm[0]` read,
      // not a buffer readback that would validate the reduction but never the
      // consuming multiply. Isolated from every other component, so the sum
      // is directly comparable to `armCloudReservation.flux` with no
      // cross-tier confound. `targets.fieldTex` is safely clobbered: the next
      // production frame's `encodeSplatPass` redraws it in full.
      async requestArmCloudRenderedFluxSum(): Promise<number | null> {
        const reservation = field.armCloudReservation;
        const bindGroup = field.probe.fieldSplatBG;
        if (!reservation || !bindGroup) return null;
        const enc = device.createCommandEncoder({ label: 'galaxy:armCloudRenderedFluxSum' });
        encodeSplatPass({
          enc,
          label: 'galaxy:armCloudRenderedFluxSumPass',
          targetView: targets.fieldTex.createView(),
          pipeline: field.probe.fieldSplatPipe,
          bindGroup,
          instanceCount: reservation.count,
          firstInstance: reservation.offset,
        });
        device.queue.submit([enc.finish()]);
        return readTextureChannelSum(device, targets.fieldTex);
      },
      // The spur-cloud twin of `requestArmCloudRenderedFluxSum` above.
      async requestArmSpurCloudRenderedFluxSum(): Promise<number | null> {
        const reservation = field.spurCloudReservation;
        const bindGroup = field.probe.fieldSplatBG;
        if (!reservation || !bindGroup) return null;
        const enc = device.createCommandEncoder({ label: 'galaxy:armSpurCloudRenderedFluxSum' });
        encodeSplatPass({
          enc,
          label: 'galaxy:armSpurCloudRenderedFluxSumPass',
          targetView: targets.fieldTex.createView(),
          pipeline: field.probe.fieldSplatPipe,
          bindGroup,
          instanceCount: reservation.count,
          firstInstance: reservation.offset,
        });
        device.queue.submit([enc.finish()]);
        return readTextureChannelSum(device, targets.fieldTex);
      },
    },
    grab: offscreenProbe.grab,
    dispose(): void {
      rafLoop.stop();
      unsubscribeTiming();
      timing.destroy();
      bloomPyramid.destroy();
      compositor.destroy();
      aggregateUpsample.destroy();
      field.dispose();
      armRidgeDebugSample.dispose();
      ismMapDustCdfScanDebugSample.dispose();
      // The size-dependent targets outlive every other resource here — the
      // only ones reallocated on resize, so an engine torn down and rebuilt
      // (an HMR remount hands the new engine the same canvas) must destroy
      // them explicitly rather than relying on the ownership ledger.
      targets.destroy();
      offscreenProbe.destroy();
      model.destroy();
      for (let i = owned.length - 1; i >= 0; i--) owned[i]!.destroy();
      ro.disconnect();
      camera.dispose();
    },
  };
}
