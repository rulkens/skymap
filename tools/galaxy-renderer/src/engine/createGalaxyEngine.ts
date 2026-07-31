/**
 * createGalaxyEngine — the one GPU-orchestration module. Owns the WebGPU
 * device, every pipeline and buffer, the orbit camera + input, and the
 * per-frame render loop. A straight port of the spike's `galaxy-engine.js`
 * (`createGalaxyRenderer`), with all math delegated to the five tested pure
 * helpers and every shader pulled in as a build-time-linked WESL string.
 *
 * ## The whole chain is the APP's, not this tool's
 *
 * This tool only earns its keep if a look tuned here survives the trip into
 * the runtime, and that only holds while the two chains are the same chain.
 * So they are the same chain, by construction rather than by hand-matching:
 *
 *  - The STAR and DUST passes are the runtime's `milkyWayCloud/stars.wesl` and
 *    `milkyWayCloud/dust.wesl`, over the runtime's `milkyWayCloud/io.wesl`
 *    uniform struct — the whole family symlinked into this tool's WESL root
 *    (see `wesl.toml`). All eight `MILKY_WAY_TUNING_DEFAULTS` knobs therefore
 *    mean here exactly what they mean in the app.
 *  - The reduced-resolution star target and its additive composite back into
 *    HDR are the app's split too, down to the shared
 *    `createAdditiveUpsample` (see "Why the stars render small" below).
 *  - The bloom pyramid is the runtime's `createBloomPyramid`, the tone-map
 *    composite is the runtime's `createCompositor`, and the shaders behind
 *    both are the runtime's `shaders/bloom/` and `shaders/compositor/` trees.
 *
 * Editing any of those shaders changes both apps. The swap chain is configured
 * with the same format + `alphaMode` as `services/gpu/device.ts`, and no
 * gamma encode is applied — matching the runtime, which writes tone-mapped
 * linear light straight into a non-sRGB `bgra8unorm` surface.
 *
 * What could NOT be shared is the ORCHESTRATION. The runtime's `runBloom`
 * takes a `ReadyFrameContext` and drives a `renderTargets` table and a GPU
 * timing service that exist only inside the engine's frame executor; this
 * tool has neither. So `encodeBloom` below is a deliberate ~25-line duplicate
 * of `runBloom`'s pass sequence (bright -> descending downsample -> ascending
 * additive upsample -> strength-scaled fold back into HDR), calling the same
 * shared pyramid object. Keep the two in step: a change to the runtime's pass
 * ORDER has to be mirrored here, while a change to any bloom/compositor
 * SHADER or pipeline arrives here for free. The same split applies to the
 * cloud: `createMilkyWayCloudRenderer` could not be reused because it bakes
 * `MILKY_WAY_MODEL_SCALE` into the uniform and writes one uniform buffer per
 * draw (this tool draws N background extras through the same pipeline), so
 * the pipelines are built here against the shared modules and the uniforms
 * packed by `packCloudUniforms` — see its header.
 *
 * ## Why the stars render small
 *
 * The star pass draws into `aggregateTex`, an offscreen at
 * `floor(canvas / aggregateDivisor)`, which is then bilinearly upsampled and
 * ADDED into the HDR scene. That is the app's `mw-aggregate` row, for the
 * app's reason: a summed additive glow field is low-frequency, so it
 * reconstructs from a coarser target for free while its fragment cost — the
 * actual wall, measured — drops by the square of the divisor.
 *
 * DUST stays full-res in `sceneTex`, also matching the app: its multiplicative
 * transmittance has to land on the real accumulation, and it is not the
 * fill-bound half.
 *
 * The load-bearing detail is `viewportPx`. `stars.wesl` clamps each sprite's
 * on-screen half-extent to `[starPxMin, starPxMax]` PIXELS, converted from NDC
 * through the uniform's `viewportPx` — pixels of the TARGET. The star pass
 * therefore packs the aggregate's dimensions there while the dust pass packs
 * the canvas's, which is also why the two passes need two uniform BUFFERS:
 * `queue.writeBuffer` is ordered against `queue.submit`, not against the
 * passes encoded in between, so two writes to one buffer in a frame would both
 * land before either pass ran and the second would win for both.
 *
 * ## The pass chain
 *
 * Generation is no longer a per-frame step. `setParams` dispatches it ONCE,
 * whenever the caller changes the central galaxy's params — not on every
 * `requestAnimationFrame` — as a pair of compute passes
 * (`createGenerationPipelines.ts` builds the pipelines, `encodeGeneration.ts`
 * records the dispatches) that write directly into the star/dust vertex
 * buffers the frame loop already draws from. It shares this module's one
 * `GPUQueue` with every subsequent `drawFrame`, so "the new galaxy is ready
 * before it's drawn" is a queue-ordering guarantee, not something the render
 * loop waits on — see `setParams`'s docblock for why no readback is needed.
 * Background extras (`setExtras`) dispatch the same way: one compute pair per
 * extra, each with its own params AND its own world transform folded into its
 * UBO — see "Why extras fold their transform into generation" below.
 *
 *   setParams(p) ──► genStars / genDust compute passes ──► star VB / dust VB
 *                     (one queue.submit, no CPU readback)
 *                              │
 *                              ▼ (every later drawFrame, same queue)
 *   ┌─ star pass (aggregateTex, clear a=0) ────────────────────────────┐
 *   │   star pipe  (additive one/one) : central galaxy + every extra   │
 *   └──────────────────────────────────────────────────────────────────┘
 *                              │ aggregateTex (rgba16float, 1/divisor)
 *                              ▼
 *   ┌─ scene pass (HDR, clear black) ──────────────────────────────────┐
 *   │   additive upsample : aggregateTex ──► sceneTex, 4-tap, one/one  │
 *   │   dust pipe  (transmittance)    : central galaxy + every extra   │
 *   └──────────────────────────────────────────────────────────────────┘
 *                              │ sceneTex (rgba16float)
 *                              ▼
 *   bright pass  ──► bloom mip 0 (half-res, thresholded, Karis-flagged)
 *                              │
 *   downsample 1..4  ──► ever-coarser mips (progressively wider glow)
 *                              │
 *   upsample 3..0  (loadOp 'load', additive) ──► fold each coarse mip
 *                              │                  back onto the finer one
 *                              ▼
 *   fold pass  ──► sceneTex : += bloomMip0 * strength, additive, loadOp
 *                              │  'load'. The glow rejoins the HDR scene
 *                              │  BEFORE the tone curve, so it rides that
 *                              ▼  one curve instead of being added after it.
 *   compositor ──► swap chain : exposure → one tone curve. Nothing else —
 *                              │  no grade, no gamma encode. This is the
 *                              │  runtime's compositor pass verbatim.
 *                              ▼
 *   grade pass (SKIPPED at default settings) ──► swap chain : saturation,
 *                                 vignette, optional gamma encode. Only
 *                                 present when a tool-only knob is off
 *                                 identity; then the compositor writes an
 *                                 LDR intermediate and this pass finishes.
 *
 * There is no depth attachment: stars are additive (order-independent) and
 * dust is order-independent transmittance, so nothing needs a Z buffer. That
 * is also why the projection's [0,1] vs [-1,1] depth convention is
 * cosmetic here — see the `proj` construction below.
 *
 * ## Measuring it: wall clock leads, timestamps follow
 *
 * Two independent instruments feed one `PerfReport`, and their ORDER of
 * authority is the point. `createFrameTimer` holds a median of recent
 * rAF-to-rAF deltas: total wall time per displayed frame, everything included,
 * additive, and the only number that answers "did this change make it faster".
 * The GPU timestamp slots below are the second instrument and are ordinal only
 * — this is a tile-based deferred GPU, the driver overlaps passes, and a
 * per-pass begin/end pair therefore measures a window in which other passes
 * were also running. Summing them over-counts (roughly 3x on Apple Silicon in
 * the app's own harness, and the handful of passes here gives the effect MORE
 * room, not less). They rank passes; they do not total a frame.
 *
 * The timestamp half rides the runtime's `gpuTimingService` unmodified — it has
 * no engine coupling, slot names are plain strings, and it degrades to a stub
 * that hands back `undefined` descriptors when `timestamp-query` is missing, so
 * every `descriptorFor` call below is unconditional. It is gated behind
 * `?gpuTimings` (the app's spelling) because attaching `timestampWrites` to a
 * pass is not free on a TBDR driver, and the default frame has to leave the
 * wall clock unperturbed.
 *
 * ## Why extras fold their transform into generation
 *
 * Each background galaxy folds its full world transform into generation: its
 * per-extra UBO carries the rigid transform + size scale in the extra lanes
 * (`packGenerationUniforms`), and the compute passes place every star/dust
 * record in world space as their final write step (`applyExtraTransform` in
 * `galaxyGen/generate.wesl`). The vertex buffer that comes out is already
 * world-placed, so drawing an extra is a plain instanced `draw` against its
 * own buffers — no per-draw model-matrix uniform, and nothing rewritten after
 * the generation submit.
 *
 * The alternative — one shared subject buffer plus a per-draw model matrix
 * mutated between draw calls — is the standing writeBuffer-vs-submit ordering
 * trap: interleaving `queue.writeBuffer` with `queue.submit` in a frame does
 * not guarantee the write lands before the matching draw reads it, so the
 * first extra to draw would read stale bytes and paint on top of the wrong
 * galaxy. Folding the transform in at generation time is even further from
 * that trap than a post-generation bake would be: the transform is applied
 * once, inline, as the record is first written, so the world-space bytes are
 * never rewritten at all — there is no second write for a draw to race.
 *
 * ## Deviations from the spike, sanctioned by the plan
 *
 *  - `mat4.perspective` (wgpu-matrix) maps depth to [0, 1] (WebGPU
 *    convention) where the spike's hand-rolled matrix used GL's [-1, 1].
 *    With no depth attachment, z only affects near/far clipping — visually
 *    identical, and [0,1] is the correct convention for this API. Do not
 *    "restore" the spike matrix.
 *  - The loop is a continuous `requestAnimationFrame`, not render-on-demand:
 *    this is a visual-tuning instrument that always animates (idle
 *    auto-rotate, damped camera), so gating renders on dirty state would buy
 *    nothing.
 *  - `starCount`/`dustCount` are the carved layouts' CAPACITIES
 *    (`GenerationLayout.capacity`), not a count of "live" (visibly nonzero)
 *    records — see `setParams`'s docblock.
 *  - There is no serial-RNG replay: every star/dust draw comes from a
 *    stateless per-invocation hash (see `galaxyGen/generate.wesl`'s header), not a
 *    single-threaded generator stepping through one draw at a time. The
 *    determinism contract that DOES hold is CPU-free: same params in, same
 *    GPU buffer contents out, every time.
 */
import { mat4 } from 'wgpu-matrix';

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ViewPose } from '../../@types/engine/ViewPose';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { MilkyWayTuning } from '../../../../src/@types/settings/MilkyWayTuning';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './createFrameTimer';
import { orbitEye } from './orbitEye';
import { panAxes } from './panAxes';
import { lensShift } from './lensShift';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './packCloudUniforms';
import { createGenerationPipelines } from '../../../../src/services/gpu/galaxy/createGenerationPipelines';
import { encodeGeneration } from '../../../../src/services/gpu/galaxy/encodeGeneration';
import { packGenerationUniforms } from '../../../../src/services/gpu/galaxy/packGenerationUniforms';
import { GENERATION_UBO } from '../../../../src/services/gpu/galaxy/generationUboLayout';
import { GEN_RECORD_BYTES } from '../../../../src/services/gpu/galaxy/genRecordBytes';
import { carveStarLayout } from '../../../../src/services/gpu/galaxy/carveStarLayout';
import { carveDustLayout } from '../../../../src/services/gpu/galaxy/carveDustLayout';
import { classifyHubbleType } from '../../../../src/services/gpu/galaxy/classifyHubbleType';
import { splitStarBudget } from '../../../../src/services/gpu/galaxy/splitStarBudget';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';
import { ADDITIVE_BLEND } from '../../../../src/services/gpu/lib/blendStates';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { BLOOM_LEVELS } from '../../../../src/data/bloomConstants';
import { DEFAULT_RENDER_SETTINGS } from '../data/defaultRenderSettings';

import starWgsl from './shaders/milkyWayCloud/stars.wesl?static';
import dustWgsl from './shaders/milkyWayCloud/dust.wesl?static';
import gradeWgsl from './shaders/grade.wesl?static';

/** HDR working format for the scene + bloom pyramid — the runtime's `hdr` row. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Resolution divisor for bloom level `n`, mirroring the runtime's `bloomN`
 * render-target rows (`renderTargets.ts`: `scale: 2 ** (n + 1)` — level 0 at
 * half-res, halving again each level). The rows themselves can't be reused
 * here without dragging in the whole `renderTargets` table (volume, aggregate,
 * and foreground rows this tool has no use for), so the one-line divisor is
 * restated; the KERNELS and pipelines that consume it are shared.
 */
const bloomScale = (level: number): number => 2 ** (level + 1);

/**
 * The GPU-timing slots this tool bills, in frame-encode order — the order the
 * HUD lists them in, and the order `gpuTimingService` allocates query-set index
 * pairs in.
 *
 * A timestamp pair can only bracket a whole pass, so the split between slots
 * is the split between passes — not a choice:
 *
 *  - `'stars'` is the additive star pass alone, because the reduced-resolution
 *    `aggregateTex` is its own attachment and therefore its own pass. This is
 *    the fill-bound half and the number the divisor / sprite-size knobs move,
 *    so having it isolated is most of the point of the split.
 *  - `'scene'` is the full-res HDR pass: the aggregate's additive upsample
 *    followed by the dust billboards. Those two share an attachment and so
 *    share a pass; separating them would mean ending the HDR pass and
 *    reopening it with `loadOp: 'load'`, which on a tile-based GPU is a full
 *    tile store plus reload of the whole HDR target — more cost than the
 *    measurement is worth, and enough to corrupt the wall clock that outranks
 *    it.
 *  - `'bloom'` is the whole pyramid as ONE span (begin on the bright pass, end
 *    on the fold), which is exactly how the app's frame program bills it (see
 *    `frameProgram.ts`'s `'bloom'` step and `runBloom`). Matching keeps a
 *    number read here comparable to the same number read in the app.
 *
 * `'grade'` only appears on frames where the tool-only grade trailer actually
 * ran; the timing service drops slots whose `descriptorFor` went unconsumed.
 */
const TIMING_SLOTS: readonly string[] = ['stars', 'scene', 'bloom', 'composite', 'grade'];

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
 * A single generated extra galaxy: its GPU-filled star/dust vertex buffers,
 * their instance counts, and the per-extra UBO the generation passes read.
 * The UBO is retained (not destroyed right after the generation submit) so its
 * lifetime brackets the vertex buffers it produced — the whole triple is torn
 * down together on the next `setExtras`.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
};

export async function createGalaxyEngine(
  canvas: HTMLCanvasElement,
  opts: GalaxyEngineOptions = {},
): Promise<GalaxyEngineHandle> {
  // ---- device + canvas (galaxy-engine.js:10-17) ----
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

  // ---- static fullscreen-billboard quad (galaxy-engine.js:20-22) ----
  const quad = device.createBuffer({
    label: 'galaxy:quad',
    size: 6 * 2 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(quad.getMappedRange()).set([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
  quad.unmap();

  // ---- cloud uniform buffers: ONE PER PASS ----
  // Both hold `milkyWayCloud/io.wesl`'s `Uniforms`, and every lane but
  // `viewportPx` is identical between them — but that one lane differs (the
  // star pass renders into the reduced-resolution aggregate, the dust pass
  // full-res) and `queue.writeBuffer` is ordered against `queue.submit`, not
  // against the passes encoded in between. Two writes to one buffer in a frame
  // would both land before either pass executed and the second would win for
  // BOTH, silently handing the star pass the canvas viewport and scaling every
  // px-clamped sprite by the divisor. The app splits them for the same reason.
  const makeCloudUniformBuffer = (label: string): GPUBuffer =>
    device.createBuffer({
      label,
      size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const starUbo = makeCloudUniformBuffer('galaxy:starUniforms');
  const dustUbo = makeCloudUniformBuffer('galaxy:dustUniforms');
  // Tool-only grade trailer: [saturation, vignette, gammaEncode, 0]. The bloom
  // and compositor uniforms are owned by their shared factories below.
  const gradeBuf = device.createBuffer({
    label: 'galaxy:grade',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const makeShader = (code: string, label: string): GPUShaderModule =>
    createShaderModuleWithDevLog(device, code, label);

  // ---- star pipeline (additive billboards) ----
  // The module is the runtime's `milkyWayCloud/stars.wesl`. It must stay a
  // SEPARATE GPUShaderModule from the dust pass even though the two share
  // `io.wesl`: WebGPU's `auto` pipeline layout derives its bind-group layout
  // from the entry points a module exposes, and two pipelines sharing a module
  // that references the binding with divergent stage visibility fail the
  // group-equivalent check. `io.wesl`'s header spells this out; the runtime's
  // `milkyWayCloudRenderer` keeps them disjoint for exactly this reason.
  //
  // The instance layout is unchanged from the tool's own former star pass —
  // both read `pos@0, color@12, (size, brightness)@24` off the same
  // `generate.wesl`-written record, which is what makes the shader swap a
  // shader swap and nothing more.
  const starMod = makeShader(starWgsl, 'galaxy:star');
  const starPipe = device.createRenderPipeline({
    label: 'galaxy:starPipe',
    layout: 'auto',
    vertex: {
      module: starMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: GEN_RECORD_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32x3' },
            { shaderLocation: 3, offset: 24, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: {
      module: starMod,
      entryPoint: 'fs',
      // The aggregate offscreen is `rgba16float` like `sceneTex`, so one HDR
      // format still describes both cloud pipelines. `ADDITIVE_BLEND` is the
      // runtime's shared descriptor — the same one `milkyWayCloudRenderer`
      // hands its star pipeline, and the same algebra `createAdditiveUpsample`
      // composites the result back with (that pairing is what makes the
      // reduced-res detour mathematically equal to drawing straight into HDR).
      targets: [{ format: HDR, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // ---- dust pipeline (transmittance billboards) ----
  // The runtime's `milkyWayCloud/dust.wesl`, drawn FULL-RES into `sceneTex`
  // (not the aggregate) — the app's split, because multiplicative
  // transmittance has to land on the real accumulation.
  const dustMod = makeShader(dustWgsl, 'galaxy:dust');
  const dustPipe = device.createRenderPipeline({
    label: 'galaxy:dustPipe',
    layout: 'auto',
    vertex: {
      module: dustMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: GEN_RECORD_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32' },
            { shaderLocation: 3, offset: 16, format: 'float32x3' },
            { shaderLocation: 4, offset: 28, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: dustMod,
      entryPoint: 'fs',
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
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

  // ---- the one tool-only post pipeline: the grade trailer ----
  // See `shaders/grade.wesl` — saturation / vignette / optional gamma encode,
  // none of which the app has. Skipped entirely at identity settings, which is
  // the default, so it costs nothing in the app-parity configuration.
  const gradeMod = makeShader(gradeWgsl, 'galaxy:grade');
  const gradePipe = device.createRenderPipeline({
    label: 'galaxy:gradePipe',
    layout: 'auto',
    vertex: { module: gradeMod, entryPoint: 'vs' },
    fragment: { module: gradeMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const gradeSampler = device.createSampler({
    label: 'galaxy:gradeSampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  // ---- generation pipelines + UBO (compute dispatch — see setParams below) ----
  // One `genUbo` buffer for the CENTRAL galaxy only: `setParams` rewrites it
  // in place on every regeneration. Each extra (background galaxy) dispatches
  // with its OWN params and world transform, so it gets its own per-extra UBO
  // built in `setExtras` — one shared buffer can't serve them, since packing N
  // extras into one submit would need N distinct UBO contents live at once.
  const genPipelines = createGenerationPipelines(device);
  const genUbo = device.createBuffer({
    label: 'galaxy:genUbo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ---- tiny readback target for headless verification (galaxy-engine.js:96-97) ----
  const debugTex = device.createTexture({
    label: 'galaxy:debugTex',
    size: [64, 64],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  // LDR scratch for `sample`'s readback, so the offscreen path runs the SAME
  // `encodePost` as the on-screen frame — grade trailer included when it is
  // active. Sized to match debugTex; unused (but harmless) at default settings.
  const debugScratchTex = device.createTexture({
    label: 'galaxy:debugScratchTex',
    size: [64, 64],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const dbgBuf = device.createBuffer({
    label: 'galaxy:debugBuf',
    size: 64 * 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // ---- instance buffers (recreated on setParams) — galaxy-engine.js:100-102 ----
  let starBuf: GPUBuffer | null = null;
  let starCount = 0;
  let dustBuf: GPUBuffer | null = null;
  let dustCount = 0;
  let extras: Extra[] = []; // background galaxies, each GPU-generated in world space

  // Per-pipeline bind groups. `layout: 'auto'` groups are pipeline-specific
  // and never cross pipelines, so each pass needs its own group even where the
  // buffer is the same — and here the buffers differ too (see
  // `makeCloudUniformBuffer` above on why the two passes cannot share one).
  const starBG = device.createBindGroup({
    label: 'galaxy:cloudBG-star',
    layout: starPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: starUbo } }],
  });
  const dustBG = device.createBindGroup({
    label: 'galaxy:cloudBG-dust',
    layout: dustPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: dustUbo } }],
  });

  // ---- size-dependent targets: HDR scene + star aggregate + bloom mips + LDR ----
  //
  // The runtime keeps these in its `renderTargets` table, which also carries
  // volume / foreground rows this tool never draws — so the tool allocates its
  // own equivalents of the `hdr`, `mw-aggregate` and `bloom0..4` rows, at the
  // same formats and the same divisors. `ldrTex` has no runtime counterpart at
  // all: it only exists as the intermediate the tool-only grade trailer reads,
  // and is allocated lazily-by-configuration (every resize) but bound only on
  // frames the trailer actually runs.
  //
  // Bind groups are NOT cached here: every shared factory rebuilds its own per
  // draw from the source view it is handed, which is exactly what makes a
  // resize (or an aggregate reallocation) need no bookkeeping in this function.
  let sceneTex: GPUTexture;
  let ldrTex: GPUTexture;
  let aggregateTex: GPUTexture;
  let bloomMips: GPUTexture[] = [];
  const RA_TB = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

  /**
   * Pixel size of the reduced-resolution star target — `floor(canvas / scale)`
   * clamped to 1 px per axis, the SAME formula and the same clamp the runtime's
   * `renderTargets.allocate` uses. `floor` (not `round`) is deliberate there:
   * it is what the upsample shader's sample-at-uv semantics assume. The clamp
   * guards a tiny canvas, where `floor` would otherwise ask for an illegal
   * 0-dimension texture.
   *
   * This is also the number the star pass writes into `viewportPx`, which is
   * why it is a function rather than two inline expressions — the allocation
   * and the uniform read it from the same place and so cannot disagree, the
   * same discipline `milkyWayAggregateLayer` follows by reading the divisor off
   * the shared spec row.
   */
  const aggregateSize = (): Vec2 => {
    const scale = render.aggregateDivisor;
    return [
      Math.max(1, Math.floor(canvas.width / scale)),
      Math.max(1, Math.floor(canvas.height / scale)),
    ];
  };

  // Split out of `buildTargets` because the divisor is a live slider: moving it
  // has to reallocate this one target without disturbing the scene, the LDR
  // scratch, or the bloom pyramid. Reallocating outright (rather than pooling a
  // few sizes) is the right trade for a 1..6 integer knob dragged by hand.
  function buildAggregateTarget(): void {
    const [w, h] = aggregateSize();
    if (aggregateTex) aggregateTex.destroy();
    aggregateTex = device.createTexture({
      label: 'galaxy:aggregateTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
  }

  function buildTargets(): void {
    const w = canvas.width;
    const h = canvas.height;
    if (sceneTex) sceneTex.destroy();
    if (ldrTex) ldrTex.destroy();
    for (const m of bloomMips) m.destroy();
    sceneTex = device.createTexture({
      label: 'galaxy:sceneTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
    ldrTex = device.createTexture({
      label: 'galaxy:ldrTex',
      size: [w, h],
      format,
      usage: RA_TB,
    });
    buildAggregateTarget();
    // Pyramid: level 0 = half-res, each further level halves again -> ever-wider
    // glow. `Math.floor(size / scale)` clamped to 1 px, matching the runtime's
    // `renderTargets.allocate`.
    bloomMips = Array.from({ length: BLOOM_LEVELS }, (_unused, level) => {
      const scale = bloomScale(level);
      return device.createTexture({
        label: `galaxy:bloomMip${level}`,
        size: [Math.max(1, Math.floor(w / scale)), Math.max(1, Math.floor(h / scale))],
        format: HDR,
        usage: RA_TB,
      });
    });
  }

  /**
   * Texel size of bloom level `level` — `1 / source-pixel-size` per axis, which
   * is `scale / viewportPx` because every level is a sub-scale of the one
   * viewport. Mirrors the runtime's `bloomSrcTexelSize`, which can't be reused
   * directly: it reads the divisor off a `ReadyFrameContext`'s render-target
   * specs, and this tool has no frame context.
   */
  const bloomTexelSize = (level: number): Vec2 => [
    bloomScale(level) / canvas.width,
    bloomScale(level) / canvas.height,
  ];

  // ---- camera state (orbit) — galaxy-engine.js:159-166 ----
  const cam = { az: 0.5, el: 1.05, dist: 31, target: [0, 0, 0] as Vec3, fov: (45 * Math.PI) / 180 };
  const camAnim = { az: cam.az, el: cam.el, dist: cam.dist }; // damped shadow copy
  let autoRotate = opts.autoRotate !== false;
  let insetL = 0;
  let insetR = 0; // CSS px occupied by side panels (for off-center framing)
  let lastInteract = performance.now();

  // One internal render bag merged by setRender (the spike's Object.assign).
  // Seeded from DEFAULT_RENDER_SETTINGS so this bag can't drift from the store
  // slice + preset envelope that also seed from it — and, through it, from the
  // app's own defaults. `sizeScale` is the one exception: the engine's spike
  // default is 1.0 where the UI seeds 0.3, and the bridge pushes the UI value
  // on its first sync anyway.
  const render = {
    ...DEFAULT_RENDER_SETTINGS,
    sizeScale: 1.0,
    lodApparent: 0,
  };

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  // One scratch serves both cloud passes: each pack writes every lane before
  // its `writeBuffer`, so nothing of the star pass's fill survives into the
  // dust pass's. (The BUFFERS still have to be separate — see
  // `makeCloudUniformBuffer`.)
  const cloudData = new Float32Array(CLOUD_UNIFORM_FLOATS);
  const gradeData = new Float32Array(4);

  /**
   * The tool's render bag, viewed as the app's `MilkyWayTuning` — the shape
   * `packCloudUniforms` and the shared shaders speak. Only two knobs are
   * renamed rather than shared outright: the tool's `starIntensity` is the
   * app's per-sprite `exposure` (the tool already spells `exposure` for the
   * post chain's whole-frame multiplier, a different quantity at a different
   * stage), and `sizeScale` is `starSizeScale`. `aggregateDivisor` and
   * `starCount` ride along for completeness even though the uniform ignores
   * both — the divisor reaches the frame by sizing `aggregateTex`, and the
   * count by carving the layouts, neither through `params0`/`params1`.
   *
   * The count supplied is the carved CAPACITY rather than the number the
   * generator was asked for. In the app those are the same field, because the
   * request lives on `MilkyWayTuning` itself; here the request is a
   * `GalaxyParams` knob (`PARAM_SPEC.starCount`, its own slider) and only the
   * realised capacity is retained past `setParams`. Since no consumer of this
   * view reads the field, the honest available number beats retaining a second
   * copy of the request to satisfy a shape.
   */
  const cloudTuning = (): MilkyWayTuning => ({
    starSizeScale: render.sizeScale,
    exposure: render.starIntensity,
    starPxMin: render.starPxMin,
    starPxMax: render.starPxMax,
    softness: render.softness,
    lodApparent: render.lodApparent,
    aggregateDivisor: render.aggregateDivisor,
    starCount,
  });

  /**
   * setParams — regenerate the central galaxy as a GPU compute dispatch
   * instead of an awaited worker round-trip. Carving the layouts is cheap
   * pure arithmetic (`splitStarBudget`/`carveStarLayout`/`carveDustLayout`),
   * so it runs directly on the caller's thread; the actual star/dust MATH
   * (bulge/disk/arm placement, colour, HII knots, ...) happens on the GPU
   * inside `encodeGeneration`'s two compute passes, ported in plan 01.
   *
   * `starBuf`/`dustBuf` are sized to the carved CAPACITY
   * (`GenerationLayout.capacity`), not a "how many stars will actually be
   * visible" count — a population's `iterations` is its CPU builder's loop
   * bound, and some iterations write a zero-brightness/opacity record (an
   * arm star past its fade radius, say) without shrinking the layout. The
   * compute pass fills every capacity slot (dead ones included), and the
   * render pipelines below draw all of them: a dead slot rasterizes nothing,
   * so nothing is drawn wrong — it just costs a few zero-alpha billboards.
   * `starCount`/`dustCount` (the instance counts every `draw` call below
   * uses) are therefore set to the capacities.
   *
   * The write order — `queue.writeBuffer(genUbo, ...)`, THEN record the
   * compute passes into a fresh encoder, THEN `queue.submit` — is what makes
   * this safe on one shared `GPUQueue` without a readback: WebGPU processes
   * everything enqueued on a queue in submission order, so by the time this
   * submit's compute passes run on the GPU, the preceding `writeBuffer` has
   * already landed. That is NOT the same shape as the standing
   * writeBuffer-vs-submit trap documented in the module header ("Why extras
   * are baked") — that trap is multiple writeBuffer/submit pairs racing to
   * mutate ONE shared buffer read by draws recorded at different times; here
   * there is exactly one write, one encoder, one submit, for a buffer
   * nothing else touches concurrently. The same ordering guarantee is why the
   * promise can resolve right after `submit`, with no `mapAsync` wait: any
   * `drawFrame` encoded afterwards shares this queue too, so its draws are
   * guaranteed to run after this submit's writes land.
   *
   * `opts.onStats` reports PLANNED counts, not live ones: the sum of each
   * star population's `iterations` (not `iterations * stride` — that would
   * double-count the worst-case HII-bonus slots most iterations never use),
   * plus the full dust capacity (dust ranges are all stride 1, so capacity
   * IS its planned count). Actual live counts differ by a few percent, the
   * same slack `iterations` always carried against its builder's real output
   * (see `PopulationRange`'s docblock) — a HUD estimate, not an exact tally.
   */
  async function setParams(p: GalaxyParams): Promise<void> {
    const category = classifyHubbleType(p.type);
    const budget = splitStarBudget(category, p);
    const starLayout = carveStarLayout(category, p, budget);
    const dustLayout = carveDustLayout(category, p, budget);

    if (starBuf) starBuf.destroy();
    // A zero-capacity star layout is not expected in practice (every
    // category's split puts at least some stars in bulge/disk/halo), but a
    // zero-size GPUBuffer is invalid, so clamp to one record just in case.
    starBuf = device.createBuffer({
      label: 'galaxy:starVB',
      size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
    });
    starCount = starLayout.capacity;

    if (dustBuf) dustBuf.destroy();
    if (dustLayout.capacity > 0) {
      dustBuf = device.createBuffer({
        label: 'galaxy:dustVB',
        size: dustLayout.capacity * GEN_RECORD_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      });
    } else {
      dustBuf = null;
    }
    dustCount = dustLayout.capacity;

    device.queue.writeBuffer(genUbo, 0, packGenerationUniforms(p, budget, null));

    const enc = device.createCommandEncoder({ label: 'galaxy:generate' });
    encodeGeneration({
      device,
      encoder: enc,
      pipelines: genPipelines,
      ubo: genUbo,
      starBuf,
      starLayout,
      dustBuf,
      dustLayout,
    });
    device.queue.submit([enc.finish()]);

    const plannedStars = starLayout.ranges.reduce((sum, r) => sum + r.iterations, 0);
    opts.onStats?.({ stars: plannedStars, dust: dustLayout.capacity });
  }

  // Every knob here reaches the next frame through the uniform pack, so a
  // merge is all that is needed — except `aggregateDivisor`, which sizes the
  // star pass's own render target. That one has to reallocate, and only when
  // it actually moved: the bridge re-pushes the whole bag on any render/lod
  // change, so an unconditional rebuild would churn a texture on every
  // exposure tick.
  function setRender(patch: Partial<RenderSettings & LodSettings>): void {
    const previousDivisor = render.aggregateDivisor;
    Object.assign(render, patch);
    if (render.aggregateDivisor !== previousDivisor) buildAggregateTarget();
  }

  // Replace the set of background galaxies. Each extra is generated GPU-side
  // exactly like the central galaxy in `setParams`, but with its own params
  // and its own rigid world transform folded into its per-extra UBO: carve the
  // layouts from `spec.params`, allocate that extra's `VERTEX | STORAGE`
  // star/dust buffers, pack `packGenerationUniforms(spec.params, budget, spec)`
  // (the transform + size scale ride the UBO's extra lanes, so the compute
  // passes emit records already placed in the scene), then `encodeGeneration`
  // into ONE shared encoder for every extra and submit once.
  //
  // The whole body is synchronous up to that single submit — no `await` splits
  // the destroy-old / build-new sequence, so replacing the extras is atomic per
  // call and needs no interleaving guard: the old buffers are torn down and the
  // new ones built with nothing able to run in between. The `async` signature
  // is kept only because `GalaxyEngineHandle` declares it; nothing is awaited.
  async function setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void> {
    for (const e of extras) {
      e.starBuf.destroy();
      e.dustBuf?.destroy();
      e.ubo.destroy();
    }
    extras = [];

    const enc = device.createCommandEncoder({ label: 'galaxy:generateExtras' });
    for (const spec of specs) {
      const category = classifyHubbleType(spec.params.type);
      const budget = splitStarBudget(category, spec.params);
      const starLayout = carveStarLayout(category, spec.params, budget);
      const dustLayout = carveDustLayout(category, spec.params, budget);

      // Same clamp as `setParams`: a zero-capacity star layout isn't expected,
      // but a zero-size GPUBuffer is invalid, so floor the size at one record.
      const starBufExtra = device.createBuffer({
        label: 'galaxy:extraStarVB',
        size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      });
      let dustBufExtra: GPUBuffer | null = null;
      if (dustLayout.capacity > 0) {
        dustBufExtra = device.createBuffer({
          label: 'galaxy:extraDustVB',
          size: dustLayout.capacity * GEN_RECORD_BYTES,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
        });
      }

      const ubo = device.createBuffer({
        label: 'galaxy:extraGenUbo',
        size: GENERATION_UBO.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(ubo, 0, packGenerationUniforms(spec.params, budget, spec));

      encodeGeneration({
        device,
        encoder: enc,
        pipelines: genPipelines,
        ubo,
        starBuf: starBufExtra,
        starLayout,
        dustBuf: dustBufExtra,
        dustLayout,
      });

      extras.push({
        starBuf: starBufExtra,
        starCount: starLayout.capacity,
        dustBuf: dustBufExtra,
        dustCount: dustLayout.capacity,
        ubo,
      });
    }
    device.queue.submit([enc.finish()]);
  }

  function setView(pose: Partial<ViewPose>): void {
    if (pose.az != null) cam.az = pose.az;
    if (pose.el != null) cam.el = pose.el;
    if (pose.dist != null) cam.dist = pose.dist;
    lastInteract = performance.now();
  }

  function setAutoRotate(on: boolean): void {
    autoRotate = on;
  }

  function setInsets(left: number, right: number): void {
    insetL = left || 0;
    insetR = right || 0;
  }

  // ---- input (galaxy-engine.js:225-250) ----
  let dragging = false;
  let panning = false;
  let lx = 0;
  let ly = 0;
  const onDown = (e: PointerEvent): void => {
    dragging = true;
    panning = e.button === 2 || e.button === 1;
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    if (panning) {
      // Right/middle-drag pans: shift the orbit target along the camera's right & up axes.
      const { right, up } = panAxes(camAnim.az, camAnim.el);
      const s = camAnim.dist * 0.0016; // screen-constant pan speed
      const dx = (e.clientX - lx) * s;
      const dy = (e.clientY - ly) * s;
      for (let i = 0; i < 3; i++) cam.target[i] = cam.target[i]! + (-right[i]! * dx + up[i]! * dy);
    } else {
      cam.az += (e.clientX - lx) * 0.006;
      cam.el += (e.clientY - ly) * 0.006;
      cam.el = Math.max(-1.5, Math.min(1.5, cam.el));
    }
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
  };
  const onUp = (): void => {
    dragging = false;
    panning = false;
    lastInteract = performance.now();
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    cam.dist *= Math.exp(e.deltaY * 0.0011);
    cam.dist = Math.max(3, Math.min(400, cam.dist));
    lastInteract = performance.now();
  };
  const onContextMenu = (e: Event): void => e.preventDefault(); // allow right-drag to pan
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  // ---- resize (galaxy-engine.js:253-264) ----
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // full native resolution
  function resize(): void {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    buildTargets();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- perf instrumentation (see "Measuring it" in the header) ----

  // The honest instrument: wall time between consecutive rAF callbacks. Fed
  // from `loop` rather than `drawFrame`, so the matcher's offscreen frames
  // (`sample`, `grab`, `step`) never enter the window — those render off the
  // rAF cadence and would read as impossibly fast frames.
  const frameTimer = createFrameTimer(FRAME_WINDOW);

  // The ordinal instrument: the runtime's timing service, imported whole. It
  // allocates nothing when the gate is off or the adapter lacks the feature.
  const timing = createGpuTimingService(device, hasUrlGate('gpuTimings'), TIMING_SLOTS);

  // Per-slot rolling means, accumulated off the service's subscription. The
  // service delivers a frame's decoded spans 1-2 frames after its submit (the
  // staging buffer maps asynchronously); nothing here waits on that, the next
  // periodic report just picks up whatever has landed.
  type PassWindow = { samples: number[]; lastSeenFrame: number };
  const passWindows = new Map<string, PassWindow>();
  const unsubscribeTiming = timing.subscribe((frame) => {
    for (const [slot, ms] of frame.perPassMs) {
      let window = passWindows.get(slot);
      if (!window) {
        window = { samples: [], lastSeenFrame: frame.frameIndex };
        passWindows.set(slot, window);
      }
      window.samples.push(ms);
      if (window.samples.length > PASS_WINDOW) window.samples.shift();
      window.lastSeenFrame = frame.frameIndex;
    }
    for (const [slot, window] of passWindows) {
      if (frame.frameIndex - window.lastSeenFrame > PASS_STALE_FRAMES) passWindows.delete(slot);
    }
  });

  // Rows come out in `TIMING_SLOTS` order rather than Map-insertion order: a
  // slot that only starts running later (the grade trailer) would otherwise
  // insert at the end and pin itself there, shuffling the HUD's row order
  // against the frame's actual pass order.
  const passTimings = (): readonly PassTiming[] =>
    TIMING_SLOTS.flatMap((slot) => {
      const window = passWindows.get(slot);
      if (!window || window.samples.length === 0) return [];
      const mean = window.samples.reduce((sum, ms) => sum + ms, 0) / window.samples.length;
      return [{ slot, ms: mean }];
    });

  // ---- post chain encoding ----

  /**
   * encodeBloom — a deliberate duplicate of the runtime's `runBloom` pass
   * sequence, calling the SAME shared `bloomPyramid`. Only the orchestration is
   * copied: `runBloom` reads its targets off a `ReadyFrameContext`'s
   * `renderTargets` table and brackets the sequence in a GPU-timing slot,
   * neither of which exists in this tool. The pass ORDER is the load-bearing
   * part and must stay in step with `runBloom` — every pass reads a level
   * written earlier in this same sequence, which is what keeps a level from
   * ever sampling last frame's stored contents (the cross-frame feedback that
   * ramps the whole screen to white).
   *
   *   bright        hdr      -> bloom0          (clear)
   *   downsample L  bloomL-1 -> bloomL          (clear), Karis on L=1 only
   *   upsample   L  bloomL+1 -> bloomL          (load, additive)
   *   fold          bloom0   -> hdr             (load, additive, x strength)
   *
   * The fold is what puts the glow back into the HDR scene BEFORE the tone
   * curve, so bloom rides that one curve. Adding it inside the composite
   * instead — as this tool used to — puts the same sum through the same curve
   * arithmetically, but leaves the composite carrying a second texture bind and
   * a strength knob that the shared compositor has no slot for, which is
   * exactly the divergence that made the shared shader unusable here.
   */
  function encodeBloom(enc: GPUCommandEncoder): void {
    const hdrView = sceneTex.createView();
    const clear = { r: 0, g: 0, b: 0, a: 0 };
    const open = (
      level: number,
      loadOp: 'clear' | 'load',
      timestampWrites?: GPURenderPassTimestampWrites,
    ): GPURenderPassEncoder =>
      enc.beginRenderPass({
        label: `galaxy:bloom${level}`,
        colorAttachments: [
          loadOp === 'clear'
            ? { view: bloomMips[level]!.createView(), loadOp, storeOp: 'store', clearValue: clear }
            : { view: bloomMips[level]!.createView(), loadOp, storeOp: 'store' },
        ],
        ...(timestampWrites ? { timestampWrites } : {}),
      });

    // One `'bloom'` span across the whole pyramid, the app's billing: the begin
    // timestamp rides the bright pass and the end rides the fold, both writing
    // the same query pair. The decoder reads two absolute tick values at fixed
    // indices and subtracts, so splitting the pair across passes yields the
    // honest cross-pass span.
    const ts = timing.descriptorFor('bloom');
    const beginWrites = ts
      ? { querySet: ts.querySet, beginningOfPassWriteIndex: ts.beginningOfPassWriteIndex }
      : undefined;
    const endWrites = ts
      ? { querySet: ts.querySet, endOfPassWriteIndex: ts.endOfPassWriteIndex }
      : undefined;

    const brightPass = open(0, 'clear', beginWrites);
    bloomPyramid.bright(brightPass, hdrView, render.bloomThreshold);
    brightPass.end();

    for (let level = 1; level < BLOOM_LEVELS; level++) {
      const pass = open(level, 'clear');
      bloomPyramid.downsample(
        pass,
        bloomMips[level - 1]!.createView(),
        level,
        bloomTexelSize(level - 1),
        level === 1,
      );
      pass.end();
    }

    for (let level = BLOOM_LEVELS - 2; level >= 0; level--) {
      const pass = open(level, 'load');
      bloomPyramid.upsample(
        pass,
        bloomMips[level + 1]!.createView(),
        level,
        bloomTexelSize(level + 1),
      );
      pass.end();
    }

    const foldPass = enc.beginRenderPass({
      label: 'galaxy:bloomFold',
      colorAttachments: [{ view: hdrView, loadOp: 'load', storeOp: 'store' }],
      ...(endWrites ? { timestampWrites: endWrites } : {}),
    });
    bloomPyramid.fold(foldPass, bloomMips[0]!.createView(), render.bloom);
    foldPass.end();
  }

  /**
   * Is the tool-only grade trailer doing anything? At its identity defaults it
   * is not, and the whole pass is then skipped so the chain is the app's chain
   * exactly — one composite from HDR straight to the destination.
   */
  const gradeIsActive = (): boolean =>
    render.saturation !== 1 || render.vignette !== 0 || render.gammaEncode;

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
    const graded = gradeIsActive();
    const compositeWrites = timed ? timing.descriptorFor('composite') : undefined;
    const tonePass = enc.beginRenderPass({
      label: 'galaxy:compositePass',
      colorAttachments: [
        {
          view: graded ? scratchView : dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      ...(compositeWrites ? { timestampWrites: compositeWrites } : {}),
    });
    compositor.draw(
      tonePass,
      sceneTex.createView(),
      'replace',
      { exposure: render.exposure, curve: render.tonemap },
      format,
    );
    tonePass.end();
    if (!graded) return;

    gradeData[0] = render.saturation;
    gradeData[1] = render.vignette;
    gradeData[2] = render.gammaEncode ? 1 : 0;
    device.queue.writeBuffer(gradeBuf, 0, gradeData);
    // Reached only when the trailer is live, so the `'grade'` slot is consumed
    // exactly on the frames the pass runs — which is what makes the row vanish
    // from the HUD (rather than freeze) when the knobs return to identity.
    const gradeWrites = timed ? timing.descriptorFor('grade') : undefined;
    const gradePass = enc.beginRenderPass({
      label: 'galaxy:gradePass',
      colorAttachments: [
        {
          view: dstView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      ...(gradeWrites ? { timestampWrites: gradeWrites } : {}),
    });
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

  // ---- frame loop (galaxy-engine.js:266-345) ----
  let raf = 0;
  let running = true;
  let prev = performance.now();

  function drawFrame(now: number): void {
    // Clamped so a long stall (tab restore, shader recompile) can't teleport
    // the damped camera. The perf median deliberately reads the UNCLAMPED rAF
    // delta instead — see `loop`.
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    // idle auto-rotate
    if (autoRotate && now - lastInteract > 2500 && !dragging) cam.az += dt * 0.12;
    // damping
    const k = Math.min(1, dt * 10);
    camAnim.az += (cam.az - camAnim.az) * k;
    camAnim.el += (cam.el - camAnim.el) * k;
    camAnim.dist += (cam.dist - camAnim.dist) * k;

    const eye = orbitEye(camAnim.az, camAnim.el, camAnim.dist, cam.target);
    const view = mat4.lookAt(eye, cam.target, [0, 1, 0]);
    // Depth maps to [0, 1] (WebGPU); no depth attachment, so this is cosmetic. See header.
    const proj = mat4.perspective(cam.fov, canvas.width / canvas.height, 0.1, 400);
    proj[8] = lensShift(insetL, insetR, canvas.clientWidth); // lens shift to centre in the visible area
    const vp = mat4.multiply(proj, view);

    // Two packs of the same struct, differing only in `viewportPx`: the star
    // pass gets the AGGREGATE's dimensions (what `stars.wesl` clamps sprite
    // half-extents against), the dust pass the canvas's. Both writes happen
    // before either pass is encoded, which is safe precisely because they
    // target different buffers.
    const tuning = cloudTuning();
    const aggregatePx = aggregateSize();
    packCloudUniforms(vp, view, aggregatePx, tuning, cloudData);
    device.queue.writeBuffer(starUbo, 0, cloudData);
    packCloudUniforms(vp, view, [canvas.width, canvas.height], tuning, cloudData);
    device.queue.writeBuffer(dustUbo, 0, cloudData);
    // The post chain's uniforms are written by the shared factories at draw
    // time (bloom thresholds/texel sizes, compositor exposure + curve), so
    // there is nothing else to pack here.

    const timingCtx = timing.beginFrame();
    const enc = device.createCommandEncoder({ label: 'galaxy:frame' });
    // Star pass: additive billboards (central + extras) into the reduced-
    // resolution aggregate. Cleared to a=0 like the app's `mw-aggregate` row —
    // the additive composite below must treat an untouched texel as "no light",
    // and an opaque clear would inject a full alpha into the sum.
    //
    // No `setViewport` call: the pass's only attachment IS `aggregateTex`, and
    // a pass's default viewport is its attachment's full size, which is the
    // same `floor(canvas / divisor)` the uniform above was packed with.
    {
      const starWrites = timing.descriptorFor('stars');
      const pass = enc.beginRenderPass({
        label: 'galaxy:starPass',
        colorAttachments: [
          {
            view: aggregateTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(starWrites ? { timestampWrites: starWrites } : {}),
      });
      pass.setPipeline(starPipe);
      pass.setBindGroup(0, starBG);
      pass.setVertexBuffer(0, quad);
      if (starBuf) {
        pass.setVertexBuffer(1, starBuf);
        pass.draw(6, starCount);
      }
      for (const e of extras) {
        pass.setVertexBuffer(1, e.starBuf);
        pass.draw(6, e.starCount);
      }
      pass.end();
    }
    // Scene pass: the aggregate folded into HDR, then transmittance dust over
    // it. The order matters and matches the app's HDR content order — dust
    // multiplies the upsampled starlight, which is what silhouettes a lane
    // against the glow it blocks.
    {
      // One `'scene'` slot for the upsample AND dust — they share this pass,
      // and a timestamp pair brackets a pass. See TIMING_SLOTS.
      const sceneWrites = timing.descriptorFor('scene');
      const pass = enc.beginRenderPass({
        label: 'galaxy:scenePass',
        colorAttachments: [
          {
            view: sceneTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(sceneWrites ? { timestampWrites: sceneWrites } : {}),
      });
      aggregateUpsample.draw(pass, aggregateTex.createView());
      pass.setPipeline(dustPipe);
      pass.setBindGroup(0, dustBG);
      pass.setVertexBuffer(0, quad);
      if (dustBuf) {
        pass.setVertexBuffer(1, dustBuf);
        pass.draw(6, dustCount);
      }
      for (const e of extras) {
        if (e.dustBuf) {
          pass.setVertexBuffer(1, e.dustBuf);
          pass.draw(6, e.dustCount);
        }
      }
      pass.end();
    }
    // bloom pyramid, folded back into sceneTex before the tone curve
    encodeBloom(enc);
    // tone-map composite -> canvas (+ the tool-only grade trailer, if active)
    encodePost(enc, ctx.getCurrentTexture().createView(), ldrTex.createView(), true);
    // Resolve + copy the query set into this frame's staging buffer. Must be
    // recorded into the encoder before it is finished, and the service's own
    // `mapAsync` is deferred to a microtask so it lands after this submit —
    // don't add synchronisation of any kind around it.
    timing.endFrame(timingCtx, enc);
    device.queue.submit([enc.finish()]);
  }

  // The rAF-delta clock. `lastRafMs` starts at 0 to mark "no previous
  // callback": the first tick has nothing to subtract from, and `performance
  // .now()` at construction would instead measure engine boot as a frame.
  let lastRafMs = 0;
  let lastPerfReportMs = 0;

  function loop(now: number): void {
    if (!running) return;
    if (lastRafMs !== 0) frameTimer.push(now - lastRafMs);
    lastRafMs = now;
    drawFrame(now);
    // Report on a timer, not per frame: `onPerf` drives React state, and a
    // per-frame dispatch would have the readout's own re-render inside the
    // number it is reporting.
    if (now - lastPerfReportMs >= PERF_REPORT_INTERVAL_MS) {
      lastPerfReportMs = now;
      const frameMs = frameTimer.medianMs();
      opts.onPerf?.({
        frameMs,
        fps: frameMs > 0 ? 1000 / frameMs : 0,
        passes: passTimings(),
        timingEnabled: timing.enabled,
      });
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setParams,
    setRender,
    setView,
    setAutoRotate,
    setInsets,
    setExtras,
    step: (now?: number): void => drawFrame(now ?? performance.now()),
    async sample() {
      drawFrame(performance.now());
      const enc = device.createCommandEncoder({ label: 'galaxy:samplePass' });
      encodePost(enc, debugTex.createView(), debugScratchTex.createView(), false);
      enc.copyTextureToBuffer(
        { texture: debugTex },
        { buffer: dbgBuf, bytesPerRow: 256, rowsPerImage: 64 },
        [64, 64, 1],
      );
      device.queue.submit([enc.finish()]);
      await dbgBuf.mapAsync(GPUMapMode.READ);
      const a = new Uint8Array(dbgBuf.getMappedRange().slice(0));
      dbgBuf.unmap();
      let s = 0;
      let m = 0;
      let nz = 0;
      const n = a.length / 4;
      for (let i = 0; i < a.length; i += 4) {
        const l = (a[i]! + a[i + 1]! + a[i + 2]!) / 3;
        s += l;
        if (l > m) m = l;
        if (l > 4) nz++;
      }
      return {
        mean: +(s / n).toFixed(2),
        max: m,
        litPct: +((100 * nz) / n).toFixed(1),
        stars: starCount,
      };
    },
    getCamera: (): ViewPose => ({ az: cam.az, el: cam.el, dist: cam.dist }),
    async grab(size?: number) {
      const S = size ?? 480;
      drawFrame(performance.now());
      const tex = device.createTexture({
        label: 'galaxy:grabTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      // LDR scratch so the grab runs the SAME `encodePost` as the on-screen
      // frame; only bound when the grade trailer is active. The descriptor
      // matcher compares grabs against reference photographs, so a grab that
      // skipped a live grade would be scoring a different image than the one
      // being tuned.
      //
      // Note the shared compositor samples NEAREST (correct for its own
      // job — its source and dst are always the same size), so a grab into a
      // smaller S point-samples the full-res scene rather than filtering it.
      // The descriptor is a coarse radial/azimuthal summary and the previous
      // bilinear tap was barely less aliased at these ratios, so this is left
      // alone; if auto-fit ever gets noisy, a mip-chain downscale before the
      // readback is the fix, not a second sampler in the shared pass.
      const scratch = device.createTexture({
        label: 'galaxy:grabScratchTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const bpr = Math.ceil((S * 4) / 256) * 256;
      const buf = device.createBuffer({
        label: 'galaxy:grabBuf',
        size: bpr * S,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const enc = device.createCommandEncoder({ label: 'galaxy:grabPass' });
      encodePost(enc, tex.createView(), scratch.createView(), false);
      enc.copyTextureToBuffer(
        { texture: tex },
        { buffer: buf, bytesPerRow: bpr, rowsPerImage: S },
        [S, S, 1],
      );
      device.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8ClampedArray(S * S * 4);
      const bgra = format.startsWith('bgra');
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const si = y * bpr + x * 4;
          const di = (y * S + x) * 4;
          if (bgra) {
            out[di] = src[si + 2]!;
            out[di + 1] = src[si + 1]!;
            out[di + 2] = src[si]!;
          } else {
            out[di] = src[si]!;
            out[di + 1] = src[si + 1]!;
            out[di + 2] = src[si + 2]!;
          }
          out[di + 3] = 255;
        }
      }
      buf.unmap();
      buf.destroy();
      tex.destroy();
      scratch.destroy();
      return { S, data: out };
    },
    dispose(): void {
      running = false;
      cancelAnimationFrame(raf);
      unsubscribeTiming();
      timing.destroy();
      bloomPyramid.destroy();
      compositor.destroy();
      aggregateUpsample.destroy();
      starUbo.destroy();
      dustUbo.destroy();
      gradeBuf.destroy();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
