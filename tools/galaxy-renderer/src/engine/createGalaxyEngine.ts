/**
 * createGalaxyEngine — GPU orchestration: device, pipelines, render targets,
 * bind groups, per-frame encode. Galaxy state lives in
 * `model/createGalaxyModel.ts`; camera in `createOrbitCameraInput`;
 * `timing/timingSlots.ts` is the one account of the pass chain. Shaders here
 * are the runtime's own, symlinked via `wesl.toml` — editing one changes both
 * apps. Only the ORCHESTRATION is duplicated (`runBloom`'s pass order, the
 * cloud pipelines), so a runtime sequence change must be mirrored here by
 * hand.
 */

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { InstanceDraw } from '../../@types/engine/InstanceDraw';
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { HiiTierKind } from '../../@types/engine/HiiTierKind';
import type { GalaxyIsmMap } from '../../../../src/@types/galaxy/GalaxyIsmMap';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './timing/createFrameTimer';
import { createReportThrottle } from './timing/createReportThrottle';
import { TIMING_SLOTS } from './timing/timingSlots';
import { createRafLoop } from './createRafLoop';
import { bakeVolumeTexture } from './gpu/bakeVolumeTexture';
import { createGalaxyRenderTargets } from './gpu/createGalaxyRenderTargets';
import type { TargetDivisors } from './gpu/createGalaxyRenderTargets';
import { createOrbitCameraInput } from './camera/createOrbitCameraInput';
import { createPassTimingWindows } from './timing/createPassTimingWindows';
import { beginClearPass } from './passes/beginClearPass';
import { encodeBloomPyramid } from './post/encodeBloomPyramid';
import { createGradePipeline } from './post/createGradePipeline';
import { createCloudPipelines } from './sprites/createCloudPipelines';
import { createFieldPipelines } from './field/createFieldPipelines';
import { encodeDustMapPass } from './field/encodeDustMapPass';
import { encodeDustPresentPass } from './field/encodeDustPresentPass';
import { encodePresentOverlay } from './passes/encodePresentOverlay';
import { encodeSceneComposites } from './passes/encodeSceneComposites';
import { encodeSplatPass } from './field/encodeSplatPass';
import { buildFieldHeaderInputs } from './field/buildFieldHeaderInputs';
import { findHiiSegment } from './field/findHiiSegment';
import { encodeStarPass } from './sprites/encodeStarPass';
import { encodeTransmittanceDust } from './sprites/encodeTransmittanceDust';
import { createIsmMapGenerator } from './ismMap/createIsmMapGenerator';
import { createIsmMapOrientation } from './ismMap/createIsmMapOrientation';
import { createIsmMapRingReduce } from './ismMap/createIsmMapRingReduce';
import { createGalaxyModel } from './model/createGalaxyModel';
import { gradeIsActive } from './post/gradeIsActive';
import { toMilkyWayTuning } from './sprites/toMilkyWayTuning';
import { deriveFrameView } from './frame/deriveFrameView';
import { BUBBLE_RECORD_FLOATS } from './field/packBubbleInstances';
import { createOffscreenProbe } from './probe/createOffscreenProbe';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './sprites/packCloudUniforms';
import {
  GRADE_UNIFORM_BUFFER_SIZE,
  GRADE_UNIFORM_FLOATS,
  packGradeUniforms,
} from './post/packGradeUniforms';
import {
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldHeaderUniforms,
} from './field/packFieldUniforms';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';
import { ADDITIVE_BLEND } from '../../../../src/services/gpu/lib/blendStates';
import { DEFAULT_RENDER_SETTINGS } from '../data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../data/defaultLodSettings';
import { HII_TIERS } from '../data/hiiTiers';

// The star/dust sprite shader pairs live in `createCloudPipelines.ts` now,
// and the field/HII/dustMap/dustPresent pairs in `createFieldPipelines.ts`,
// alongside the pipelines built from them.
import dustNoiseBakeWgsl from './shaders/milkyWay/field/dustNoiseBake.wesl?static';
import warpNoiseBakeWgsl from './shaders/milkyWay/field/warpNoiseBake.wesl?static';
import starGrainBakeWgsl from './shaders/milkyWay/field/starGrainBake.wesl?static';
import bubblePresentVsWgsl from './shaders/milkyWay/field/bubblePresent/vertex.wesl?static';
import bubblePresentFsWgsl from './shaders/milkyWay/field/bubblePresent/fragment.wesl?static';

/** HDR working format for the scene + bloom pyramid — the runtime's `hdr` row. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Format of `dustMapTex`, the dust-column map: four channels, one optical
 * depth per depth slice (tau_0..tau_3 — see io.wesl's dustSlices doc and
 * dustMap.wesl's fs), `float16` for headroom on a summed column that has no
 * natural upper bound the way a normalized colour does. A single tau-weighted
 * mean depth puts a hard 50% floor on obscuration, which is why this needs
 * one channel per slice rather than a smaller packed encoding.
 */
const DUST_MAP_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Edge length of the baked ridged-noise volume (dustNoiseBake.wesl) —
 * 128^3 rgba8unorm, one ridged band per channel. Baked ONCE at construction
 * (view- and param-independent: four fixed octave bands, no camera/galaxy
 * input), never inside the per-frame encoder.
 */
const DUST_NOISE_TEX_SIZE = 128;

/** Matches dustNoiseBake.wesl's `@workgroup_size(4, 4, 4)`. */
const DUST_NOISE_WORKGROUP_SIZE = 4;

/**
 * Edge length of the baked warp volume (warpNoiseBake.wesl) — 64^3
 * rgba8unorm, VALUE noise (not dustNoiseTex's gradient noise) for
 * starGrain.wesl's domain-warp displacement only. Low-frequency by design
 * (three octaves at 1x/2x/4x an 8-cell base lattice), so 64^3 resolves it
 * with headroom; baked ONCE at construction like dustNoiseTex.
 */
const WARP_NOISE_TEX_SIZE = 64;

/** Matches warpNoiseBake.wesl's `@workgroup_size(4, 4, 4)`. */
const WARP_NOISE_WORKGROUP_SIZE = 4;

/**
 * Edge length of the baked star-grain volume (starGrainBake.wesl) — 128^3
 * rgba8unorm, scattered log-normal point grains rather than dust's ridged
 * bands (see that file's own header). Baked ONCE at construction, same
 * discipline as `dustNoiseTex`: no camera/galaxy input, so no reason to
 * rebake inside the per-frame encoder.
 */
const STAR_GRAIN_TEX_SIZE = 128;

/** Matches starGrainBake.wesl's `@workgroup_size(4, 4, 4)`. */
const STAR_GRAIN_WORKGROUP_SIZE = 4;

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
 * zoom would land a half-second before the numbers explaining it did. Still a
 * throttle rather than per-frame, because it drives React state.
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
  // WebGPU features are opt-in both ways: asking for one the adapter lacks
  // makes `requestDevice` throw, and NOT asking leaves it off the device even
  // where the adapter has it. So mirror the adapter's advertised set for the
  // one optional feature this tool wants, exactly as `services/gpu/device.ts`
  // does. On an adapter without it the array stays empty, the device comes back
  // fine, and `createGpuTimingService` takes its no-op branch on
  // `device.features.has('timestamp-query')` — nothing else changes.
  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) requiredFeatures.push('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures });
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
  // Swap-chain config copied from the runtime's `services/gpu/device.ts`, down
  // to the alphaMode: `getPreferredCanvasFormat()` is a NON-sRGB format
  // (`bgra8unorm` on macOS), so nothing between the compositor's output and the
  // display applies a transfer function. The runtime relies on that — its
  // compositor returns the tone-mapped value with no encode — and so does this
  // tool. `alphaMode: 'premultiplied'` (rather than the tool's former
  // 'opaque') is part of the copy; with the compositor forcing alpha 1.0 on a
  // 'replace' composite the two behave identically, but matching removes one
  // more place the two chains could quietly diverge.
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'premultiplied' });

  // ---- ownership ledger ----
  // Every engine-scope GPU allocation registers at its own allocation site and
  // `dispose` walks this in reverse. It replaces a hand-maintained destroy list
  // that had drifted by ten resources; an HMR remount hands the next engine the
  // same canvas, so each miss leaked a full set per remount. Resources that own
  // their own teardown (`targets`, `model`, `ismMapGenerator`,
  // `ismMapOrientation`, `bloomPyramid`, `compositor`, `aggregateUpsample`) keep
  // delegating and are deliberately absent here — which is also why nothing
  // registered here is ever reassigned.
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

  // The analytic field's own buffer, own struct — see `packFieldUniforms`.
  // It cannot share the cloud UBO: nothing in the 208-byte cloud layout is a
  // ray, and this pass reads none of the billboard lanes. Camera/params/dust-
  // law only now — the mixture itself rides `model.fieldComps`, a separate
  // storage binding, so this uniform stays `FIELD_HEADER_BUFFER_SIZE`
  // regardless of how many galaxies are on screen.
  const fieldUbo = own(
    device.createBuffer({
      label: 'galaxy:fieldUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // The `hii:extras` pass's own header, byte-identical layout to `fieldUbo`
  // (same `io.wesl` struct, drawn by `hiiExtrasPipe`) — see `model.hiiComps`
  // for why the tier gets its own buffers, its own target (`hiiTex`) and its
  // own divisor (`render.extrasDivisor`) rather than a slice of the field's.
  const hiiUbo = own(
    device.createBuffer({
      label: 'galaxy:hiiUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // The three generalized HII sub-tiers' own headers (`HII_TIERS`), same
  // layout and same `hiiComps` storage binding as `hiiUbo` — every tier's
  // header differs from `hiiUbo`'s only in `targetSizePx` (its own tier
  // target, own divisor). Separate buffers, one per tier, for the same
  // reason `hiiUbo` is separate from `fieldUbo`: two passes writing one
  // frame both land before either pass runs, so sharing would hand whichever
  // pass writes last its `targetSizePx` to every tier — and that lane feeds
  // `counts2.w`, which the shader's footprint gates read directly, so a wrong
  // one there is a silently wrong LOD/splat footprint, not a crash.
  const tierUbo: Record<HiiTierKind, GPUBuffer> = Object.fromEntries(
    HII_TIERS.map((tier) => [
      tier.kind,
      own(
        device.createBuffer({
          label: `galaxy:hiiTierUniforms:${tier.kind}`,
          size: FIELD_HEADER_BUFFER_SIZE,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      ),
    ]),
  ) as Record<HiiTierKind, GPUBuffer>;
  // Tool-only grade trailer — see `packGradeUniforms` for the lanes. The bloom
  // and compositor uniforms are owned by their shared factories below.
  const gradeBuf = own(
    device.createBuffer({
      label: 'galaxy:grade',
      size: GRADE_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );

  const makeShader = (code: string, label: string): GPUShaderModule =>
    createShaderModuleWithDevLog(device, code, label);

  // ---- sprite-billboard pipelines: `createCloudPipelines.ts` ----
  // The two additive/transmittance sprite passes, their own `io.wesl` shader
  // pairs, and the one bind group each needs — see that module's own header
  // for the "ONE uniform buffer per pass" and "SEPARATE shader module per
  // pass" landmines. `starUbo`/`dustUbo` are the module's own allocations, so
  // they're wrapped in this file's ownership ledger here, same idiom as
  // `bakeVolumeTexture`'s returned textures below.
  const cloudPipelines = createCloudPipelines({ device, makeShader, hdrFormat: HDR });
  const starUbo = own(cloudPipelines.starUbo);
  const dustUbo = own(cloudPipelines.dustUbo);
  const { starPipe, dustPipe, starBG, dustBG } = cloudPipelines;

  // ---- three baked volumes, each baked ONCE via bakeVolumeTexture ----
  // dustNoiseTex (128^3 ridged-fbm — dustNoiseBake.wesl's header explains why
  // ridged, not plain value noise, and why the tileable lattice hash lives in
  // that file rather than a shared lib for one consumer), warpNoiseTex (64^3
  // VALUE noise — starGrain.wesl's own domain-warp displacement, split out of
  // dustNoiseTex so it can stay a different noise kind) and starGrainTex
  // (128^3 scattered log-normal point grains — hiiSplat/starGrain.wesl's
  // YOUNG STARS branch). All three are view- and param-independent (fixed
  // octave bands, no camera/galaxy input), which is what `bakeVolumeTexture`
  // relies on to bake once here rather than inside `drawFrame`'s encoder.
  // `dustMap/fragment.wesl` already imports `dustNoiseTex`/`dustNoiseSmp` from
  // io.wesl, which is what gives `dustMapPipe`'s `layout: 'auto'` bind-group
  // layout entries 4/5 — see `createFieldPipelines.ts`, which owns that pipeline.
  const dustNoiseBaked = bakeVolumeTexture(device, {
    label: 'galaxy:dustNoise',
    code: dustNoiseBakeWgsl,
    makeShader,
    size: DUST_NOISE_TEX_SIZE,
    workgroupSize: DUST_NOISE_WORKGROUP_SIZE,
  });
  const dustNoiseTex = own(dustNoiseBaked.texture);
  const dustNoiseSampler = dustNoiseBaked.sampler;
  const warpNoiseBaked = bakeVolumeTexture(device, {
    label: 'galaxy:warpNoise',
    code: warpNoiseBakeWgsl,
    makeShader,
    size: WARP_NOISE_TEX_SIZE,
    workgroupSize: WARP_NOISE_WORKGROUP_SIZE,
  });
  const warpNoiseTex = own(warpNoiseBaked.texture);
  const warpNoiseSampler = warpNoiseBaked.sampler;
  const starGrainBaked = bakeVolumeTexture(device, {
    label: 'galaxy:starGrain',
    code: starGrainBakeWgsl,
    makeShader,
    size: STAR_GRAIN_TEX_SIZE,
    workgroupSize: STAR_GRAIN_WORKGROUP_SIZE,
  });
  const starGrainTex = own(starGrainBaked.texture);
  const starGrainSampler = starGrainBaked.sampler;

  // dustAttenuation.wesl's own sampler for `dustMapTex` (io.wesl binding 6) — a plain
  // filtering sampler, no address-mode wrap needed since the UV it is fed is
  // always clamped to the [0,1] the field pass's own fragment coords cover.
  // `rgba16float` is filterable in WebGPU core. See io.wesl's DUST MAP doc
  // for why this pass needs a filtered sample where dustPresent.wesl still
  // gets away with a 1:1 texel load.
  const dustMapSampler = device.createSampler({
    label: 'galaxy:dustMapSampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // ---- ISM-map generator + its orientation chain ----
  // Both own every resource they touch, including their readback staging
  // buffers; the engine keeps only the handles and the perf GATES (which read
  // the render bag / field tuning, which those modules deliberately don't).
  const ismMapGenerator = createIsmMapGenerator(device, {
    makeShader,
    hdrFormat: HDR,
    fieldUbo,
  });
  const ismMapOrientation = createIsmMapOrientation(device, {
    makeShader,
    hdrFormat: HDR,
    fieldUbo,
    sourceTexture: ismMapGenerator.texture,
  });
  // GPU replacement for `ismMapRingMeans.ts`'s CPU loop — see its own header.
  const ringReduce = createIsmMapRingReduce(device, {
    makeShader,
    ismMapTexture: ismMapGenerator.texture,
    ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
  });

  // ---- field/HII splat pipelines + their bind-group apparatus ----
  // `createFieldPipelines.ts` — the four splat pipelines, the dust-column-map
  // pass and its JWST presentation pass, and every `layout: 'auto'` bind group
  // built against them. Constructed here, BEFORE `model`/`targets` exist:
  // their own constructors take this module's rebuild functions as callbacks
  // (below), so `getDustMapTex` stays a thunk until `targets` is assigned.
  // See the module's own header for the 'auto'-layout contract this apparatus
  // depends on.
  const fieldPipelines = createFieldPipelines({
    device,
    makeShader,
    hdrFormat: HDR,
    dustMapFormat: DUST_MAP_FORMAT,
    fieldUbo,
    hiiUbo,
    tierUbo,
    ismMapGenerator,
    dustNoiseTex,
    dustNoiseSampler,
    warpNoiseTex,
    warpNoiseSampler,
    starGrainTex,
    starGrainSampler,
    dustMapSampler,
    getDustMapTex: () => targets.dustMapTex,
  });

  // ---- bubble-view overlay: the SF-event catalog's own placements ----
  // A SECOND, independent star-formation model (dustBubblePlacements.ts,
  // resolved from sfEventCatalog.ts) drawn as its own debug layer so it can
  // be compared directly against the fluid generator's ismMap view — see the
  // model's `rebuildBubblePlacements` for how `model.bubbleComps` is built and
  // packed. One instanced camera-facing quad per
  // placement, no storage buffer/comps lookup: bubblePresent/vertex.wesl reads
  // its per-instance center/radius/kind straight off the vertex buffer, and
  // `u` (fieldUbo) only for the camera basis + its own crossfade weight —
  // so this bind group needs just binding 0, built once like
  // `ismMapPresentBG`/`orientationPresentBG` (fieldUbo's OBJECT never
  // changes, only its content, rewritten every `drawFrame`).
  const bubblePresentVsMod = makeShader(bubblePresentVsWgsl, 'galaxy:bubblePresent.vertex');
  const bubblePresentFsMod = makeShader(bubblePresentFsWgsl, 'galaxy:bubblePresent.fragment');
  const bubblePresentPipe = device.createRenderPipeline({
    label: 'galaxy:bubblePresentPipe',
    layout: 'auto',
    vertex: {
      module: bubblePresentVsMod,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: BUBBLE_RECORD_FLOATS * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: bubblePresentFsMod,
      entryPoint: 'fs',
      targets: [{ format: HDR, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const bubblePresentBG = device.createBindGroup({
    label: 'galaxy:bubblePresentBG',
    layout: bubblePresentPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: fieldUbo } }],
  });

  // ---- the aggregate composite: the RUNTIME's additive upsample ----
  // Fully generic — a covering-triangle 4-tap low-pass of whatever view it is
  // handed, additively blended into an `rgba16float` target. The star pass
  // meets its contract exactly (an additive SUM, low-frequency relative to the
  // reduced-resolution target), which is the whole argument for rendering the
  // stars small. Its `draw` rebuilds its bind group per call, so a
  // reallocated aggregate view needs no invalidation here.
  const aggregateUpsample = createAdditiveUpsample(device, HDR);

  // ---- post chain: the RUNTIME's bloom pyramid + compositor ----
  // Both factories own their pipelines, samplers, and uniform buffers, and
  // both link the runtime's shaders (symlinked into this tool's WESL root).
  // Nothing about the glow or the tone curve is re-implemented here.
  const bloomPyramid = createBloomPyramid(device, HDR);
  const compositor = createCompositor({ device, swapFormat: format, hdrFormat: HDR });

  // ---- the one tool-only post pipeline: `createGradePipeline.ts` ----
  const { gradePipe, gradeSampler } = createGradePipeline({ device, makeShader, swapFormat: format });

  // One internal render bag merged by setRender (the spike's Object.assign).
  // Seeded from the same two constants the UI pushes on its first sync, so this
  // bag can't drift from the store slice + preset envelope that also seed from
  // them — and, through them, from the app's own defaults. Declared before the
  // model because the model's rebuild gates read three of its lanes live.
  const render = { ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS };

  // ---- the galaxy itself: geometry, mixtures, generated buffers ----
  // Everything derived from (params, tuning, seed) lives in the model; this
  // file keeps the pipelines, the targets and the per-frame headers. The two
  // regrow hooks are the `layout: 'auto'` contract — see `createFieldPipelines`.
  const model = createGalaxyModel({
    device,
    ismMapGenerator,
    orientation: ismMapOrientation,
    ringReduce,
    render,
    onFieldCompsRegrow: () => fieldPipelines.rebuildFieldCompsBindGroups(model.fieldComps.buffer),
    onHiiCompsRegrow: () => fieldPipelines.rebuildTierBindGroups(model.hiiComps.buffer),
    onStats: opts.onStats,
    onOrientationDiagnostics: opts.onOrientationDiagnostics,
  });

  // The cloud sprite bind groups (`starBG`/`dustBG`) are built by
  // `createCloudPipelines` itself, above.
  //
  // The field module's `dustMapBG` is the only one of its five bind groups
  // that doesn't reference `targets.dustMapTex` (it's the pass that WRITES
  // that texture, not one that samples it), so it is also the only one safe
  // to build before `targets` exists — see `createFieldPipelines`'s header.
  fieldPipelines.rebuildDustMapBindGroup(model.fieldComps.buffer);

  // ---- size-dependent targets: HDR scene + star aggregate + bloom mips + LDR ----
  //
  // Allocates nothing yet — the first `rebuildAll` is the unconditional one
  // below the ResizeObserver, once the canvas has adopted its backing size.
  // The callback stays on this side because it also needs `model`'s comps
  // buffers, which the target module has no business knowing about.
  const targets = createGalaxyRenderTargets(
    device,
    canvas,
    { hdr: HDR, swap: format, dustMap: DUST_MAP_FORMAT },
    () => fieldPipelines.rebuildDustMapDependents(model.fieldComps.buffer, model.hiiComps.buffer),
  );

  // ---- camera state (orbit) ----
  const camera = createOrbitCameraInput(canvas, { autoRotate: opts.autoRotate !== false });

  // The targets module never reads the render bag, so both of its entry points
  // are handed every divisor at once — `tiers` built off `HII_TIERS`' own
  // `divisorKey` rather than three hand-written lines, so a fourth tier row
  // is the only edit a fourth divisor needs here.
  const allDivisors = (): TargetDivisors => ({
    aggregate: render.aggregateDivisor,
    field: render.fieldDivisor,
    dust: render.dustDivisor,
    hii: render.extrasDivisor,
    tiers: Object.fromEntries(
      HII_TIERS.map((tier) => [tier.kind, render[tier.divisorKey]]),
    ) as Record<HiiTierKind, number>,
  });

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  // One scratch serves both cloud passes: each pack writes every lane before
  // its `writeBuffer`, so nothing of the star pass's fill survives into the
  // dust pass's. (The BUFFERS still have to be separate — see
  // `makeCloudUniformBuffer`.) `tierData` is the SAME idiom serving all three
  // `HII_TIERS` headers in their own frame loop below, not one scratch per
  // tier — the pack-then-writeBuffer pair per iteration is what makes reuse
  // safe.
  const cloudData = new Float32Array(CLOUD_UNIFORM_FLOATS);
  const fieldData = new Float32Array(FIELD_HEADER_FLOATS);
  const hiiData = new Float32Array(FIELD_HEADER_FLOATS);
  const tierData = new Float32Array(FIELD_HEADER_FLOATS);
  const gradeData = new Float32Array(GRADE_UNIFORM_FLOATS);

  // Every knob here reaches the next frame through the uniform pack, so a merge
  // is all that is needed — except the four divisors, which size render targets,
  // and the two orientation sigmas, which key a rebuild the model gates. Both
  // exceptions own their own comparison (`setDivisors` keys on the live
  // textures' pixel sizes), so this hands each the whole bag on every push.
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
  // `resize` to do it as a side effect: an HMR remount hands the new engine the
  // SAME canvas node, already at the right size, so `resize`'s early return
  // would leave this engine with no targets at all and the first `drawFrame`
  // would throw on `aggregateTex`. Every input `rebuildAll` reads — the
  // device, the backing size, the four divisors — is live by here.
  // `resize` keeps its early return, which stays correct: it now guards only a
  // genuine no-op, and cannot double-allocate against this call.
  const [initialW, initialH] = backingSize();
  canvas.width = initialW;
  canvas.height = initialH;
  targets.rebuildAll(allDivisors());

  // ---- perf instrumentation (see "Measuring it" in the header) ----

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
   *
   * `timed` is false for the offscreen readback paths (`sample`, `grab`). They
   * run this same chain a second time into their own target, outside the frame
   * the timing service is bracketing; letting them attach `timestampWrites`
   * would overwrite the on-screen composite's ticks with an offscreen pass's,
   * and would mark slots consumed on a frame they didn't belong to.
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
      dustReachR: model.dustHeaderLanes.reachR,
    });
    const { view, viewProj: vp, fade, galaxyWeight, debugViews } = frameView;
    lastFade = fade;

    // Two packs of the same struct, differing only in `viewportPx`: the star
    // pass gets the AGGREGATE's dimensions (what `stars.wesl` clamps sprite
    // half-extents against), the dust pass the canvas's. Both writes happen
    // before either pass is encoded, which is safe precisely because they
    // target different buffers. `fadeAlpha` carries `debugGalaxyWeight` too —
    // dimming the legacy sprites (primary AND extras) under an active debug
    // view exactly like the analytic field's own fieldSplat/fragment.wesl and
    // hiiSplat/shadeCommon.wesl (hiiExposureMultiply) multiplies do — a
    // symmetric dim across primary and extras, not a hard suppression of the
    // primary alone (see the field/scene passes below).
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

    // Every FieldHeaderInput this frame needs — field, `hii:extras`, and
    // every `HII_TIERS` row — assembled in one pure call off explicit model
    // lanes, render settings and this frame's own derived view; see
    // `buildFieldHeaderInputs.ts` for the shared camera basis and which lanes
    // carry real values versus the packer's own inert defaults.
    const headers = buildFieldHeaderInputs({
      eye,
      fov,
      shiftX,
      frame: frameView,
      render,
      model: {
        fieldCounts: model.fieldCounts,
        dustHeaderLanes: model.dustHeaderLanes,
        ismMapSeeding: model.ismMapSeedingView,
        hiiCount: model.hiiComps.count,
        hiiTexture: model.hiiTexture,
        youngStars: model.youngStars,
      },
      targetSizes: {
        field: targets.reducedSize(render.fieldDivisor),
        dustMapHeightPx: targets.reducedSize(render.dustDivisor)[1],
        hii: targets.reducedSize(render.extrasDivisor),
        tiers: Object.fromEntries(
          HII_TIERS.map((tier) => [tier.kind, targets.reducedSize(render[tier.divisorKey])]),
        ) as Record<HiiTierKind, Vec2>,
      },
    });
    packFieldHeaderUniforms(headers.field, fieldData);
    device.queue.writeBuffer(fieldUbo, 0, fieldData);
    packFieldHeaderUniforms(headers.hii, hiiData);
    device.queue.writeBuffer(hiiUbo, 0, hiiData);
    // The post chain's uniforms are written by the shared factories at draw
    // time (bloom thresholds/texel sizes, compositor exposure + curve), so
    // there is nothing else to pack here.
    for (const tier of HII_TIERS) {
      packFieldHeaderUniforms(headers.tiers[tier.kind], tierData);
      device.queue.writeBuffer(tierUbo[tier.kind], 0, tierData);
    }

    // Before the encoder exists, not after: a rebuild can destroy and replace
    // `bubbleComps`'s buffer, which a recorded draw would already be holding,
    // and the orientation chain submits an encoder of its own that must precede
    // this frame's.
    const { bubblesLive } = model.ensureFresh();

    const timingCtx = timing.beginFrame();
    const enc = device.createCommandEncoder({ label: 'galaxy:frame' });
    // Star pass: additive billboards into the reduced-resolution aggregate,
    // like the app's `mw-aggregate` row. `spriteField` (OFF at boot — see
    // `defaultRenderSettings.ts`) is the one thing that empties this list, and
    // it empties it wholesale: sprites off has to mean sprite COST off, which
    // an empty list gives (`encodeStarPass` then issues only its clear). The
    // four debug views never suppress a draw — they dim the galaxy through
    // fadeAlpha's debugGalaxyWeight factor (packed above), which is what makes
    // k=0.5 read as half galaxy / half map instead of a hard cut.
    //
    // No `setViewport` anywhere below: the pass's only attachment IS
    // `aggregateTex`, and a pass's default viewport is its attachment's full
    // size — the same `floor(canvas / divisor)` the uniform above was packed
    // with.
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
    // The analytic half, into its OWN target at its OWN divisor. Both halves
    // are still additive glow summed into the same HDR scene below, so drawing
    // both still gives exactly what either alone would at double weight — the
    // point of the side-by-side. Clearing (not loading) is what a private
    // target buys: no tile reload, and the timing slot is then honest.
    //
    // Each of these three gates the pass that fills a target AND the scene
    // pass's composite that reads it. Read once, here, so the two cannot drift
    // into compositing a target this frame never cleared, which sums the
    // previous frame's content into HDR with nothing to catch it.
    const analytic = render.analyticField;
    // Each `HII_TIERS` row's own span in `model.hiiSegments`, plus
    // `hii:extras`' — read once, here, so the pass that fills a tier's target
    // and the scene composite that reads it can't drift into compositing one
    // this frame never cleared, which sums the previous frame's content into
    // HDR with nothing to catch it. Independent per tier: a galaxy with DIG
    // content but no shells/young/extras must still skip the OTHER three
    // targets' composite push, which a single shared flag could not tell
    // apart.
    const tierSegments = HII_TIERS.map((tier) => ({
      tier,
      segment: findHiiSegment(model.hiiSegments, tier.label),
    }));
    const extrasSegment = findHiiSegment(model.hiiSegments, 'hii:extras');
    const drawDustView = debugViews.dust > 0;
    if (analytic) {
      // Dust-column map: splat the primary's dust slice into `dustMapTex`, at
      // its own divisor-matched resolution (`dustMapPipe`, additive). Feeds
      // dustAttenuation.wesl's componentEmission (the grey/RGB split) always now, and IS the
      // dustPresent pass's own source whenever the JWST view is live — so it
      // has to run whenever either consumer needs it: `dustViewIntensity > 0`
      // (the image itself) or a nonzero dust slice.
      //
      // The third disjunct is `dustMapPopulated`: a skipped pass leaves the
      // last frame's contents, so the frame the dust count drops to zero still
      // has to run — as the clear that empties the map. Assigning the returned
      // latch is what carries that across; drop the assignment and the map
      // freezes at the previous galaxy's dust.
      if (model.fieldCounts.dust > 0 || drawDustView || fieldPipelines.dustMapPopulated) {
        fieldPipelines.setDustMapPopulated(
          encodeDustMapPass({
            enc,
            timestampWrites: timing.descriptorFor('dustMap'),
            targetView: targets.dustMapTex.createView(),
            pipeline: fieldPipelines.dustMapPipe,
            bindGroup: fieldPipelines.dustMapBG,
            instanceCount: model.fieldCounts.dust,
          }),
        );
      }

      // JWST dust-view presentation, into its OWN target — runs ADDITIONALLY
      // alongside the emission splat below whenever `render.dustViewIntensity
      // > 0`, rather than replacing it: the four debug views crossfade
      // independently (RenderSettings's own docblock), and the scene pass sums
      // whichever of them are live.
      if (drawDustView) {
        encodeDustPresentPass({
          enc,
          targetView: targets.dustViewTex.createView(),
          pipeline: fieldPipelines.dustPresentPipe,
          bindGroup: fieldPipelines.dustPresentBG,
        });
      }

      // One draw for the WHOLE emission list `repackFieldComponents` wrote —
      // central galaxy's components then every extra's — so the field pass's
      // timing slot honestly reports the analytic cost of everything on
      // screen, not just the central galaxy's share. `fieldCounts.emission`,
      // NOT the packed total: the trailing dust slice is never drawn as its
      // own quad, only read from inside a primary emission fragment. Always
      // runs now (no debug-view gate) — fieldSplat/fragment.wesl dims its own
      // output through debugView.w, the same combined weight the sprites dim by.
      encodeSplatPass({
        enc,
        label: 'galaxy:fieldPass',
        timestampWrites: timing.descriptorFor('field'),
        targetView: targets.fieldTex.createView(),
        pipeline: fieldPipelines.fieldSplatPipe,
        bindGroup: fieldPipelines.fieldSplatBG,
        instanceCount: model.fieldCounts.emission,
      });

      // Every `HII_TIERS` row's own pass, into its own target at its own
      // divisor (`allocateTier`'s own doc): shells, young stars, and DIG each
      // get a private target rather than sharing `hiiTex`'s coarser one,
      // since a shell or young-stars association is small and bright enough
      // that a coarser shared target would collapse it under a texel. One
      // pass per tier WITH CONTENT, into a freshly cleared target — a private
      // target avoids the tile-reload cost of reopening one shared target per
      // tier on TBDR hardware. `timing.descriptorFor` marks a slot consumed as
      // a side effect (see `beginClearPass`'s own doc), so calling it only
      // inside `if (segment)` is what makes a tier's HUD row vanish on the
      // frames it draws nothing, exactly like every other conditional slot in
      // this file.
      for (const { tier, segment } of tierSegments) {
        if (!segment) continue;
        encodeSplatPass({
          enc,
          label: `galaxy:hiiPass:${tier.kind}`,
          timestampWrites: timing.descriptorFor(tier.label),
          targetView: targets.tierTex(tier.kind).createView(),
          pipeline: fieldPipelines.hiiTierPipeline(tier.kind),
          bindGroup: fieldPipelines.tierBG(tier.kind),
          instanceCount: segment.count,
          firstInstance: segment.first,
        });
      }
      // `hiiTex`'s own pass now draws ONLY background extras' HII
      // contribution (`hii:extras` — see `HiiTierSpec`'s own doc for why
      // extras can't split into their own shell/DIG/young tiers the way the
      // central galaxy's do). Same unconditional-slot idiom as the loop above.
      if (extrasSegment) {
        encodeSplatPass({
          enc,
          label: 'galaxy:hiiPass:extras',
          timestampWrites: timing.descriptorFor('hii:extras'),
          targetView: targets.hiiTex.createView(),
          pipeline: fieldPipelines.hiiExtrasPipe,
          bindGroup: fieldPipelines.hiiBG,
          instanceCount: extrasSegment.count,
          firstInstance: extrasSegment.first,
        });
      }
    }
    // Scene pass: the aggregate folded into HDR, then transmittance dust over
    // it. The order matters and matches the app's HDR content order — dust
    // multiplies the upsampled starlight, which is what silhouettes a lane
    // against the glow it blocks.
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
      // its own weight (fieldSplat/fragment.wesl's and hiiSplat/shadeCommon.wesl's
      // own debugView.w, or a present shader's own
      // debugView.x/.y/.z) — nothing picks one exclusively any more, and
      // summation order carries no meaning. The list order is the pass encode
      // order: aggregate, analytic field, every `HII_TIERS` row with content,
      // `hii:extras`, JWST view. See `allocateTier`'s/`hiiTex`'s declaration
      // comments for why they ride their own targets rather than joining the
      // field's draw. Each push is gated on the SAME segment lookup that
      // gated its pass above (`tierSegments`/`extrasSegment`), which is what
      // keeps a target this frame never drew out of the composite — no
      // separate staleness tracking needed, unlike `dustMapTex` (sampled by a
      // consumer this file doesn't control the timing of; see
      // `dustMapPopulated`).
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
        // The two diagnostics below present straight into `sceneTex` at full
        // canvas resolution — see the field pass above for why a
        // divisor-matched offscreen and the upsample's 4-tap reconstruction
        // were both wrong for them. Both pipelines blend additively, so each
        // sums with whatever the composites already added.
        if (debugViews.ismMap > 0) {
          encodePresentOverlay(
            pass,
            ismMapGenerator.presentPipeline,
            ismMapGenerator.presentBindGroup,
          );
        }
        if (debugViews.orientation > 0) {
          encodePresentOverlay(
            pass,
            ismMapOrientation.presentPipeline,
            ismMapOrientation.presentBindGroup,
          );
        }
        // The bubble-view overlay is instanced rather than a covering triangle
        // (one camera-facing quad per placement, see bubblePresent.wesl), and
        // independent of the other three: the SF-event catalog is a second,
        // unrelated star-formation model, not another lens on the same
        // generator — hence its own `if`, never an `else if`.
        //
        // Both conjuncts, and neither is the other's duplicate: `bubblesLive`
        // is "a consumer wants this", `bubbleComps.count` is "we have
        // geometry to draw". Nothing rebuilds on the falling edge, so the
        // count outlives the overlay being switched off.
        if (bubblesLive && model.bubbleComps.count > 0) {
          encodePresentOverlay(pass, bubblePresentPipe, bubblePresentBG, {
            buf: model.bubbleComps.buffer,
            count: model.bubbleComps.count,
          });
        }
      }
      // Primary AND extras, and — unlike the star list above — under no
      // `spriteField` gate, which looks like the missing half of that pill and
      // is not: `spriteField` is the legacy STAR half, and the legacy DUST half
      // gates UPSTREAM of generation instead. `legacyDustEnabled` off (the boot
      // state) makes `engineBridge`'s `paramsForEngine` hand the engine
      // `spriteDust: 0`, `carveDustLayout` then carves capacity 0 and
      // `generateGalaxy` allocates no dust buffer — so this list is empty at
      // boot with no gate here at all. Adding one would double-gate the dust
      // pill behind the star pill.
      // The debug views only dim it, through the same debugGalaxyWeight factor
      // the sprites carry.
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
  const probe = createOffscreenProbe({
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
    sample: probe.sample,
    getCamera: camera.getCamera,
    // The ISM-map generator's packed output (ismMapFluidPack.wesl) — a
    // persistent GPU texture, always non-null, whose CONTENT is only meaningful once
    // rebuildIsmMap has run at least once (setParams). Consumed by nothing
    // yet but ismMapPresent.wesl's own overlay; exposed here for the sibling
    // UI and future consumers, per `docs/research/milky-way/ism-map.md`'s
    // staging note (overlay first, consumed by nothing).
    getIsmMapTexture: (): GPUTexture => ismMapGenerator.texture,
    // The CPU-side readback of the same output (`scheduleIsmMapReadback`):
    // null until the first one lands. Consumed by `buildDustParticleCloud`
    // whenever `ismMap.generator !== 'none'` today; exposed here for future
    // consumers too.
    getIsmMapData: (): GalaxyIsmMap | null => model.ismMapData,
    grab: probe.grab,
    dispose(): void {
      rafLoop.stop();
      unsubscribeTiming();
      timing.destroy();
      bloomPyramid.destroy();
      compositor.destroy();
      aggregateUpsample.destroy();
      ismMapGenerator.dispose();
      ismMapOrientation.dispose();
      // The size-dependent targets outlive every other resource here — they
      // are the only ones reallocated on resize, so an engine torn down and
      // rebuilt (an HMR remount hands the new engine the same canvas) leaked
      // a full set per remount until this call existed.
      targets.destroy();
      probe.destroy();
      model.destroy();
      for (let i = owned.length - 1; i >= 0; i--) owned[i]!.destroy();
      ro.disconnect();
      camera.dispose();
    },
  };
}
