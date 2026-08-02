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
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { OrientationDiagnostics } from '../../@types/engine/OrientationDiagnostics';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ViewPose } from '../../@types/engine/ViewPose';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDustParams } from '../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../../../src/@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxySfMap } from '../../../../src/@types/galaxy/GalaxySfMap';
import type { GalaxySfMapOrientation } from '../../../../src/@types/galaxy/GalaxySfMapOrientation';
import type { MilkyWayTuning } from '../../../../src/@types/settings/MilkyWayTuning';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './createFrameTimer';
import { deriveMilkyWayFade } from './deriveMilkyWayFade';
import { orbitEye } from './orbitEye';
import { panAxes } from './panAxes';
import { lensShift } from './lensShift';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './packCloudUniforms';
import {
  FIELD_COMPONENT_FLOATS,
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldComponents,
  packFieldHeaderUniforms,
} from './packFieldUniforms';
import type {
  DebugViewWeights,
  FieldDustNoise,
  FieldDustSlices,
  SfMapChannelWeights,
} from './packFieldUniforms';
import { createGenerationPipelines } from '../../../../src/services/gpu/galaxy/createGenerationPipelines';
import { encodeGeneration } from '../../../../src/services/gpu/galaxy/encodeGeneration';
import { packGenerationUniforms } from '../../../../src/services/gpu/galaxy/packGenerationUniforms';
import { readGalaxyFieldGeometry } from '../../../../src/services/gpu/galaxy/readGalaxyFieldGeometry';
import {
  buildGalaxyFieldMixture,
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../../src/data/galaxy/galaxyFieldMixture';
import { buildHiiRegions, HII_MAX_COUNT } from '../../../../src/data/galaxy/hiiRegions';
import {
  buildGalaxySfMapArmForcing,
  sfMapGridRadius,
  SF_MAP_AZ,
  SF_MAP_RINGS,
  SF_MAP_WORKGROUP_SIZE,
} from '../../../../src/data/galaxy/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../src/data/galaxy/galaxySfMapArmForcing';
import { DISC_SIGMA_RATIOS } from '../../../../src/data/galaxy/discSurfaceFit';
import {
  buildGalaxyDustMixture,
  dustDiscShape,
  dustSigmaR,
} from '../../../../src/data/galaxy/galaxyDustMixture';
import {
  buildDustParticleCloud,
  dustNoiseTileUnits,
} from '../../../../src/data/galaxy/dustParticleCloud';
import type { OrientationDeltaStats } from '../../../../src/data/galaxy/clusteredDiscPlacement';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../src/data/galaxy/defaultGalaxyDustParams';
import { dustExtinctionRgb } from '../../../../src/utils/galaxy/dustExtinctionRgb';
import { transformGalaxyFieldComponent } from '../../../../src/utils/galaxy/transformGalaxyFieldComponent';
import { f16ToFloat } from '../../../../src/utils/math/f16ToFloat';
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
import splatWgsl from './shaders/milkyWayField/splat.wesl?static';
import dustMapWgsl from './shaders/milkyWayField/dustMap.wesl?static';
import dustPresentWgsl from './shaders/milkyWayField/dustPresent.wesl?static';
import dustNoiseBakeWgsl from './shaders/milkyWayField/dustNoiseBake.wesl?static';
import sfMapStepWgsl from './shaders/milkyWayField/sfMapStep.wesl?static';
import sfMapPackWgsl from './shaders/milkyWayField/sfMapPack.wesl?static';
import sfMapPresentWgsl from './shaders/milkyWayField/sfMapPresent.wesl?static';
import orientationPresentWgsl from './shaders/milkyWayField/orientationPresent.wesl?static';
import sfMapOrientationFieldWgsl from './shaders/milkyWayField/sfMapOrientationField.wesl?static';
import sfMapOrientationTensorWgsl from './shaders/milkyWayField/sfMapOrientationTensor.wesl?static';
import sfMapOrientationTensorBlurWgsl from './shaders/milkyWayField/sfMapOrientationTensorBlur.wesl?static';
import sfMapOrientationCoherenceWgsl from './shaders/milkyWayField/sfMapOrientationCoherence.wesl?static';
import gradeWgsl from './shaders/grade.wesl?static';

/** HDR working format for the scene + bloom pyramid — the runtime's `hdr` row. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Format of `dustMapTex`, the dust-column map: four channels, one optical
 * depth per depth slice (tau_0..tau_3 — see io.wesl's dustSlices doc and
 * dustMap.wesl's fs), `float16` for headroom on a summed column that has no
 * natural upper bound the way a normalized colour does. Was `rg16float`
 * (tau, tau*tPeak) before the depth-sliced attenuation fix — a single
 * tau-weighted mean depth put a hard 50% floor on obscuration.
 */
const DUST_MAP_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * Floor for the dust's own reach R (io.wesl's dustSlices doc) — small next
 * to any real galaxy's scale (generator units where `cam.dist` alone ranges
 * 0.02..8000), just enough to keep `tNear = max(D-R, 0.02*R)` and
 * `tFar = D+R` from collapsing to the same value when R itself is ~0 (a
 * disc-less category, or dust tuned to a vanishing scale length).
 */
const DUST_REACH_FLOOR = 1e-3;

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
 *  - `'stars'` is the additive SPRITE pass alone, because the reduced-resolution
 *    `aggregateTex` is its own attachment and therefore its own pass. This is
 *    the fill-bound half and the number the divisor / sprite-size knobs move,
 *    so having it isolated is most of the point of the split.
 *  - `'dustMap'` is the dust-column splat — one quad per Gaussian dust
 *    component — into its OWN reduced-resolution `dustMapTex` (cleared, not
 *    loaded), sized to its own `dustDivisor` rather than the field's. Only
 *    encoded when there is dust to splat OR the JWST view needs a fresh map
 *    (`render.dustViewIntensity > 0`, see `drawFrame`'s gate), so the slot
 *    drops on a dustless galaxy exactly like `'field'` drops when the model
 *    is off.
 *  - `'field'` is the analytic Gaussian-mixture splat into `fieldTex` alone —
 *    only encoded when the analytic field is on, so the slot self-drops with
 *    it. The JWST dustPresent pass, into its own `dustViewTex`, now runs
 *    ADDITIONALLY whenever `render.dustViewIntensity > 0` (the three debug
 *    views crossfade rather than replace the normal draw — see
 *    `RenderSettings`), so it carries no `timestampWrites` of its own: two
 *    passes cannot share one timestamp-pair slot in a frame, and giving it a
 *    second slot would grow this list for a presentation pass nobody bills
 *    separately from the field it can now run alongside.
 *  - `'hii'` is the HII tier's own splat — the same `splatPipe`, a different
 *    bind group and target (`hiiTex`, `render.hiiDivisor`) — see `hiiTex`'s
 *    declaration comment for why it cannot share `'field'`'s slot or target.
 *    Only encoded when there is at least one HII component to draw.
 *  - `'scene'` is the full-res HDR pass: the aggregate's additive upsample,
 *    the field's and the HII tier's own upsamples, the dust billboards, and —
 *    each independently, whenever its own crossfade weight is above 0 — the
 *    JWST dust-view upsample, the SF-map diagnostic, and the orientation
 *    diagnostic, all summed additively rather than any one replacing the
 *    others. All share one attachment and so share a pass; separating them
 *    would mean ending the HDR pass and reopening it with `loadOp: 'load'`,
 *    which on a tile-based GPU is a full tile store plus reload of the whole
 *    HDR target — more cost than the measurement is worth, and enough to
 *    corrupt the wall clock that outranks it.
 *  - `'bloom'` is the whole pyramid as ONE span (begin on the bright pass, end
 *    on the fold), which is exactly how the app's frame program bills it (see
 *    `frameProgram.ts`'s `'bloom'` step and `runBloom`). Matching keeps a
 *    number read here comparable to the same number read in the app.
 *
 * `'grade'` only appears on frames where the tool-only grade trailer actually
 * ran; the timing service drops slots whose `descriptorFor` went unconsumed.
 */
const TIMING_SLOTS: readonly string[] = [
  'stars',
  'dustMap',
  'field',
  'hii',
  'scene',
  'bloom',
  'composite',
  'grade',
];

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

/**
 * A single generated extra galaxy: its GPU-filled star/dust vertex buffers,
 * their instance counts, and the per-extra UBO the generation passes read.
 * The UBO is retained (not destroyed right after the generation submit) so its
 * lifetime brackets the vertex buffers it produced — the whole triple is torn
 * down together on the next `setExtras`.
 *
 * `fieldGeometry` + `transform` are cached (like the central galaxy's
 * `fieldGeometry`) so `setFieldTuning` can rebuild `fieldMixture` — this
 * extra's world-space analytic mixture, already carried through
 * `transformGalaxyFieldComponent` — without a regenerate.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
  fieldGeometry: GalaxyFieldGeometry;
  transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
  fieldMixture: readonly GalaxyFieldComponent[];
  /** This extra's own HII tier — see `hiiMixture`'s declaration below for why it rides a separate buffer from `fieldMixture`. */
  hiiMixture: readonly GalaxyFieldComponent[];
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
  // The analytic field's own buffer, own struct — see `packFieldUniforms`.
  // It cannot share the cloud UBO: nothing in the 208-byte cloud layout is a
  // ray, and this pass reads none of the billboard lanes. Camera/params/dust-
  // law only now — the mixture itself rides `fieldCompsBuf` below, a separate
  // storage binding, so this uniform stays `FIELD_HEADER_BUFFER_SIZE`
  // regardless of how many galaxies are on screen.
  const fieldUbo = device.createBuffer({
    label: 'galaxy:fieldUniforms',
    size: FIELD_HEADER_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // `comps` (io.wesl binding 1): every mixture's Gaussians, central galaxy
  // then each extra, already world-transformed — a read-only STORAGE array,
  // not a uniform, specifically so N background extras can push the total
  // component count past a uniform's ~1000-component cap. Grown, never
  // shrunk (see `repackFieldComponents`); starts at
  // `GALAXY_FIELD_MAX_COMPONENTS` so a single central galaxy never forces a
  // regrow on its first `setParams`.
  let fieldCompsCapacity = GALAXY_FIELD_MAX_COMPONENTS;
  let fieldCompsBuf = device.createBuffer({
    label: 'galaxy:fieldComps',
    size: fieldCompsCapacity * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  // The HII tier's own header + storage buffer, byte-identical layout to
  // `fieldUbo`/`fieldCompsBuf` (same `io.wesl` struct, same `splatPipe`) but
  // never concatenated into `fieldCompsBuf` — see research doc §18.1: a
  // shell sprite is small and bright by construction, so sharing the smooth
  // field's coarser target collapsed it into a bloom firefly. Own buffer,
  // own target (`hiiTex`), own divisor (`render.hiiDivisor`). Capacity starts
  // at `HII_MAX_COUNT`, the tier's own per-galaxy admission ceiling
  // (`hiiRegions.ts`), and grows the same never-shrink way `fieldCompsBuf`
  // does once extras are added.
  const hiiUbo = device.createBuffer({
    label: 'galaxy:hiiUniforms',
    size: FIELD_HEADER_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let hiiCompsCapacity = HII_MAX_COUNT;
  let hiiCompsBuf = device.createBuffer({
    label: 'galaxy:hiiComps',
    size: hiiCompsCapacity * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
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

  // ---- splat pipeline (analytic field: one instanced quad per component) ----
  // Draws the closed-form Gaussian-mixture field additively into its OWN
  // reduced-resolution `fieldTex`, which the scene pass upsamples into HDR
  // alongside the sprites' aggregate — so the two representations of the same
  // emission sum. One billboard PER
  // COMPONENT rather than a fullscreen pass over all of them — see
  // `splat.wesl`'s header for why that wins at N~300+ mixtures. No vertex
  // buffers: `quadCorner`/the per-instance `comps` lookup both come off
  // `vertex_index`/`instance_index` alone.
  //
  // Its own module and its own UBO, not a second entry point on the star
  // module: `layout: 'auto'` derives the bind-group layout from the module's
  // entry points, and two pipelines sharing a module that reads the binding
  // with divergent stage visibility fail the group-equivalent check.
  const splatMod = makeShader(splatWgsl, 'galaxy:splat');
  const splatPipe = device.createRenderPipeline({
    label: 'galaxy:splatPipe',
    layout: 'auto',
    vertex: { module: splatMod, entryPoint: 'vs' },
    fragment: {
      module: splatMod,
      entryPoint: 'fs',
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

  // ---- dust-column map pipeline (screen-space dust splat) ----
  // `milkyWayField/dustMap.wesl`: one instanced quad per PRIMARY dust
  // component (splat.wesl's own silhouette math via `lib/splatSilhouette`),
  // additively accumulating four depth-sliced optical depths into
  // `dustMapTex`, at its own divisor-matched resolution (see `dustMapTex`'s
  // declaration below).
  // Replaces splat.wesl's former per-fragment dust loop with a texture read
  // — see splat.wesl's header and the grill-session doc's N1.
  // Its own module (not a second entry point on `splatMod`) and its own
  // pipeline, for the same `layout: 'auto'` reason every other pass pair
  // here is split: two pipelines sharing a module that reads a binding with
  // divergent stage visibility fail the group-equivalent check.
  const dustMapMod = makeShader(dustMapWgsl, 'galaxy:dustMap');
  const dustMapPipe = device.createRenderPipeline({
    label: 'galaxy:dustMapPipe',
    layout: 'auto',
    vertex: { module: dustMapMod, entryPoint: 'vs' },
    fragment: {
      module: dustMapMod,
      entryPoint: 'fs',
      targets: [{ format: DUST_MAP_FORMAT, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // ---- dust-map presentation pipeline ("JWST" view) ----
  // `milkyWayField/dustPresent.wesl`: a fullscreen triangle over `dustMapTex`,
  // mapping its column to a hot palette. Drawn ALONGSIDE `splatPipe`'s
  // emission draw, gated on `render.dustViewIntensity > 0` — see `drawFrame`'s
  // field pass. No blend: it is the pass's only draw into a freshly cleared
  // `dustViewTex`, so a straight overwrite is correct; the crossfade itself
  // happens later, in the scene pass's additive composite.
  const dustPresentMod = makeShader(dustPresentWgsl, 'galaxy:dustPresent');
  const dustPresentPipe = device.createRenderPipeline({
    label: 'galaxy:dustPresentPipe',
    layout: 'auto',
    vertex: { module: dustPresentMod, entryPoint: 'vs' },
    fragment: { module: dustPresentMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' },
  });

  // ---- dust-noise bake: 128^3 ridged-fbm volume, baked ONCE ----
  // dustNoiseBake.wesl — see its header for why ridged (not plain value
  // noise) and why the tileable lattice hash lives inside that file rather
  // than growing a shared lib for one consumer. View- and param-independent
  // (four fixed octave bands, no camera/galaxy input), so this bakes here,
  // once, into its own one-shot encoder — NOT inside `drawFrame`'s.
  // `dustMapMod` already imports `dustNoiseTex`/`dustNoiseSmp` from io.wesl
  // (see dustMap.wesl), which is what gives `dustMapPipe`'s `layout: 'auto'`
  // bind-group layout entries 4/5 below.
  const dustNoiseBakeMod = makeShader(dustNoiseBakeWgsl, 'galaxy:dustNoiseBake');
  const dustNoiseBakePipe = device.createComputePipeline({
    label: 'galaxy:dustNoiseBakePipe',
    layout: 'auto',
    compute: { module: dustNoiseBakeMod, entryPoint: 'cs' },
  });
  const dustNoiseTex = device.createTexture({
    label: 'galaxy:dustNoiseTex',
    size: [DUST_NOISE_TEX_SIZE, DUST_NOISE_TEX_SIZE, DUST_NOISE_TEX_SIZE],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  // 'repeat' on all three axes is what makes the bake tile seamlessly in
  // world space: dustMap.wesl samples at world-position / tileUnits with no
  // manual wrap, relying entirely on this addressing mode.
  const dustNoiseSampler = device.createSampler({
    label: 'galaxy:dustNoiseSampler',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // splat.wesl's own sampler for `dustMapTex` (io.wesl binding 6) — a plain
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
  {
    const bakeBG = device.createBindGroup({
      label: 'galaxy:dustNoiseBakeBG',
      layout: dustNoiseBakePipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: dustNoiseTex.createView() }],
    });
    const bakeEnc = device.createCommandEncoder({ label: 'galaxy:dustNoiseBake' });
    const bakePass = bakeEnc.beginComputePass({ label: 'galaxy:dustNoiseBakePass' });
    bakePass.setPipeline(dustNoiseBakePipe);
    bakePass.setBindGroup(0, bakeBG);
    const dispatch = DUST_NOISE_TEX_SIZE / DUST_NOISE_WORKGROUP_SIZE;
    bakePass.dispatchWorkgroups(dispatch, dispatch, dispatch);
    bakePass.end();
    device.queue.submit([bakeEnc.finish()]);
  }

  // ---- SSPSF star-formation automaton (sfMap): pipelines + persistent textures ----
  // Grid is fixed (SF_MAP_AZ x SF_MAP_RINGS, galaxySfMapArmForcing.ts), so
  // every texture here is allocated ONCE — unlike dustMapTex/fieldTex, none
  // of them are canvas-size-dependent. See rebuildSfMap (below setParams)
  // for the dispatch loop and its triggers.
  const sfMapStepMod = makeShader(sfMapStepWgsl, 'galaxy:sfMapStep');
  const sfMapStepPipe = device.createComputePipeline({
    label: 'galaxy:sfMapStepPipe',
    layout: 'auto',
    compute: { module: sfMapStepMod, entryPoint: 'cs' },
  });
  const sfMapPackMod = makeShader(sfMapPackWgsl, 'galaxy:sfMapPack');
  const sfMapPackPipe = device.createComputePipeline({
    label: 'galaxy:sfMapPackPipe',
    layout: 'auto',
    compute: { module: sfMapPackMod, entryPoint: 'cs' },
  });
  const sfMapPresentMod = makeShader(sfMapPresentWgsl, 'galaxy:sfMapPresent');
  const sfMapPresentPipe = device.createRenderPipeline({
    label: 'galaxy:sfMapPresentPipe',
    layout: 'auto',
    vertex: { module: sfMapPresentMod, entryPoint: 'vs' },
    // Additive, not a bare overwrite: this pass now draws straight into the
    // scene pass's `sceneTex` (see `drawFrame`'s scene pass), which already
    // carries any background extras' sprite glow by the time this draw runs
    // — a replace blend would erase them under the diagnostic. Against a
    // freshly-cleared target (this shader's ONLY other era, before this
    // change) additive and replace are identical, since the destination
    // starts at zero — so this is a strict fix, not a behaviour trade.
    fragment: {
      module: sfMapPresentMod,
      entryPoint: 'fs',
      targets: [{ format: HDR, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // 'repeat' in U (azimuth wraps at theta=0/2*PI), 'clamp-to-edge' in V
  // (radius does not) — sfMapPresent.wesl's fs resamples through this.
  const sfMapPresentSampler = device.createSampler({
    label: 'galaxy:sfMapPresentSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // The arm-forcing field, baked CPU-side (galaxySfMapArmForcing.ts) from the
  // SAME ridge functions the sprite/analytic arms use — never re-derived in
  // WGSL. Content rewritten every rebuildSfMap; the texture object itself
  // never resizes.
  const sfMapArmForcingTex = device.createTexture({
    label: 'galaxy:sfMapArmForcingTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Ping-pong state: (gasFraction, ageSinceIgnition, refractoryTimer,
  // oldActivityEma). Both need BOTH usages — each alternates between being
  // the step's read source (texture_2d, TEXTURE_BINDING) and its write
  // target (texture_storage_2d, STORAGE_BINDING) from one step to the next.
  const makeSfMapStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const sfMapStateA = makeSfMapStateTex('galaxy:sfMapStateA');
  const sfMapStateB = makeSfMapStateTex('galaxy:sfMapStateB');
  // The packed, presentable output (sfMapPack.wesl): gas / recent SF / older
  // SF. Exposed on the engine handle (getSfMapTexture) for the sibling UI
  // and future consumers — see the research doc §19's staging note. COPY_SRC
  // is for `scheduleSfMapReadback`'s CPU readback (getSfMapData) below.
  const sfMapTex = device.createTexture({
    label: 'galaxy:sfMapTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of 256.
  // 768px * 4 bytes = 3072 already is, but this is computed rather than
  // hard-coded so a future grid width that ISN'T a clean multiple doesn't
  // silently corrupt the readback — `scheduleSfMapReadback` copies out only
  // the first `SF_MAP_AZ * 4` bytes of each padded row, so the padding (if
  // any) never leaks into `GalaxySfMap.data`.
  const SF_MAP_READBACK_BYTES_PER_ROW = Math.ceil((SF_MAP_AZ * 4) / 256) * 256;
  const sfMapReadbackBuf = device.createBuffer({
    label: 'galaxy:sfMapReadbackBuf',
    size: SF_MAP_READBACK_BYTES_PER_ROW * SF_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // Constant-across-one-rebuild parameters (rMin/rMax + every sfMap tuning
  // knob) — rewritten once per rebuildSfMap, unlike sfMapStepIndexBuf below.
  const sfMapConstUbo = device.createBuffer({
    label: 'galaxy:sfMapConstUbo',
    size: 64, // 16 f32 lanes (13 used) — see SfMapConstants in sfMapStep.wesl
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // rMin/rMax only — sfMapPresent.wesl's own small uniform, separate from
  // io.wesl's per-frame 'u' (camera) since these two change on entirely
  // different cadences (rebuild vs every frame).
  const sfMapGridUbo = device.createBuffer({
    label: 'galaxy:sfMapGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // sfMapPack.wesl's own un-shear parameters (SfMapUnshear) — rMin/rMax +
  // the same corotation/shear knobs sfMapConstUbo carries, plus
  // totalShiftSteps (steps - 1, see rebuildSfMap). A separate buffer from
  // sfMapConstUbo because pack runs in its OWN bind group / pipeline, after
  // every step dispatch has already used sfMapConstUbo's bind group layout.
  const sfMapPackConstUbo = device.createBuffer({
    label: 'galaxy:sfMapPackConstUbo',
    size: 32, // 8 f32 lanes (5 used) — see SfMapUnshear in sfMapPack.wesl
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Holds every step's own index, one SfMapStepIndex-sized (4-byte) slot per
  // step, each padded out to the device's own uniform offset alignment — see
  // rebuildSfMap for why a per-step BIND GROUP (static offset into this one
  // buffer) replaces what would otherwise need `steps` separate
  // writeBuffer+submit round trips. Reallocated in rebuildSfMap to match the
  // live `steps` count; null until the first rebuild.
  let sfMapStepIndexBuf: GPUBuffer | null = null;
  // Presentation bind group: io.wesl's per-frame camera uniform (fieldUbo,
  // already written every drawFrame) plus this pass's own three bindings.
  // Built once — sfMapTex/sfMapGridUbo are the same GPU objects for the
  // engine's whole lifetime, only their CONTENT changes per rebuild, and a
  // bind group only needs rebuilding when the OBJECT it references does.
  const sfMapPresentBG = device.createBindGroup({
    label: 'galaxy:sfMapPresentBG',
    layout: sfMapPresentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: fieldUbo } },
      { binding: 1, resource: sfMapTex.createView() },
      { binding: 2, resource: sfMapPresentSampler },
      { binding: 3, resource: { buffer: sfMapGridUbo } },
    ],
  });

  // ---- orientation overlay: GPU structure-tensor pass chain ----
  // Unlike the old CPU build (buildSfMapOrientation.ts, deleted), this
  // texture's content comes entirely from compute passes over sfMapTex — no
  // readback, no JS blur, no upload back. rebuildSfMapOrientationIfNeeded
  // (below scheduleSfMapReadback) is still the perf gate that keeps the
  // chain off by default, cheap as it now is, so an unrelated render-bag
  // push can't redispatch it. Pipeline/sampler/texture/bind group are all
  // built unconditionally at construction, same as every other sfMap
  // resource — only the DISPATCH is gated, not the objects.
  const orientationPresentMod = makeShader(orientationPresentWgsl, 'galaxy:orientationPresent');
  const orientationPresentPipe = device.createRenderPipeline({
    label: 'galaxy:orientationPresentPipe',
    layout: 'auto',
    vertex: { module: orientationPresentMod, entryPoint: 'vs' },
    // Additive into sceneTex, same reasoning as sfMapPresentPipe: this draw
    // must sum with whatever background extras' sprites already put there.
    fragment: {
      module: orientationPresentMod,
      entryPoint: 'fs',
      targets: [{ format: HDR, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // Bilinear sampling is safe here BECAUSE the two channels are the packed
  // (cos2theta, sin2theta) double-angle vector, not a bare angle — only that
  // representation interpolates across the pi wrap without a false
  // zero-crossing (a filament has no head/tail).
  const orientationSampler = device.createSampler({
    label: 'galaxy:orientationSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // rgba16float, not rg16float: WebGPU core only guarantees WRITE-access
  // storage textures for r32/rgba8/rgba16/rgba32 formats, not 2-component
  // ones, and sfMapOrientationCoherence.wesl's final pass writes this
  // directly (no more CPU upload) — see that shader's own header. .zw sit
  // unused; orientationPresent.wesl reads only .xy either way. COPY_SRC is
  // for `scheduleOrientationReadback`'s CPU readback, same role
  // `sfMapTex`'s own COPY_SRC plays for `scheduleSfMapReadback`.
  const orientationTex = device.createTexture({
    label: 'galaxy:orientationTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // rgba16float = 4 lanes * 2 bytes; only .xy (cos2theta, sin2theta) are
  // read back, .zw are copied along for free since a texture copy can't
  // pick channels. Computed rather than hard-coded for the same reason
  // `SF_MAP_READBACK_BYTES_PER_ROW` is: 768*8=6144 already is a multiple of
  // 256, but a future grid width might not be.
  const ORIENTATION_READBACK_BYTES_PER_ROW = Math.ceil((SF_MAP_AZ * 8) / 256) * 256;
  const orientationReadbackBuf = device.createBuffer({
    label: 'galaxy:orientationReadbackBuf',
    size: ORIENTATION_READBACK_BYTES_PER_ROW * SF_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // rMin/rMax only, same shape as sfMapGridUbo — written once per
  // rebuildSfMapOrientationIfNeeded, not every frame. Doubles as
  // sfMapOrientationTensorPipe's own grid uniform (the aspect weight needs
  // the same rMin/rMax the present shader's ray-mapping does) — one buffer,
  // bound into two different pipelines' bind groups, not two objects to
  // keep in sync.
  const orientationGridUbo = device.createBuffer({
    label: 'galaxy:orientationGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const orientationPresentBG = device.createBindGroup({
    label: 'galaxy:orientationPresentBG',
    layout: orientationPresentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: fieldUbo } },
      { binding: 1, resource: orientationTex.createView() },
      { binding: 2, resource: orientationSampler },
      { binding: 3, resource: { buffer: orientationGridUbo } },
    ],
  });

  // ---- the pass chain itself: field blur -> tensor -> tensor blur -> coherence ----
  // Every intermediate texture is SF_MAP_AZ x SF_MAP_RINGS, allocated once
  // (never resized, same discipline as sfMapStateA/B) and given BOTH
  // TEXTURE_BINDING (the next pass reads it) and STORAGE_BINDING (this
  // pass writes it) usage. r32float for the single-channel field stage,
  // rgba16float for the packed-tensor stage — both are core-guaranteed
  // write-access storage formats (see orientationTex's own comment).
  const makeOrientationScratch = (label: string, format: GPUTextureFormat): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
  const orientationFieldBlurTex = makeOrientationScratch(
    'galaxy:orientationFieldBlurTex',
    'r32float',
  );
  const orientationFieldSmoothTex = makeOrientationScratch(
    'galaxy:orientationFieldSmoothTex',
    'r32float',
  );
  const orientationTensorRawTex = makeOrientationScratch(
    'galaxy:orientationTensorRawTex',
    'rgba16float',
  );
  const orientationTensorBlurTex = makeOrientationScratch(
    'galaxy:orientationTensorBlurTex',
    'rgba16float',
  );
  const orientationTensorFinalTex = makeOrientationScratch(
    'galaxy:orientationTensorFinalTex',
    'rgba16float',
  );
  // sigmaDeriv/sigmaInteg only — see RenderSettings's own doc on why the
  // pass chain wants two, not one: a small derivative scale suppresses
  // noise before the gradient, a larger integration scale (2-3x it,
  // conventionally) averages orientations after the tensor is built.
  const sfMapOrientationSigmaUbo = device.createBuffer({
    label: 'galaxy:sfMapOrientationSigmaUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const sfMapOrientationFieldMod = makeShader(
    sfMapOrientationFieldWgsl,
    'galaxy:sfMapOrientationField',
  );
  const sfMapOrientationFieldBlurAzimuthPipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationFieldBlurAzimuthPipe',
    layout: 'auto',
    compute: { module: sfMapOrientationFieldMod, entryPoint: 'csBlurAzimuth' },
  });
  const sfMapOrientationFieldBlurRingPipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationFieldBlurRingPipe',
    layout: 'auto',
    compute: { module: sfMapOrientationFieldMod, entryPoint: 'csBlurRing' },
  });
  const sfMapOrientationTensorMod = makeShader(
    sfMapOrientationTensorWgsl,
    'galaxy:sfMapOrientationTensor',
  );
  const sfMapOrientationTensorPipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationTensorPipe',
    layout: 'auto',
    compute: { module: sfMapOrientationTensorMod, entryPoint: 'cs' },
  });
  const sfMapOrientationTensorBlurMod = makeShader(
    sfMapOrientationTensorBlurWgsl,
    'galaxy:sfMapOrientationTensorBlur',
  );
  const sfMapOrientationTensorBlurAzimuthPipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationTensorBlurAzimuthPipe',
    layout: 'auto',
    compute: { module: sfMapOrientationTensorBlurMod, entryPoint: 'csBlurAzimuth' },
  });
  const sfMapOrientationTensorBlurRingPipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationTensorBlurRingPipe',
    layout: 'auto',
    compute: { module: sfMapOrientationTensorBlurMod, entryPoint: 'csBlurRing' },
  });
  const sfMapOrientationCoherenceMod = makeShader(
    sfMapOrientationCoherenceWgsl,
    'galaxy:sfMapOrientationCoherence',
  );
  const sfMapOrientationCoherencePipe = device.createComputePipeline({
    label: 'galaxy:sfMapOrientationCoherencePipe',
    layout: 'auto',
    compute: { module: sfMapOrientationCoherenceMod, entryPoint: 'cs' },
  });

  // One bind group per pipeline ('auto' layouts never cross pipelines, even
  // where the bindings are structurally identical) — built once, since
  // every resource here is allocated for the engine's whole lifetime.
  const sfMapOrientationFieldBlurAzimuthBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationFieldBlurAzimuthBG',
    layout: sfMapOrientationFieldBlurAzimuthPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sfMapTex.createView() },
      { binding: 1, resource: orientationFieldBlurTex.createView() },
      { binding: 2, resource: { buffer: sfMapOrientationSigmaUbo } },
    ],
  });
  const sfMapOrientationFieldBlurRingBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationFieldBlurRingBG',
    layout: sfMapOrientationFieldBlurRingPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: orientationFieldBlurTex.createView() },
      { binding: 1, resource: orientationFieldSmoothTex.createView() },
      { binding: 2, resource: { buffer: sfMapOrientationSigmaUbo } },
    ],
  });
  const sfMapOrientationTensorBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationTensorBG',
    layout: sfMapOrientationTensorPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: orientationFieldSmoothTex.createView() },
      { binding: 1, resource: orientationTensorRawTex.createView() },
      { binding: 2, resource: { buffer: orientationGridUbo } },
    ],
  });
  const sfMapOrientationTensorBlurAzimuthBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationTensorBlurAzimuthBG',
    layout: sfMapOrientationTensorBlurAzimuthPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: orientationTensorRawTex.createView() },
      { binding: 1, resource: orientationTensorBlurTex.createView() },
      { binding: 2, resource: { buffer: sfMapOrientationSigmaUbo } },
    ],
  });
  const sfMapOrientationTensorBlurRingBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationTensorBlurRingBG',
    layout: sfMapOrientationTensorBlurRingPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: orientationTensorBlurTex.createView() },
      { binding: 1, resource: orientationTensorFinalTex.createView() },
      { binding: 2, resource: { buffer: sfMapOrientationSigmaUbo } },
    ],
  });
  const sfMapOrientationCoherenceBG = device.createBindGroup({
    label: 'galaxy:sfMapOrientationCoherenceBG',
    layout: sfMapOrientationCoherencePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: orientationTensorFinalTex.createView() },
      { binding: 1, resource: orientationTex.createView() },
    ],
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
  // The analytic field's Gaussian mixture for the CENTRAL galaxy — rebuilt in
  // `setParams` from the same derived geometry generation just ran with, so it
  // tracks every preset/knob change the sprites do. Empty until the first
  // `setParams`, which draws a field of zero components: nothing, not stale.
  let fieldMixture: readonly GalaxyFieldComponent[] = [];
  // Cached alongside the mixture so `setFieldTuning` can rebuild it without a
  // regenerate: null until the first `setParams`, at which point every later
  // `setFieldTuning` call rebuilds from this same geometry. A tuning change
  // that arrives before any `setParams` just updates `fieldTuning` below —
  // the next `setParams` reads it and there is nothing yet to rebuild.
  let fieldGeometry: GalaxyFieldGeometry | null = null;
  let fieldTuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING;
  // The CENTRAL galaxy's HII tier, built and cached the same way
  // `fieldMixture` is — but never concatenated into it (see `hiiTex`'s
  // declaration comment). Rebuilt on the same two triggers, packed into its
  // own `hiiCompsBuf` by `repackHiiComponents`.
  let hiiMixture: readonly GalaxyFieldComponent[] = [];
  // The analytic dust lane's mixture, CENTRAL galaxy only (grill session Q6:
  // extras get dust in a follow-up, zero rework — the packed layout already
  // carries per-galaxy dustOffset/dustCount). Cached like `fieldMixture` so
  // `setFieldTuning` can rebuild it without a regenerate.
  let dustMixture: readonly GalaxyFieldComponent[] = [];
  // The dust params `setParams` was last handed — `setFieldTuning` has no
  // `GalaxyParams` of its own, so a dustEnabled toggle needs this cached copy
  // to rebuild `dustMixture` without a regenerate.
  let currentDust: GalaxyDustParams = DEFAULT_GALAXY_DUST_PARAMS;
  // The CCM89 law for `currentDust.rV`, cached alongside it (recomputed in
  // `rebuildDustMixture`, not per frame in `drawFrame`) — `packFieldHeaderUniforms`
  // needs this every frame now that the primary galaxy's attenuation reads
  // it from the header rather than a per-component colour lane (see
  // io.wesl's dust-component comment).
  let currentDustExtinctionRgb = dustExtinctionRgb(DEFAULT_GALAXY_DUST_PARAMS.rV);
  // The dust-noise erosion lane (io.wesl's `dustNoise`), cached alongside
  // `currentDustExtinctionRgb` for the same reason — `packFieldHeaderUniforms`
  // needs it every `drawFrame` but it only changes when `rebuildDustMixture`
  // runs. `cloudOffset` is the length of `buildGalaxyDustMixture(...)`'s
  // return — captured where `rebuildDustMixture` concatenates the two
  // mixtures below, never recomputed by filtering `dustMixture` back apart.
  let currentDustNoise: FieldDustNoise = {
    tileUnits: 1,
    amplitude: 0,
    cloudOffset: 0,
    contrastExp: 1,
  };
  // The dust's own reach R (io.wesl's dustSlices doc): 3x the widest smooth
  // disc component's radial sigma, cached here for the same reason
  // `currentDustNoise` is — `drawFrame` needs it every frame (it feeds the
  // VIEW-dependent slice edges, which DO change every frame with the
  // camera), but R itself only changes when `rebuildDustMixture` runs.
  // Floored well above 0 so a disc-less galaxy (diskScaleLen 0) can't
  // collapse the geometric slice spacing below to a degenerate 0-width band.
  let currentDustReachR = DUST_REACH_FLOOR;
  // `(params.seed ?? 0) | 0 || 1` is `packGenerationUniforms`'s own seed
  // normalisation; cached here for the same reason `currentDust` is — a
  // `setFieldTuning` rebuild has no `GalaxyParams` of its own to re-read it from.
  let currentSeed = 1;
  // The SSPSF automaton's CPU-side readback (`scheduleSfMapReadback`), null
  // until the first one lands OR whenever a NEW galaxy's `setParams` has made
  // the previous readback's grid (rMin/rMax, tied to `fieldGeometry`) stale —
  // see setParams's own comment on why it nulls this before rebuilding dust.
  let sfMapData: GalaxySfMap | null = null;
  // Bumped by every `scheduleSfMapReadback` call; a landing promise checks it
  // against its own captured value before touching `sfMapData`; a mismatch
  // means a LATER rebuild superseded this one, so the result is stale and
  // dropped rather than clobbering data a still-pending later readback is
  // about to overwrite anyway.
  let sfMapReadbackToken = 0;
  // Serializes readbacks: `sfMapReadbackBuf.mapAsync` throws if called while
  // the buffer is still mapped from a PREVIOUS readback, and a fast
  // setFieldTuning slider drag on `sfMap.*` can call rebuildSfMap again
  // before the last one's map lands. Each call chains onto this promise
  // instead of racing it. `scheduleOrientationReadback` chains onto this
  // SAME promise (not a second chain of its own) — both copy operations
  // then serialize through one queue, which is what keeps an overlapping
  // sfMap rebuild from submitting into a buffer either one still has mapped.
  let sfMapReadbackChain: Promise<void> = Promise.resolve();
  // `orientationTex`'s CPU-side readback (`scheduleOrientationReadback`),
  // same lifecycle as `sfMapData` above but its own token: the orientation
  // chain dispatches independently of the sfMap one (`setRender`'s
  // `orientationViewIntensity` crossing 0, or `setFieldTuning`'s
  // `sfMapDustSeeding` toggle, neither of which touch `sfMapData`), so
  // sharing one token would let an unrelated trigger wrongly supersede a
  // still-pending readback.
  let orientationData: GalaxySfMapOrientation | null = null;
  let orientationReadbackToken = 0;
  // The three `OrientationDiagnostics` numbers `reportOrientationDiagnostics`
  // hands to `opts.onOrientationDiagnostics` — see that function's own
  // comment for why coherence is computed once here (readback landing) while
  // the delta pair is computed once per `rebuildDustMixture` instead.
  let orientationCoherenceMean = 0;
  let orientationCoherenceMax = 0;
  let lastDustDeltaMeanDeg = 0;
  let lastDustDeltaMaxDeg = 0;

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
  // The auto-layout bind group reading `fieldUbo` + `fieldCompsBuf` (see
  // `starBG`/`dustBG`'s comment just above: a bind group is built against
  // ONE pipeline's `layout: 'auto'` GPUBindGroupLayout and fails another
  // pipeline's draw-time compatibility check even for a byte-identical WGSL
  // binding). `let`, not `const`: `fieldCompsBuf` grows (see
  // `repackFieldComponents`), and a bind group is bound to the specific
  // GPUBuffer it was built against — a resized buffer needs a new group.
  //
  // `dustMapBG` (dustMap.wesl's own pass — reads only `fieldUbo` +
  // `fieldCompsBuf`, same two bindings, its own pipeline) can build eagerly
  // right here, same as the old `splatBG` used to. `splatBG` itself cannot:
  // splat.wesl's fs now ALSO reads `dustMapTex` (binding 2), which does not
  // exist yet at this point in construction — its first build is deferred to
  // `buildDustMapTarget()` below, alongside `dustPresentBG` (dustMapTex is
  // that bind group's ONLY binding). All three rebuild in
  // `repackFieldComponents`'s regrow branch when `fieldCompsBuf` grows;
  // `splatBG`/`dustPresentBG` rebuild again whenever `dustMapTex` itself is
  // recreated (`buildDustMapTarget`, on every resize).
  // Bindings 4/5 (dustNoiseTex/dustNoiseSmp) go ONLY here: dustMap.wesl is
  // the one shader among the three that share io.wesl (splat/dustMap/
  // dustPresent) that actually imports them — `layout: 'auto'` derives each
  // pipeline's bind-group layout from what its OWN shader references.
  // `dustPresentBG` now also imports `u` (binding 0) alongside `dustMapTex`
  // (binding 2) — it needs `debugView.x`, the JWST view's own crossfade
  // weight, now that this pass runs ALONGSIDE the emission splat rather than
  // replacing it (see `drawFrame`'s field-pass region). Binding 6
  // (dustMapSmp) goes ONLY into `splatBG` below, for the mirror-image
  // reason: splat.wesl's fs is the one reader that samples `dustMapTex`
  // through a filtered UV rather than a 1:1 load — see `dustMapTex`'s own
  // declaration comment.
  let dustMapBG = buildDustMapBindGroup();
  function buildDustMapBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:dustMapBG',
      layout: dustMapPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 1, resource: { buffer: fieldCompsBuf } },
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
      ],
    });
  }
  let splatBG: GPUBindGroup;
  function buildSplatBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:splatBG',
      layout: splatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 1, resource: { buffer: fieldCompsBuf } },
        { binding: 2, resource: dustMapTex.createView() },
        // Binding 6: dustMapSmp — splat.wesl's fs now samples dustMapTex
        // through a filtered UV rather than a 1:1 texel load (see
        // dustMapTex's own declaration comment for why the divisors split).
        { binding: 6, resource: dustMapSampler },
      ],
    });
  }
  let dustPresentBG: GPUBindGroup;
  function buildDustPresentBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:dustPresentBG',
      layout: dustPresentPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 2, resource: dustMapTex.createView() },
      ],
    });
  }
  // The HII pass reuses `splatPipe` itself (same shader, same emission math),
  // just against its own header/storage buffers and its own target — a
  // second bind group for the SAME pipeline, exactly the `layout: 'auto'`
  // pattern `starBG`/`dustBG` already establish for two passes sharing one
  // pipeline object. `dustMapTex`/`dustMapSampler` are still bound (splat.wesl's
  // fs imports both unconditionally), but `packFieldHeaderUniforms`'s
  // `primaryCount` is always packed 0 for this header (see `drawFrame`), so
  // the dust-attenuation branch never triggers — HII does not (yet) darken
  // under the lane it may sit inside.
  let hiiBG: GPUBindGroup;
  function buildHiiBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:hiiBG',
      layout: splatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: hiiUbo } },
        { binding: 1, resource: { buffer: hiiCompsBuf } },
        { binding: 2, resource: dustMapTex.createView() },
        { binding: 6, resource: dustMapSampler },
      ],
    });
  }

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
  /**
   * The analytic field's OWN reduced-resolution target, deliberately not the
   * star aggregate. Both are additive glow folded into HDR by the same
   * upsample, but their spatial frequency is not the same: sprites carry
   * point-like detail that a coarse divisor destroys, while the field is a
   * sum of wide Gaussians that survives 5x downsampling with no visible
   * change. Sharing one target forced the field to pay the sprites' pixel
   * rate — and it is FILL-bound, so that was most of its cost.
   */
  let fieldTex: GPUTexture;
  /**
   * The dust-column map (see dustMap.wesl): screen-space, four depth-sliced
   * optical-depth channels (io.wesl's dustSlices doc) accumulated for the
   * primary galaxy's dust slice. Sized to ITS OWN divisor,
   * `reducedSize(render.dustDivisor)` — much finer than fieldTex's, because
   * the dust splat carries far higher-frequency structure than the smooth
   * emission field it used to share a target with (that sharing once
   * decimated thin lanes into beads — see `buildDustMapTarget`). dustPresent.wesl (the JWST view) still reads
   * it via a 1:1 `input.pos.xy` texel lookup, but into its OWN divisor-
   * matched target (`dustViewTex`, not `fieldTex` — see `buildDustViewTarget`);
   * splat.wesl's fs, which runs at fieldTex's coarser resolution, instead
   * samples it through a linear sampler (`dustMapSmp`) at a normalized UV —
   * see splat.wesl's fs comment for why that is a deliberate, imperfect
   * trade rather than an oversight.
   */
  let dustMapTex: GPUTexture;
  /**
   * The HII tier's own target, sized to ITS OWN divisor,
   * `reducedSize(render.hiiDivisor)` — defaults to the canvas itself (1), not
   * `fieldTex`'s coarser one. A shell sprite is small and bright by
   * construction: sharing the field's target once collapsed a whole sprite's
   * flux onto one texel and bloom promoted the spike into a firefly
   * (research doc §18.1 — the SAME shape as the bug that split off
   * `dustMapTex`, one tenant later). Drawn by `splatPipe` again (`hiiBG`),
   * composited into HDR through the same `aggregateUpsample` the field and
   * star aggregate use.
   */
  let hiiTex: GPUTexture;
  /**
   * Whether `dustMapTex` currently holds anything but zeros. `drawFrame` skips
   * the dust-map pass when there is no dust to draw, and a skipped pass leaves
   * the last frame's contents — so this is what lets the skip stay correct
   * across the nonzero -> zero transition (an elliptical, or tau pulled to 0)
   * instead of stranding the previous galaxy's dust in front of the new one.
   */
  let dustMapPopulated = false;
  /**
   * The JWST-view's own presentation target (dustPresent.wesl), divisor-
   * matched to `dustMapTex` rather than `fieldTex` — see `dustMapTex`'s own
   * comment above. Only drawn into while `render.dustViewIntensity` is above
   * 0; the scene pass sums it additively alongside `fieldTex` when it ran
   * this frame (see `drawFrame`).
   */
  let dustViewTex: GPUTexture;
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
  const reducedSize = (scale: number): Vec2 => [
    Math.max(1, Math.floor(canvas.width / scale)),
    Math.max(1, Math.floor(canvas.height / scale)),
  ];

  // Split out of `buildTargets` because the divisor is a live slider: moving it
  // has to reallocate this one target without disturbing the scene, the LDR
  // scratch, or the bloom pyramid. Reallocating outright (rather than pooling a
  // few sizes) is the right trade for a 1..6 integer knob dragged by hand.
  function buildAggregateTarget(): void {
    const [w, h] = reducedSize(render.aggregateDivisor);
    if (aggregateTex) aggregateTex.destroy();
    aggregateTex = device.createTexture({
      label: 'galaxy:aggregateTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
  }

  function buildFieldTarget(): void {
    const [w, h] = reducedSize(render.fieldDivisor);
    if (fieldTex) fieldTex.destroy();
    fieldTex = device.createTexture({
      label: 'galaxy:fieldTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
  }

  // Recreated on resize AND whenever `render.dustDivisor` moves (see
  // `setRender`) — its OWN divisor now, independent of `fieldTex`'s (see
  // `dustMapTex`'s declaration comment for why the dust splat outgrew
  // sharing the field's coarser target). Every bind group that references
  // `dustMapTex` is tied to the specific GPUTexture it was built against
  // (same `layout: 'auto'` discipline as every other bind group here), so a
  // recreation has to rebuild all three immediately, not wait for the next
  // `repackFieldComponents`/`repackHiiComponents`.
  function buildDustMapTarget(): void {
    const [w, h] = reducedSize(render.dustDivisor);
    if (dustMapTex) dustMapTex.destroy();
    dustMapTex = device.createTexture({
      label: 'galaxy:dustMapTex',
      size: [w, h],
      format: DUST_MAP_FORMAT,
      usage: RA_TB,
    });
    splatBG = buildSplatBindGroup();
    hiiBG = buildHiiBindGroup();
    dustPresentBG = buildDustPresentBindGroup();
    // A fresh texture is zero-initialised, so the stale-map latch resets with it.
    dustMapPopulated = false;
  }

  // dustPresent.wesl's own target, sized like `dustMapTex` (same divisor) so
  // its 1:1 texel read stays valid now that `dustMapTex` no longer shares
  // `fieldTex`'s extent — see `dustMapTex`'s declaration comment. Rebuilt on
  // the same two triggers as `dustMapTex`: resize and `render.dustDivisor`.
  function buildDustViewTarget(): void {
    const [w, h] = reducedSize(render.dustDivisor);
    if (dustViewTex) dustViewTex.destroy();
    dustViewTex = device.createTexture({
      label: 'galaxy:dustViewTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
  }

  // Split out for the same reason `buildAggregateTarget`/`buildFieldTarget`
  // are: `render.hiiDivisor` is its own live slider, and moving it must
  // reallocate only this target. Does not rebuild `hiiBG` — that bind group
  // references `hiiUbo`/`hiiCompsBuf`/`dustMapTex`, none of which this
  // function touches, not `hiiTex` itself (the render PASS binds `hiiTex` as
  // its attachment view, freshly, every `drawFrame`).
  function buildHiiTarget(): void {
    const [w, h] = reducedSize(render.hiiDivisor);
    if (hiiTex) hiiTex.destroy();
    hiiTex = device.createTexture({
      label: 'galaxy:hiiTex',
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
    buildFieldTarget();
    buildDustMapTarget();
    buildDustViewTarget();
    buildHiiTarget();
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
  const fieldData = new Float32Array(FIELD_HEADER_FLOATS);
  const hiiData = new Float32Array(FIELD_HEADER_FLOATS);
  const gradeData = new Float32Array(4);

  // The HII header's dust lanes are always inert (see `hiiBG`'s comment:
  // `primaryCount` below is packed 0, so splat.wesl's fs never takes the
  // attenuation branch that would read them) — one shared zero value rather
  // than a fresh object built every `drawFrame`.
  const HII_INERT_DUST_NOISE: FieldDustNoise = {
    tileUnits: 1,
    amplitude: 0,
    cloudOffset: 0,
    contrastExp: 1,
  };
  const HII_INERT_DUST_SLICES: FieldDustSlices = { t1: 0, t2: 0, t3: 0 };
  const HII_INERT_DUST_EXTINCTION: Vec3 = [0, 0, 0];

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

  // The live counts from the last `repackFieldComponents` concatenation —
  // NOT `fieldCompsCapacity` (which only grows, and can outsize the current
  // total after extras shrink). `fieldEmissionCount` is what `drawFrame`'s
  // splat draw call instances (dust rides the same buffer but is never drawn
  // as its own quad); `fieldPrimaryCount`/`fieldDustCount` locate the central
  // galaxy's dust slice for the header pack's `counts` lanes.
  let fieldEmissionCount = 0;
  let fieldPrimaryCount = 0;
  let fieldDustCount = 0;
  // The live total from the last `repackHiiComponents` concatenation — same
  // "not the capacity" caveat as `fieldEmissionCount` above. What `drawFrame`
  // instances for the HII pass, and what gates whether that pass (and its
  // composite into HDR) runs at all this frame.
  let hiiEmissionCount = 0;

  /**
   * scheduleSfMapReadback — the ONE-PER-GENERATION CPU copy of `sfMapTex`
   * (research doc §19's staged architecture: never a per-frame readback,
   * never a CPU mirror of the automaton). Called from `rebuildSfMap`'s own
   * two exits with the grid it just wrote, so `GalaxySfMap.rMin/rMax` always
   * matches the CONTENT being copied.
   *
   * Does not block the caller: the ENTIRE copy/submit/map/unmap sequence is
   * chained onto `sfMapReadbackChain`, so overlapping rebuilds (a dragged
   * slider) can neither submit into nor map a buffer another readback still
   * holds. Chaining only `mapAsync` is not enough and was the original bug.
   *
   * DETERMINISM: `sfMapData` lands asynchronously, so the dust mixture built
   * synchronously inside `setParams`/`setFieldTuning` (which both run BEFORE
   * this promise can resolve — a GPU readback always crosses at least one
   * frame) never sees the map from the rebuild that triggered it. Rather
   * than defer the dust build until a map is ready (which would leave a
   * blank tool on first load), this REBUILDS the dust mixture a second time
   * once the map lands, gated on the same `sfMapDustSeeding` flag. Either
   * choice reaches the same final state for a given (params, tuning, seed);
   * this one keeps the tool always showing something.
   */
  function scheduleSfMapReadback(grid: GalaxySfMapGridRadius): void {
    const token = ++sfMapReadbackToken;
    sfMapReadbackChain = sfMapReadbackChain
      .then(async () => {
        // The copy and the submit belong INSIDE the chain. Running them
        // eagerly serialized the mapping but not the submitting, so a second
        // rebuild (a dragged slider) submitted into a buffer the first had
        // mapped and not yet unmapped — 'used in submit while mapped'.
        //
        // Returning here rather than submitting also coalesces a drag down to
        // one readback instead of one per dragged frame: every superseded
        // rebuild skips the GPU work entirely. Grid/content stay paired
        // because the copy now happens immediately before its own map, and
        // rebuildSfMap always re-tokens when it re-renders the texture.
        if (token !== sfMapReadbackToken) return;
        const enc = device.createCommandEncoder({ label: 'galaxy:sfMapReadback' });
        enc.copyTextureToBuffer(
          { texture: sfMapTex },
          {
            buffer: sfMapReadbackBuf,
            bytesPerRow: SF_MAP_READBACK_BYTES_PER_ROW,
            rowsPerImage: SF_MAP_RINGS,
          },
          [SF_MAP_AZ, SF_MAP_RINGS, 1],
        );
        device.queue.submit([enc.finish()]);

        await sfMapReadbackBuf.mapAsync(GPUMapMode.READ);
        // try/finally, not a bare unmap: anything thrown between the map and
        // the unmap strands the buffer mapped forever, turning a one-shot
        // error into a permanently dead readback.
        let packed: Uint8Array;
        try {
          const padded = new Uint8Array(sfMapReadbackBuf.getMappedRange());
          // Strip the 256-byte row alignment back out into a tightly packed
          // array — see SF_MAP_READBACK_BYTES_PER_ROW's own comment.
          packed = new Uint8Array(SF_MAP_AZ * SF_MAP_RINGS * 4);
          for (let row = 0; row < SF_MAP_RINGS; row++) {
            packed.set(
              padded.subarray(
                row * SF_MAP_READBACK_BYTES_PER_ROW,
                row * SF_MAP_READBACK_BYTES_PER_ROW + SF_MAP_AZ * 4,
              ),
              row * SF_MAP_AZ * 4,
            );
          }
        } finally {
          sfMapReadbackBuf.unmap();
        }
        // A later rebuildSfMap re-tokened while this map was pending; its own
        // readback is already chained behind this one, so this result is
        // superseded — drop it rather than clobber sfMapData with data a
        // still-pending later readback is about to overwrite anyway.
        if (token !== sfMapReadbackToken) return;
        sfMapData = {
          az: SF_MAP_AZ,
          rings: SF_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
          data: packed,
        };
        if (fieldTuning.sfMapDustSeeding) {
          rebuildDustMixture();
          repackFieldComponents();
        }
      })
      .catch((err) => {
        console.error('galaxy: sfMap readback failed', err);
      });
  }

  /**
   * scheduleOrientationReadback — the CPU copy of `orientationTex`, same
   * one-per-dispatch discipline as `scheduleSfMapReadback` (whose own
   * docblock explains why the copy/submit/map/unmap has to live INSIDE the
   * chain rather than run eagerly). Chained onto `sfMapReadbackChain` —
   * `rebuildSfMapOrientationIfNeeded`'s own docblock explains why a second,
   * independent chain would be unsafe here. Gated by its caller on
   * `fieldTuning.sfMapDustSeeding`: this is the only consumer of the CPU
   * copy, the debug overlay samples `orientationTex` on the GPU directly.
   */
  function scheduleOrientationReadback(grid: GalaxySfMapGridRadius): void {
    const token = ++orientationReadbackToken;
    sfMapReadbackChain = sfMapReadbackChain
      .then(async () => {
        if (token !== orientationReadbackToken) return;
        const enc = device.createCommandEncoder({ label: 'galaxy:orientationReadback' });
        enc.copyTextureToBuffer(
          { texture: orientationTex },
          {
            buffer: orientationReadbackBuf,
            bytesPerRow: ORIENTATION_READBACK_BYTES_PER_ROW,
            rowsPerImage: SF_MAP_RINGS,
          },
          [SF_MAP_AZ, SF_MAP_RINGS, 1],
        );
        device.queue.submit([enc.finish()]);

        await orientationReadbackBuf.mapAsync(GPUMapMode.READ);
        let data: Float32Array;
        try {
          // rgba16float, u16 lanes: only .xy (cos2theta, sin2theta) matter —
          // see orientationTex's own comment on why .zw are unused.
          const padded = new Uint16Array(orientationReadbackBuf.getMappedRange());
          const rowStrideU16 = ORIENTATION_READBACK_BYTES_PER_ROW / 2; // 2 bytes/u16
          data = new Float32Array(SF_MAP_AZ * SF_MAP_RINGS * 2);
          for (let row = 0; row < SF_MAP_RINGS; row++) {
            for (let a = 0; a < SF_MAP_AZ; a++) {
              const src = row * rowStrideU16 + a * 4; // 4 u16 lanes/texel
              const dst = (row * SF_MAP_AZ + a) * 2;
              data[dst] = f16ToFloat(padded[src]!);
              data[dst + 1] = f16ToFloat(padded[src + 1]!);
            }
          }
        } finally {
          orientationReadbackBuf.unmap();
        }
        if (token !== orientationReadbackToken) return;
        orientationData = {
          az: SF_MAP_AZ,
          rings: SF_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
          data,
        };
        // Coherence is the packed vector's own length (see
        // GalaxySfMapOrientation's doc: `data` is `(cos2theta, sin2theta)`
        // already SCALED by coherence) — computed once here, at the one
        // point a fresh grid exists, not per frame or per dust build.
        let sumCoherence = 0;
        let maxCoherence = 0;
        const texelCount = SF_MAP_AZ * SF_MAP_RINGS;
        for (let i = 0; i < texelCount; i++) {
          const coherence = Math.hypot(data[i * 2]!, data[i * 2 + 1]!);
          sumCoherence += coherence;
          if (coherence > maxCoherence) maxCoherence = coherence;
        }
        orientationCoherenceMean = texelCount > 0 ? sumCoherence / texelCount : 0;
        orientationCoherenceMax = maxCoherence;
        if (fieldTuning.sfMapDustSeeding) {
          rebuildDustMixture(); // also reports — see its own doc
          repackFieldComponents();
        } else {
          reportOrientationDiagnostics();
        }
      })
      .catch((err) => {
        console.error('galaxy: orientation readback failed', err);
      });
  }

  /**
   * reportOrientationDiagnostics — hands `opts.onOrientationDiagnostics` the
   * `OrientationDiagnostics` snapshot the SfMapSection debug readout renders.
   * Event-driven off two independent producers, not a per-frame poll: a
   * readback landing (coherence, `hasData`/`generation`) and a dust rebuild
   * (the delta pair) — see those two functions' own comments for exactly
   * when each fires this.
   */
  function reportOrientationDiagnostics(): void {
    opts.onOrientationDiagnostics?.({
      hasData: orientationData !== null,
      generation: orientationReadbackToken,
      meanCoherence: orientationCoherenceMean,
      maxCoherence: orientationCoherenceMax,
      meanDeltaDeg: lastDustDeltaMeanDeg,
      maxDeltaDeg: lastDustDeltaMaxDeg,
    });
  }

  /**
   * rebuildSfMapOrientationIfNeeded — dispatches the GPU structure-tensor
   * pass chain (sfMapOrientationField -> Tensor -> TensorBlur -> Coherence,
   * see that quartet's own headers) over the CURRENT `sfMapTex`, but ONLY
   * while `render.orientationViewIntensity` is above 0 OR
   * `fieldTuning.sfMapDustSeeding` is — the debug overlay and the dust
   * placement's CPU readback (`scheduleOrientationReadback`, called below
   * when seeding is on) are two independent consumers of the same six-pass
   * chain, either one enough to justify running it. Unlike the deleted CPU
   * build this needs no readback to run FROM — sfMapTex is a GPU texture
   * already, and WebGPU zero-initialises it, so this is safe to call even
   * before `rebuildSfMap` has ever populated it. Still edge-triggered rather
   * than unconditional, from three places:
   *
   *  - `rebuildSfMap`'s own two exits, right after the compute submit that
   *    (re)writes `sfMapTex` — a new automaton state is a new field to
   *    dispatch this chain over, if either consumer wants it.
   *  - `setRender`, only when the incoming patch actually crosses
   *    `orientationViewIntensity` from 0 to above 0, or moves either sigma
   *    while a consumer is already live — see that function's own comment.
   *    `setRender` runs on every render-bag change (the bridge re-pushes the
   *    whole bag on any knob), so calling this unconditionally there would
   *    redispatch the chain on an unrelated exposure drag, and firing on
   *    every intensity step of an already-live slider would redispatch the
   *    whole six-pass chain per frame of a drag.
   *  - `setFieldTuning`, only when the incoming patch flips
   *    `sfMapDustSeeding` on — see that function's own comment.
   */
  function rebuildSfMapOrientationIfNeeded(): void {
    if (render.orientationViewIntensity <= 0 && !fieldTuning.sfMapDustSeeding) return;
    const grid = fieldGeometry ? sfMapGridRadius(fieldGeometry) : { rMin: 1e-3, rMax: 1 };
    device.queue.writeBuffer(orientationGridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));
    device.queue.writeBuffer(
      sfMapOrientationSigmaUbo,
      0,
      new Float32Array([
        render.orientationSigmaDerivTexels,
        render.orientationSigmaIntegTexels,
        0,
        0,
      ]),
    );
    const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
    const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;
    const enc = device.createCommandEncoder({ label: 'galaxy:sfMapOrientation' });
    // All six dispatches share ONE compute pass: each stage reads the
    // previous stage's write, and WebGPU orders dispatchWorkgroups calls
    // within a single pass exactly like rebuildSfMap's own step loop does
    // for its ping-ponged automaton state — no extra pass boundary needed
    // between stages just because the texture object changed.
    const pass = enc.beginComputePass({ label: 'galaxy:sfMapOrientationPass' });
    pass.setPipeline(sfMapOrientationFieldBlurAzimuthPipe);
    pass.setBindGroup(0, sfMapOrientationFieldBlurAzimuthBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.setPipeline(sfMapOrientationFieldBlurRingPipe);
    pass.setBindGroup(0, sfMapOrientationFieldBlurRingBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.setPipeline(sfMapOrientationTensorPipe);
    pass.setBindGroup(0, sfMapOrientationTensorBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.setPipeline(sfMapOrientationTensorBlurAzimuthPipe);
    pass.setBindGroup(0, sfMapOrientationTensorBlurAzimuthBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.setPipeline(sfMapOrientationTensorBlurRingPipe);
    pass.setBindGroup(0, sfMapOrientationTensorBlurRingBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.setPipeline(sfMapOrientationCoherencePipe);
    pass.setBindGroup(0, sfMapOrientationCoherenceBG);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.end();
    device.queue.submit([enc.finish()]);
    if (fieldTuning.sfMapDustSeeding) scheduleOrientationReadback(grid);
  }

  /**
   * rebuildDustMixture — the central galaxy's dust mixture from the CACHED
   * geometry + dust params, gated on `fieldTuning.dustEnabled` the same way
   * `discEnabled`/`armsEnabled` gate their own shader loops (an off pill
   * skips the shader work entirely, not just zeroes tau). Called from
   * `setParams` (new geometry or dust params arrived) and `setFieldTuning`
   * (toggle, or any tuning-driven geometry that later feeds dust) — the same
   * two repack triggers `fieldMixture` itself uses.
   *
   * The particle cloud (`buildDustParticleCloud`) rides the SAME slot: it is
   * volumetric detail layered on the flat lane, drawn through the identical
   * dustMap splat pipeline, so appending it here — rather than threading a
   * second mixture through `repackFieldComponents` — is what lets `dustCount`
   * downstream stay a single number. `currentSeed`, not a literal, so this
   * galaxy's particle placement is reproducible from `setParams`'s params
   * alone.
   *
   * Also rebuilds `currentDustNoise` (io.wesl's `dustNoise` lane): the lane
   * mixture's own length becomes `cloudOffset` (where the particle cloud
   * starts within the dust slice), captured right here at the concatenation
   * point rather than re-derived later by filtering `dustMixture` apart.
   *
   * And `currentDustReachR` (io.wesl's dustSlices doc): computed from
   * `dustDiscShape`/`dustSigmaR` — the SAME smooth-lane shape
   * `buildGalaxyDustMixture` itself derives — rather than from `dustMixture`
   * after the fact, since the particle cloud's own components don't carry a
   * comparable radial sigma to max over. Computed unconditionally (even with
   * `dustEnabled` off, or `dust.tau` at 0) because R sizes the SLICE
   * geometry `drawFrame` packs every frame regardless of whether any dust
   * component exists to populate it — an empty dust slice into degenerate
   * slice edges is still wrong header state, not a harmless no-op.
   *
   * Also refreshes `lastDustDeltaMeanDeg`/`lastDustDeltaMaxDeg` — the
   * `OrientationDiagnostics` "delta actually applied" pair — from a fresh
   * `OrientationDeltaStats` accumulator handed to `buildDustParticleCloud`
   * as a pure out-param (see that type's own doc). The `else` branch below
   * (dust off, or no geometry yet) leaves the accumulator untouched at its
   * zeroed default, which is the honest answer: no placement ran, so no
   * delta was applied.
   */
  function rebuildDustMixture(): void {
    currentDustExtinctionRgb = dustExtinctionRgb(currentDust.rV);
    if (fieldGeometry) {
      const shape = dustDiscShape(fieldGeometry, currentDust);
      let maxSigmaR = 0;
      for (let i = 0; i < DISC_SIGMA_RATIOS.length; i++) {
        maxSigmaR = Math.max(maxSigmaR, dustSigmaR(i, shape));
      }
      currentDustReachR = Math.max(3 * maxSigmaR, DUST_REACH_FLOOR);
    } else {
      currentDustReachR = DUST_REACH_FLOOR;
    }
    const orientationDeltaStats: OrientationDeltaStats = {
      count: 0,
      sumAbsDeltaDeg: 0,
      maxAbsDeltaDeg: 0,
    };
    if (fieldGeometry && fieldTuning.dustEnabled) {
      const laneMixture = buildGalaxyDustMixture(fieldGeometry, currentDust);
      const cloudMixture = buildDustParticleCloud(
        fieldGeometry,
        currentDust,
        fieldTuning,
        currentSeed,
        sfMapData,
        orientationData,
        orientationDeltaStats,
      );
      dustMixture = [...laneMixture, ...cloudMixture];
      currentDustNoise = {
        tileUnits: dustNoiseTileUnits(currentDust.cloud.textureScale),
        amplitude: currentDust.cloud.texture,
        cloudOffset: laneMixture.length,
        // Inverted here, not in the shader, so dustMap.wesl stays one plain
        // pow(): a higher slider value means a SMALLER exponent (pushes
        // |s| toward 1, hardening filament edges). Floored well above 0 —
        // the slider's own range never reaches it, but 1/0 would still be
        // an infinite exponent reaching this uniform.
        contrastExp: 1 / Math.max(currentDust.cloud.textureContrast, 1e-3),
      };
    } else {
      dustMixture = [];
      currentDustNoise = { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 };
    }
    lastDustDeltaMeanDeg =
      orientationDeltaStats.count > 0
        ? orientationDeltaStats.sumAbsDeltaDeg / orientationDeltaStats.count
        : 0;
    lastDustDeltaMaxDeg = orientationDeltaStats.maxAbsDeltaDeg;
    reportOrientationDiagnostics();
  }

  /**
   * rebuildSfMap — reruns the SSPSF automaton from scratch: bakes the
   * arm-forcing texture (galaxySfMapArmForcing.ts, off the CACHED geometry —
   * same contract rebuildDustMixture follows) then dispatches
   * `fieldTuning.sfMap.steps` compute steps, all in ONE command encoder /
   * ONE submit. Called from setParams (new galaxy, always) and
   * setFieldTuning (only when the incoming patch actually touches `sfMap` —
   * see its call site) — NEVER per frame, per the params contract.
   *
   * Per-step data (the step index sfMapStep.wesl's RNG salt needs) cannot
   * ride one rewritten uniform: every `device.queue.writeBuffer` call here
   * happens before this function's single `submit`, and queue operations
   * apply in ISSUE order — N rewrites of one buffer location would all land
   * before ANY of the N dispatches ran, so every step would see only the
   * LAST write (the same landmine the star/dust UBO split guards against,
   * see this file's own uniform-buffer docblock above). The fix used here:
   * write every step's index ONCE, at its own (device-aligned) offset in one
   * buffer, and give each step its OWN bind group with a STATIC offset into
   * that slot — no rewrite between dispatches, so ordering can't collapse.
   *
   * Both exits schedule `scheduleSfMapReadback(grid)` — the disabled branch
   * too, so `sfMapData` reflects the cleared (all-zero-gas) texture it just
   * wrote rather than holding some earlier galaxy's map.
   */
  function rebuildSfMap(): void {
    const sfMap = fieldTuning.sfMap;
    const grid = fieldGeometry ? sfMapGridRadius(fieldGeometry) : { rMin: 1e-3, rMax: 1 };
    device.queue.writeBuffer(sfMapGridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));

    if (!fieldGeometry || !sfMap.enabled || sfMap.steps <= 0) {
      // Disabled (or no galaxy yet): leave nothing stale for sfMapView to
      // show — same "a skipped pass leaves last frame's content" concern
      // dustMapPopulated exists to avoid, just resolved by clearing once
      // rather than latching, since this path is a rare toggle, not a
      // per-frame branch.
      device.queue.writeTexture(
        { texture: sfMapArmForcingTex },
        new Float32Array(SF_MAP_AZ * SF_MAP_RINGS),
        { bytesPerRow: SF_MAP_AZ * 4 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );
      device.queue.writeTexture(
        { texture: sfMapTex },
        new Uint8Array(SF_MAP_AZ * SF_MAP_RINGS * 4),
        { bytesPerRow: SF_MAP_AZ * 4 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );
      scheduleSfMapReadback(grid);
      rebuildSfMapOrientationIfNeeded();
      return;
    }

    const forcing = buildGalaxySfMapArmForcing(fieldGeometry, fieldTuning);
    device.queue.writeTexture(
      { texture: sfMapArmForcingTex },
      forcing,
      { bytesPerRow: SF_MAP_AZ * 4 },
      [SF_MAP_AZ, SF_MAP_RINGS],
    );

    device.queue.writeBuffer(
      sfMapConstUbo,
      0,
      new Float32Array([
        grid.rMin,
        grid.rMax,
        sfMap.corotationRadius,
        sfMap.shearRate,
        sfMap.baseIgnition,
        sfMap.spread,
        sfMap.armForcing,
        sfMap.gasRegen,
        sfMap.refractorySteps,
        currentSeed,
        sfMap.armFluxRef,
        sfMap.activityDecay,
        sfMap.activityGain,
        0,
        0,
        0,
      ]),
    );

    const steps = sfMap.steps;
    const stride = device.limits.minUniformBufferOffsetAlignment;
    if (sfMapStepIndexBuf) sfMapStepIndexBuf.destroy();
    sfMapStepIndexBuf = device.createBuffer({
      label: 'galaxy:sfMapStepIndexBuf',
      size: steps * stride,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const strideFloats = stride / 4;
    const stepData = new Float32Array(steps * strideFloats);
    for (let s = 0; s < steps; s++) stepData[s * strideFloats] = s;
    device.queue.writeBuffer(sfMapStepIndexBuf, 0, stepData);

    const stepBindGroups: GPUBindGroup[] = [];
    for (let s = 0; s < steps; s++) {
      const prev = s % 2 === 0 ? sfMapStateA : sfMapStateB;
      const next = s % 2 === 0 ? sfMapStateB : sfMapStateA;
      stepBindGroups.push(
        device.createBindGroup({
          label: `galaxy:sfMapStepBG${s}`,
          layout: sfMapStepPipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: sfMapConstUbo } },
            { binding: 1, resource: sfMapArmForcingTex.createView() },
            { binding: 2, resource: prev.createView() },
            { binding: 3, resource: next.createView() },
            { binding: 4, resource: { buffer: sfMapStepIndexBuf, offset: s * stride, size: 4 } },
          ],
        }),
      );
    }

    const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
    const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;
    const enc = device.createCommandEncoder({ label: 'galaxy:sfMapRebuild' });
    const stepPass = enc.beginComputePass({ label: 'galaxy:sfMapStepPass' });
    stepPass.setPipeline(sfMapStepPipe);
    for (let s = 0; s < steps; s++) {
      stepPass.setBindGroup(0, stepBindGroups[s]!);
      stepPass.dispatchWorkgroups(dispatchX, dispatchY);
    }
    stepPass.end();

    // Parity of the LAST dispatched step (index steps-1) says which texture
    // it wrote into: even index writes B, odd writes A (see the prev/next
    // pick in the loop above). That same steps-1 is also the number of
    // shear-applying generations finalState has accumulated (step 0 only
    // seeds — see sfMapStep.wesl), which is what sfMapPack.wesl's un-shear
    // needs, NOT the raw `steps` count.
    const finalState = (steps - 1) % 2 === 0 ? sfMapStateB : sfMapStateA;
    device.queue.writeBuffer(
      sfMapPackConstUbo,
      0,
      new Float32Array([
        grid.rMin,
        grid.rMax,
        sfMap.corotationRadius,
        sfMap.shearRate,
        steps - 1,
        0,
        0,
        0,
      ]),
    );
    const packBG = device.createBindGroup({
      label: 'galaxy:sfMapPackBG',
      layout: sfMapPackPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: finalState.createView() },
        { binding: 1, resource: sfMapTex.createView() },
        { binding: 2, resource: { buffer: sfMapPackConstUbo } },
      ],
    });
    const packPass = enc.beginComputePass({ label: 'galaxy:sfMapPackPass' });
    packPass.setPipeline(sfMapPackPipe);
    packPass.setBindGroup(0, packBG);
    packPass.dispatchWorkgroups(dispatchX, dispatchY);
    packPass.end();

    device.queue.submit([enc.finish()]);
    scheduleSfMapReadback(grid);
    rebuildSfMapOrientationIfNeeded();
  }

  /**
   * repackFieldComponents — flattens the central galaxy's emission mixture,
   * every extra's (each already carried into world space by
   * `transformGalaxyFieldComponent` at the point it was built), then the
   * central galaxy's dust mixture LAST, into one list and rewrites
   * `fieldCompsBuf`. Called whenever any mixture changes — `setParams`,
   * `setExtras`, `setFieldTuning` — never per frame, unlike the header (see
   * `packFieldUniforms`'s header for why the two are split).
   *
   * Dust trails every emission component (never interleaved) so
   * `dustOffset == fieldEmissionCount` always holds without a separate
   * bookkeeping pass — see io.wesl's layout comment.
   *
   * Grows (and rebuilds `splatBG` + `dustMapBG`, since an 'auto'-layout bind
   * group is tied to the specific GPUBuffer it was built against) only when
   * the new total exceeds the current capacity, and never shrinks — the same
   * grow-only discipline `instancedQuadRenderer` uses for its 'grow' capacity
   * strategy, and for the same reason here: `setFieldTuning` fires on every
   * frame a tuning slider is dragged, and recreating the buffer + bind groups
   * that often would be pure churn.
   */
  function repackFieldComponents(): void {
    const emission: GalaxyFieldComponent[] = [...fieldMixture];
    for (const e of extras) emission.push(...e.fieldMixture);
    fieldPrimaryCount = fieldMixture.length;
    fieldEmissionCount = emission.length;
    fieldDustCount = dustMixture.length;
    const combined = fieldDustCount > 0 ? [...emission, ...dustMixture] : emission;
    const total = combined.length;
    if (total > fieldCompsCapacity) {
      fieldCompsCapacity = total;
      fieldCompsBuf.destroy();
      fieldCompsBuf = device.createBuffer({
        label: 'galaxy:fieldComps',
        size: fieldCompsCapacity * FIELD_COMPONENT_FLOATS * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      splatBG = buildSplatBindGroup();
      dustMapBG = buildDustMapBindGroup();
    }
    if (total > 0) {
      device.queue.writeBuffer(fieldCompsBuf, 0, packFieldComponents(combined));
    }
  }

  /**
   * repackHiiComponents — `repackFieldComponents`'s exact counterpart for the
   * HII tier: central galaxy's `hiiMixture` then every extra's, into
   * `hiiCompsBuf`. A SEPARATE buffer rather than a fifth slice of
   * `fieldCompsBuf` — see `hiiTex`'s declaration comment for why this tier
   * cannot share the field's target, and a shared BUFFER with a separate
   * TARGET would still mean one draw call painting into two attachments,
   * which WebGPU has no way to do. Called at the same three call sites as
   * `repackFieldComponents`, immediately after it.
   */
  function repackHiiComponents(): void {
    const combined: GalaxyFieldComponent[] = [...hiiMixture];
    for (const e of extras) combined.push(...e.hiiMixture);
    hiiEmissionCount = combined.length;
    if (hiiEmissionCount > hiiCompsCapacity) {
      hiiCompsCapacity = hiiEmissionCount;
      hiiCompsBuf.destroy();
      hiiCompsBuf = device.createBuffer({
        label: 'galaxy:hiiComps',
        size: hiiCompsCapacity * FIELD_COMPONENT_FLOATS * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      hiiBG = buildHiiBindGroup();
    }
    if (hiiEmissionCount > 0) {
      device.queue.writeBuffer(hiiCompsBuf, 0, packFieldComponents(combined));
    }
  }

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

    const genUniforms = packGenerationUniforms(p, budget, null);
    device.queue.writeBuffer(genUbo, 0, genUniforms);
    // Read back rather than re-derive: the bar and bulge tilts are single RNG
    // draws off the packer's streams, so this is the only way the analytic
    // field can be sure it is oriented like the sprites it sums with.
    fieldGeometry = readGalaxyFieldGeometry(genUniforms, starLayout);
    // Discard the cached readbacks ONLY when the grid they were sampled over
    // actually moved. `sfMapGridRadius` depends on `fieldGeometry` alone, so
    // most params — dust `share`, cloud counts, colours — leave it untouched,
    // and nulling on every `setParams` made a slider DRAG flip the dust
    // between its map-seeded and unseeded builds once per frame: the
    // synchronous rebuild below saw no map, then the async readback landed a
    // frame or two later and rebuilt it again. Registration is what the map
    // has to be right about (rMin/rMax ride the readback for exactly this
    // check); one frame of stale CONTENT is invisible next to that flicker.
    const nextGrid = sfMapGridRadius(fieldGeometry);
    const gridMoved = (m: { rMin: number; rMax: number } | null): boolean =>
      m !== null && (m.rMin !== nextGrid.rMin || m.rMax !== nextGrid.rMax);
    if (gridMoved(sfMapData)) sfMapData = null;
    if (gridMoved(orientationData)) orientationData = null;
    fieldMixture = buildGalaxyFieldMixture(fieldGeometry, fieldTuning);
    currentDust = p.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
    // Same `geometry.seed` `buildHiiRegions` was called with when it still
    // lived inside `buildGalaxyFieldMixture` — the field's own generated
    // seed, not a re-derivation.
    hiiMixture = buildHiiRegions(fieldGeometry, fieldTuning, currentDust, fieldGeometry.seed);
    // Same seed normalisation `packGenerationUniforms` applies internally —
    // duplicated rather than read back off `genUniforms` because it is a
    // scalar the packer never round-trips into the UBO bytes.
    currentSeed = (p.seed ?? 0) | 0 || 1;
    rebuildDustMixture();
    repackFieldComponents();
    repackHiiComponents();
    // Always — a new galaxy means new geometry/arms, so the automaton and
    // the ridge it forces against are both stale otherwise.
    rebuildSfMap();

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
    const previousFieldDivisor = render.fieldDivisor;
    const previousDustDivisor = render.dustDivisor;
    const previousHiiDivisor = render.hiiDivisor;
    const previousOrientationViewIntensity = render.orientationViewIntensity;
    const previousOrientationSigmaDeriv = render.orientationSigmaDerivTexels;
    const previousOrientationSigmaInteg = render.orientationSigmaIntegTexels;
    Object.assign(render, patch);
    if (render.aggregateDivisor !== previousDivisor) buildAggregateTarget();
    if (render.fieldDivisor !== previousFieldDivisor) buildFieldTarget();
    // dustMapTex and dustViewTex share dustDivisor (see dustMapTex's
    // declaration comment), so the two rebuild together — leaving either
    // behind here would silently reintroduce the resolution-mismatch bug the
    // divisor-matched contract exists to prevent.
    if (render.dustDivisor !== previousDustDivisor) {
      buildDustMapTarget();
      buildDustViewTarget();
    }
    if (render.hiiDivisor !== previousHiiDivisor) buildHiiTarget();
    // Edge-triggered on the 0 -> nonzero CROSSING, not "whenever intensity is
    // above 0": this function runs on every render-bag push, and the slider
    // is now continuous, so the latter would redispatch the whole six-pass
    // chain on every drag step instead of once when the overlay turns on.
    // See rebuildSfMapOrientationIfNeeded's own docblock.
    //
    // Gated on EITHER consumer being live, not just the intensity: with the
    // overlay off and `sfMapDustSeeding` on, an intensity-only guard left the
    // sigma sliders dead — no live consumer meant the condition never even
    // reached the edge check, so a sigma drag redrew nothing and the dust
    // never resampled the new orientation. Matches the early-return gate
    // inside `rebuildSfMapOrientationIfNeeded` itself.
    const orientationConsumerLive =
      render.orientationViewIntensity > 0 || fieldTuning.sfMapDustSeeding;
    const orientationViewJustTurnedOn =
      previousOrientationViewIntensity <= 0 && render.orientationViewIntensity > 0;
    if (
      orientationConsumerLive &&
      (orientationViewJustTurnedOn ||
        render.orientationSigmaDerivTexels !== previousOrientationSigmaDeriv ||
        render.orientationSigmaIntegTexels !== previousOrientationSigmaInteg)
    ) {
      rebuildSfMapOrientationIfNeeded();
    }
  }

  // Rebuilds `fieldMixture` from the CACHED geometry rather than dispatching a
  // regenerate: the ring layout is a pure function of geometry + tuning, so a
  // slider drag is a CPU-only mixture rebuild picked up by next frame's
  // `packFieldUniforms`, same as every other render knob above. No cached
  // geometry yet (before the first `setParams`) just leaves the merged
  // `fieldTuning` for that first `setParams` to read.
  //
  // Rebuilds every EXTRA's mixture too, from ITS cached geometry + transform
  // — a tuning change is a global look knob, so a background galaxy's ring
  // structure has to track it exactly like the central one's, then land back
  // in world space via `transformGalaxyFieldComponent` before `comps` is
  // repacked.
  //
  // Also rebuilds `dustMixture` (central galaxy only — see
  // `rebuildDustMixture`), which is how a `dustEnabled` toggle takes effect
  // without a regenerate, and `hiiMixture` (central + every extra), which is
  // how `hiiEnabled`/`hiiBrightness`/etc. take effect the same way.
  function setFieldTuning(patch: Partial<GalaxyFieldTuning>): void {
    // The automaton rebuild is N compute dispatches (rebuildSfMap's own
    // docblock) — far more expensive than the CPU mixture rebuilds below, so
    // it only reruns when the caller actually touched `sfMap`, not on every
    // unrelated slider (armWidthScale etc. technically also feed the ridge
    // the forcing field bakes, but re-triggering on every tuning field would
    // make dragging any OTHER slider pay this pass's cost too — a follow-up
    // if that dependency ever needs to be exact).
    const sfMapTouched = patch.sfMap !== undefined;
    const previousSfMapDustSeeding = fieldTuning.sfMapDustSeeding;
    fieldTuning = { ...fieldTuning, ...patch };
    if (fieldGeometry) {
      fieldMixture = buildGalaxyFieldMixture(fieldGeometry, fieldTuning);
      hiiMixture = buildHiiRegions(fieldGeometry, fieldTuning, currentDust, fieldGeometry.seed);
    }
    extras = extras.map((e) => ({
      ...e,
      fieldMixture: buildGalaxyFieldMixture(e.fieldGeometry, fieldTuning).map((c) =>
        transformGalaxyFieldComponent(c, e.transform),
      ),
      // Extras carry no dust params of their own yet (see `rebuildDustMixture`'s
      // docblock) — `DEFAULT_GALAXY_DUST_PARAMS` is the same implicit default
      // `buildGalaxyFieldMixture(e.fieldGeometry, fieldTuning)` used to gate
      // an extra's HII tier on before this tier owned its own buffer.
      hiiMixture: buildHiiRegions(
        e.fieldGeometry,
        fieldTuning,
        DEFAULT_GALAXY_DUST_PARAMS,
        e.fieldGeometry.seed,
      ).map((c) => transformGalaxyFieldComponent(c, e.transform)),
    }));
    rebuildDustMixture();
    repackFieldComponents();
    repackHiiComponents();
    if (sfMapTouched) {
      rebuildSfMap(); // its own two exits already dispatch+readback orientation
    } else if (fieldTuning.sfMapDustSeeding && !previousSfMapDustSeeding) {
      // sfMap itself wasn't touched, so rebuildSfMap won't run — but seeding
      // just turned on and the chain may never have dispatched
      // (`orientationViewIntensity` could be, and usually is, 0), so
      // `orientationData` would otherwise stay null forever.
      // `rebuildDustMixture` above already ran once against whatever
      // `orientationData` was cached; this brings it current.
      rebuildSfMapOrientationIfNeeded();
    }
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
      const genUniforms = packGenerationUniforms(spec.params, budget, spec);
      device.queue.writeBuffer(ubo, 0, genUniforms);

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

      // Same analytic mixture the central galaxy gets in `setParams`, built
      // from this extra's OWN geometry then carried into world space with
      // the SAME rigid transform `applyExtraTransform` bakes into the
      // sprites (see `transformGalaxyFieldComponent`'s header) — so the two
      // representations of this background galaxy register with each other.
      const geometry = readGalaxyFieldGeometry(genUniforms, starLayout);
      const transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'> = {
        pos: spec.pos,
        scale: spec.scale,
        rotY: spec.rotY,
        tiltX: spec.tiltX,
      };
      const extraFieldMixture = buildGalaxyFieldMixture(geometry, fieldTuning).map((c) =>
        transformGalaxyFieldComponent(c, transform),
      );
      // Same implicit `DEFAULT_GALAXY_DUST_PARAMS` gate `setFieldTuning`'s
      // extras branch uses — see its own comment for why.
      const extraHiiMixture = buildHiiRegions(
        geometry,
        fieldTuning,
        DEFAULT_GALAXY_DUST_PARAMS,
        geometry.seed,
      ).map((c) => transformGalaxyFieldComponent(c, transform));

      extras.push({
        starBuf: starBufExtra,
        starCount: starLayout.capacity,
        dustBuf: dustBufExtra,
        dustCount: dustLayout.capacity,
        ubo,
        fieldGeometry: geometry,
        transform,
        fieldMixture: extraFieldMixture,
        hiiMixture: extraHiiMixture,
      });
    }
    device.queue.submit([enc.finish()]);
    repackFieldComponents();
    repackHiiComponents();
  }

  function setView(pose: Partial<ViewPose>): void {
    if (pose.az != null) cam.az = pose.az;
    if (pose.el != null) cam.el = pose.el;
    if (pose.dist != null) cam.dist = pose.dist;
    lastInteract = performance.now();
  }

  function setAutoRotate(on: boolean): void {
    autoRotate = on;
    // Both halves make the toggle immediate. Starting clears the idle gate in
    // `drawFrame`: that gate exists so the spin does not fight a live drag, not
    // to delay a deliberate button press, and a press right after a drag would
    // otherwise sit still for 2.5 s. Stopping snaps the damped shadow onto the
    // live angle — while rotating, `camAnim.az` trails `cam.az` by a constant
    // offset, and letting that offset unwind reads as a coast after the button
    // already said stop.
    if (on) lastInteract = Number.NEGATIVE_INFINITY;
    else camAnim.az = cam.az;
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
    // Exponential, so a notch is a constant RATIO — the only zoom that behaves
    // the same at 3000 units out and at 0.02. The rate is up from the old
    // short-range value to keep a full traverse a similar number of notches now
    // that the range spans five decades instead of two.
    cam.dist *= Math.exp(e.deltaY * 0.0018);
    // The floor is deep inside the disc, where sprites resolve into individual
    // billboards — the regime the app hits on descent and the one worth tuning
    // against. It works only because the near plane tracks `dist` below.
    //
    // The CEILING is set by the apparent-size fade band, not by taste: the disc
    // is 21 generator units across, so at 400 it still spans tens of pixels and
    // the band (edges at 12 / 8 px) could not fire at any reachable zoom. 3000
    // puts both edges inside the range, which is what makes the FADE section
    // testable. The far plane below still contains the cloud there.
    // The ceiling exists so the apparent-size fade band is reachable, and that
    // band is keyed on PIXELS: apparent diameter is ~25.35 * viewportHeight /
    // dist, so a taller canvas needs a further camera to reach the same px. At
    // dpr 2 an 8 px disc is ~5700 units, so a 3000 ceiling would leave the band
    // never firing on a retina display. 8000 clears it with margin, and the far
    // plane (dist * 2 + 200) still contains the cloud there.
    cam.dist = Math.max(0.02, Math.min(8000, cam.dist));
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
  const backingSize = (): Vec2 => [
    Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  ];
  function resize(): void {
    const [w, h] = backingSize();
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    buildTargets();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  // Adopt the backing size and allocate UNCONDITIONALLY rather than leaning on
  // `resize` to do it as a side effect: an HMR remount hands the new engine the
  // SAME canvas node, already at the right size, so `resize`'s early return
  // would leave this engine with no targets at all and the first `drawFrame`
  // would throw on `aggregateTex`. Every input `buildTargets` reads — the
  // device, the backing size, `render.aggregateDivisor` — is live by here.
  // `resize` keeps its early return, which stays correct: it now guards only a
  // genuine no-op, and cannot double-allocate against this call.
  const [initialW, initialH] = backingSize();
  canvas.width = initialW;
  canvas.height = initialH;
  buildTargets();

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
      // Both HDR fields zero: the tool configures an SDR swap chain, where
      // spilled over-white energy would just clamp back to 1.0. The app's own
      // SDR path passes the same zeros — see ToneMap's field docs.
      { exposure: render.exposure, curve: render.tonemap, hdrKnee: 0, hdrHeadroom: 0 },
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
  // Last frame's fade, published by `loop` on its own cadence. Null until the
  // first `drawFrame`; the offscreen paths (`sample`, `grab`, `step`) write it
  // too, which is harmless — they render the same camera the on-screen frame
  // does.
  let lastFade: MilkyWayFadeReadout | null = null;

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
    // Near/far track orbit distance, the same adaptation the app's NEAR0 slab
    // makes and for the same reason: a fixed near plane slices through the disc
    // once you descend into it. There is no depth attachment, so the usual
    // precision cost of a tiny near plane does not apply — these only clip.
    // Far keeps the whole cloud in view from inside the disc as well as from
    // outside it; the sprite shaders clamp clip-z against exactly this hazard.
    const near = Math.max(1e-4, camAnim.dist * 0.002);
    const far = camAnim.dist * 2 + 200;
    const aspect = canvas.width / canvas.height;
    const proj = mat4.perspective(cam.fov, aspect, near, far);
    const shiftX = lensShift(insetL, insetR, canvas.clientWidth);
    proj[8] = shiftX; // lens shift to centre in the visible area
    const vp = mat4.multiply(proj, view);

    // The app's visibility fade, against this frame's camera. It multiplies
    // into BOTH representations of the cloud below, so the two keep summing to
    // the same image as they fade — the comparison the spike exists for has to
    // survive the fade, not be interrupted by it. `canvas.height`, not the
    // aggregate's, for the same reason the app passes `ctx.canvasSize.height`:
    // the band asks how big the disc looks to the USER.
    const fade = deriveMilkyWayFade(eye, cam.fov, canvas.height, render);
    lastFade = fade;

    // The three debug views crossfade independently rather than replace the
    // galaxy (RenderSettings's own docblock), so the galaxy's own dimming
    // needs ONE combined weight — 1 minus the largest of the three, floored
    // at 0 — rather than each view's slider darkening it separately, which
    // would double-dim wherever two are live at once. Shared by the sprite
    // fadeAlpha below AND every packFieldHeaderUniforms call this frame (the
    // field header and the HII header), so the galaxy dims by exactly the
    // same amount whichever representation is drawing it.
    const debugGalaxyWeight = Math.max(
      0,
      1 -
        Math.max(
          render.dustViewIntensity,
          render.sfMapViewIntensity,
          render.orientationViewIntensity,
        ),
    );
    const debugView: DebugViewWeights = {
      dustViewIntensity: render.dustViewIntensity,
      sfMapViewIntensity: render.sfMapViewIntensity,
      orientationViewIntensity: render.orientationViewIntensity,
      galaxyWeight: debugGalaxyWeight,
    };
    // Per-channel isolation for the SF-map view — orthogonal to
    // debugView.sfMapViewIntensity (the whole view's crossfade weight), see
    // io.wesl's sfMapChannels doc. Shared with the HII header below for the
    // same reason debugView is: both packFieldHeaderUniforms calls write the
    // same struct shape, even though only sfMapPresent.wesl's own draw
    // (bound to the field pipeline, not HII's) ever reads this lane.
    const sfMapChannels: SfMapChannelWeights = {
      gasWeight: render.sfMapGasWeight,
      recentSfWeight: render.sfMapRecentWeight,
      activityWeight: render.sfMapActivityWeight,
    };

    // Two packs of the same struct, differing only in `viewportPx`: the star
    // pass gets the AGGREGATE's dimensions (what `stars.wesl` clamps sprite
    // half-extents against), the dust pass the canvas's. Both writes happen
    // before either pass is encoded, which is safe precisely because they
    // target different buffers. `fadeAlpha` carries `debugGalaxyWeight` too —
    // dimming the legacy sprites (primary AND extras) under an active debug
    // view exactly like the analytic field's own splat.wesl multiply does,
    // rather than the old suppression that hid the primary's sprites outright
    // but deliberately left extras' alone (see the field/scene passes below).
    const tuning = cloudTuning();
    const aggregatePx = reducedSize(render.aggregateDivisor);
    packCloudUniforms(vp, view, aggregatePx, tuning, fade.alpha * debugGalaxyWeight, cloudData);
    device.queue.writeBuffer(starUbo, 0, cloudData);
    packCloudUniforms(
      vp,
      view,
      [canvas.width, canvas.height],
      tuning,
      fade.alpha * debugGalaxyWeight,
      cloudData,
    );
    device.queue.writeBuffer(dustUbo, 0, cloudData);
    // Depth-slice edges for the dust map (io.wesl's dustSlices doc) — VIEW-
    // dependent, so recomputed every frame unlike `currentDustReachR`. D is
    // the eye's distance to the primary galaxy's centre (the tool's origin,
    // not `cam.target` — the two differ once the camera pans); the geometric
    // spacing between tNear and tFar is what turns linear from outside the
    // galaxy and logarithmic from inside it — see io.wesl for the full
    // derivation of the 0.02*R floor.
    const dustD = Math.hypot(eye[0], eye[1], eye[2]);
    const dustTNear = Math.max(dustD - currentDustReachR, 0.02 * currentDustReachR);
    const dustTFar = dustD + currentDustReachR;
    const dustRatio = dustTFar / dustTNear;
    const dustSlices: FieldDustSlices = {
      t1: dustTNear * dustRatio ** 0.25,
      t2: dustTNear * dustRatio ** 0.5,
      t3: dustTNear * dustRatio ** 0.75,
    };

    // The mixture is calibrated to the sprite field's total flux in record
    // units (see `emissionScale`), which leaves the star pass's own two
    // multipliers to apply here: its per-sprite `exposure`, and
    // `starSizeScale` SQUARED because a sprite's light goes as its quad area.
    // Multiplying them in is what keeps `analyticExposure` 1.0 meaning parity
    // as those sliders move, rather than only at defaults. Shared by the HII
    // header below: the HII tier's own flux calibration (`hiiRegions.ts`'s
    // `tierFlux`) rides the same star-count x size^2 currency `emissionScale`
    // does, so it owes the same live sliders.
    const analyticExposure =
      render.analyticExposure * render.starIntensity * render.sizeScale ** 2 * fade.alpha;

    // The analytic field's ray basis. `aspect` is the PROJECTION's (the
    // canvas's), not the aggregate's: the fullscreen triangle covers the
    // aggregate, but the frustum it must reconstruct is the one `proj` was
    // built with.
    packFieldHeaderUniforms(
      { eye, view, fov: cam.fov, aspect, lensShiftX: shiftX, exposure: analyticExposure },
      fieldEmissionCount,
      fieldEmissionCount,
      fieldDustCount,
      fieldPrimaryCount,
      // dustMapTex's own pixel height — reducedSize(render.dustDivisor)[1],
      // the extent buildDustMapTarget now sizes the texture to (its own
      // divisor, independent of fieldTex's). Read by dustMap.wesl's dust-noise
      // multiplier to band-limit its four baked octaves against the
      // fragment's own world-space pixel footprint — see io.wesl's counts2.y
      // doc.
      reducedSize(render.dustDivisor)[1],
      // fieldTex's own pixel size — splat.wesl's fs needs this to build the
      // normalized UV it now samples dustMapTex through, since the two maps
      // no longer share a resolution (see io.wesl's counts2.zw doc).
      reducedSize(render.fieldDivisor),
      // The CCM89 extinction law for currentDust.rV — cached by
      // rebuildDustMixture, not recomputed here every frame.
      currentDustExtinctionRgb,
      // The dust-noise erosion lane — also cached by rebuildDustMixture.
      currentDustNoise,
      // The dust-slice edges computed just above — VIEW-dependent, unlike
      // every other packFieldHeaderUniforms argument past `cam` itself.
      dustSlices,
      // The three crossfade sliders + the combined galaxy weight, computed
      // once above — splat.wesl's fs reads .w, dustPresent.wesl's fs .x.
      debugView,
      // The SF-map per-channel isolation weights, computed once above —
      // only sfMapPresent.wesl's fs reads this lane.
      sfMapChannels,
      fieldData,
    );
    device.queue.writeBuffer(fieldUbo, 0, fieldData);

    // The HII tier's own header, same camera basis, its own target's pixel
    // size, and every dust lane inert: `primaryCount` 0 means splat.wesl's fs
    // gates its attenuation branch on `input.inst < 0`, which is never true,
    // so it always takes the plain (unattenuated) emission path — HII does
    // not (yet) darken under the dust lane it may physically sit inside.
    packFieldHeaderUniforms(
      { eye, view, fov: cam.fov, aspect, lensShiftX: shiftX, exposure: analyticExposure },
      hiiEmissionCount,
      hiiEmissionCount,
      0,
      0,
      0,
      reducedSize(render.hiiDivisor),
      HII_INERT_DUST_EXTINCTION,
      HII_INERT_DUST_NOISE,
      HII_INERT_DUST_SLICES,
      // Same object as the field header above: only .w (galaxyWeight) is
      // read by this pass's own splat.wesl draw (hiiBG never binds the
      // dustPresent/sfMapPresent/orientationPresent pipelines that read
      // .x/.y/.z), but sharing it keeps HII's own dimming in lockstep with
      // the rest of the galaxy under an active debug view.
      debugView,
      // Same object as the field header above — never read by this pass's
      // own draw (hiiBG never binds sfMapPresent.wesl), shared purely
      // because both calls write the same struct shape.
      sfMapChannels,
      hiiData,
    );
    device.queue.writeBuffer(hiiUbo, 0, hiiData);
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
      // The sprite half of the comparison. Skipping the draws (rather than
      // zeroing an intensity) is what makes "sprites off" also mean "sprite
      // cost off", so the two representations can be timed as well as looked
      // at.
      if (render.spriteField) {
        pass.setPipeline(starPipe);
        pass.setBindGroup(0, starBG);
        pass.setVertexBuffer(0, quad);
        // Always drawn now, primary AND extras — the three debug views dim
        // the galaxy through fadeAlpha's debugGalaxyWeight factor (packed
        // above), not by suppressing this draw, which is what makes k=0.5
        // read as half galaxy / half map instead of a hard cut. The old
        // primary-only skip deliberately left extras' sprites visible under
        // a boolean toggle; the crossfade contract (k=1 means galaxy at 0%)
        // has no room for that exception any more.
        if (starBuf) {
          pass.setVertexBuffer(1, starBuf);
          pass.draw(6, starCount);
        }
        for (const e of extras) {
          pass.setVertexBuffer(1, e.starBuf);
          pass.draw(6, e.starCount);
        }
      }
      pass.end();
    }
    // The analytic half, into its OWN target at its OWN divisor. Both halves
    // are still additive glow summed into the same HDR scene below, so drawing
    // both still gives exactly what either alone would at double weight — the
    // point of the side-by-side. Clearing (not loading) is what a private
    // target buys: no tile reload, and the timing slot is then honest.
    if (render.analyticField) {
      // Dust-column map: splat the primary's dust slice into `dustMapTex`, at
      // its own divisor-matched resolution (`dustMapPipe`, additive). Feeds
      // splat.wesl's fs (the grey/RGB split) always now, and IS the
      // dustPresent pass's own source whenever the JWST view is live — so it
      // has to run whenever either consumer needs it: `dustViewIntensity > 0`
      // (the image itself) or a nonzero dust slice.
      //
      // `dustMapPopulated` is what makes skipping SAFE, and it is load-bearing:
      // a skipped pass leaves whatever the last frame wrote, and the texture is
      // only all-zero while it has never been drawn into. Without the latch, a
      // galaxy whose dust count drops to zero — switch the category to
      // elliptical, or pull tau to 0 — keeps the PREVIOUS galaxy's dust map
      // bound, and splat.wesl goes on attenuating with dust that no longer
      // exists. One clearing pass on the transition costs a clear; getting it
      // wrong reads as "the dust never regenerates".
      const dustMapHasContent = fieldDustCount > 0;
      if (dustMapHasContent || render.dustViewIntensity > 0 || dustMapPopulated) {
        const dustMapWrites = timing.descriptorFor('dustMap');
        const dustMapPass = enc.beginRenderPass({
          label: 'galaxy:dustMapPass',
          colorAttachments: [
            {
              view: dustMapTex.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          ...(dustMapWrites ? { timestampWrites: dustMapWrites } : {}),
        });
        dustMapPass.setPipeline(dustMapPipe);
        dustMapPass.setBindGroup(0, dustMapBG);
        dustMapPass.draw(6, fieldDustCount);
        dustMapPass.end();
        dustMapPopulated = dustMapHasContent;
      }

      // JWST dust-view presentation, into its OWN target — runs ADDITIONALLY
      // alongside the emission splat below whenever `render.dustViewIntensity
      // > 0`, rather than replacing it: the three debug views crossfade
      // independently now (RenderSettings's own docblock), and the scene
      // pass sums whichever of them are live. No `timestampWrites`: the
      // 'field' slot belongs to the emission splat below, and two passes
      // cannot share one timestamp pair in a frame (see TIMING_SLOTS).
      if (render.dustViewIntensity > 0) {
        const pass = enc.beginRenderPass({
          label: 'galaxy:dustPresentPass',
          colorAttachments: [
            {
              view: dustViewTex.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setPipeline(dustPresentPipe);
        pass.setBindGroup(0, dustPresentBG);
        pass.draw(3);
        pass.end();
      }

      const fieldWrites = timing.descriptorFor('field');
      const fieldPass = enc.beginRenderPass({
        label: 'galaxy:fieldPass',
        colorAttachments: [
          {
            view: fieldTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(fieldWrites ? { timestampWrites: fieldWrites } : {}),
      });
      fieldPass.setPipeline(splatPipe);
      fieldPass.setBindGroup(0, splatBG);
      // One draw for the WHOLE emission list `repackFieldComponents` wrote —
      // central galaxy's components then every extra's — so the field pass's
      // timing slot honestly reports the analytic cost of everything on
      // screen, not just the central galaxy's share. `fieldEmissionCount`,
      // NOT the packed total: the trailing dust slice is never drawn as its
      // own quad, only read from inside a primary emission fragment. Always
      // runs now (no debug-view gate) — splat.wesl's fs dims its own output
      // through debugView.w, the same combined weight the sprites dim by.
      fieldPass.draw(6, fieldEmissionCount);
      fieldPass.end();

      // The HII tier's own pass, same shape as the field pass just above
      // (same `splatPipe`, a different bind group and target) — see
      // `hiiTex`'s declaration comment for why it does not share either.
      // Gated only on `hiiEmissionCount > 0` now — the old `!render.dustView`
      // half of this existed because the field pass used to skip entirely
      // under the JWST view, leaving `hiiTex` stale; the field pass no longer
      // skips, so that concern is gone.
      if (hiiEmissionCount > 0) {
        const hiiWrites = timing.descriptorFor('hii');
        const hiiPass = enc.beginRenderPass({
          label: 'galaxy:hiiPass',
          colorAttachments: [
            {
              view: hiiTex.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          ...(hiiWrites ? { timestampWrites: hiiWrites } : {}),
        });
        hiiPass.setPipeline(splatPipe);
        hiiPass.setBindGroup(0, hiiBG);
        hiiPass.draw(6, hiiEmissionCount);
        hiiPass.end();
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
      // Every representation below is additive into the SAME attachment, so
      // the crossfade is just which of them ran this frame, each already
      // carrying its own weight (splat.wesl's debugView.w, or a present
      // shader's own debugView.x/.y/.z) — nothing here picks one exclusively
      // any more.
      if (render.analyticField) {
        aggregateUpsample.draw(pass, fieldTex.createView());
        // The HII tier's own composite, same additive upsample as the
        // field's own draw just above — see `hiiTex`'s declaration comment
        // for why it rides a separate target rather than joining that draw.
        if (hiiEmissionCount > 0) {
          aggregateUpsample.draw(pass, hiiTex.createView());
        }
        // Picks up `dustViewTex` in ADDITION to `fieldTex` above — the two
        // are no longer mutually exclusive now that the JWST view is a
        // crossfade weight rather than a replacement (see the field pass).
        if (render.dustViewIntensity > 0) {
          aggregateUpsample.draw(pass, dustViewTex.createView());
        }
        // Presented straight into `sceneTex` at full canvas resolution — see
        // the field pass above for why a divisor-matched offscreen and this
        // same upsample's 4-tap reconstruction were both wrong for this
        // diagnostic. `sfMapPresentPipe` blends additively (see its own
        // construction comment) so this draw sums with whatever the upsample
        // above already added.
        if (render.sfMapViewIntensity > 0) {
          pass.setPipeline(sfMapPresentPipe);
          pass.setBindGroup(0, sfMapPresentBG);
          pass.draw(3);
        }
        // Same shape as the sfMap draw just above, same reason:
        // full-canvas-resolution presentation, additive so it sums with
        // whatever else this pass has already drawn.
        if (render.orientationViewIntensity > 0) {
          pass.setPipeline(orientationPresentPipe);
          pass.setBindGroup(0, orientationPresentBG);
          pass.draw(3);
        }
      }
      pass.setPipeline(dustPipe);
      pass.setBindGroup(0, dustBG);
      pass.setVertexBuffer(0, quad);
      // Always drawn now, primary AND extras — same "dim through
      // debugGalaxyWeight, don't suppress" contract the star pass follows
      // above (see its own comment for why the old primary-only skip is
      // gone).
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
  let lastFadeReportMs = 0;

  function loop(now: number): void {
    if (!running) return;
    if (lastRafMs !== 0) frameTimer.push(now - lastRafMs);
    lastRafMs = now;
    drawFrame(now);
    // Same reason `onPerf` is throttled: this drives React state, and a
    // per-frame dispatch would put the readout's own re-render inside the frame
    // it is describing.
    if (lastFade && now - lastFadeReportMs >= FADE_REPORT_INTERVAL_MS) {
      lastFadeReportMs = now;
      opts.onFade?.(lastFade);
    }
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
    setFieldTuning,
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
    // The SSPSF automaton's packed output (sfMapPack.wesl) — a persistent
    // GPU texture, always non-null, whose CONTENT is only meaningful once
    // rebuildSfMap has run at least once (setParams). Consumed by nothing
    // yet but sfMapPresent.wesl's own overlay; exposed here for the sibling
    // UI and future consumers per the research doc §19's staging note.
    getSfMapTexture: (): GPUTexture => sfMapTex,
    // The CPU-side readback of the same output (`scheduleSfMapReadback`):
    // null until the first one lands. Consumed by `buildDustParticleCloud`
    // via `sfMapDustSeeding` today; exposed here for future consumers too.
    getSfMapData: (): GalaxySfMap | null => sfMapData,
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
      fieldUbo.destroy();
      fieldCompsBuf.destroy();
      dustNoiseTex.destroy();
      sfMapArmForcingTex.destroy();
      sfMapStateA.destroy();
      sfMapStateB.destroy();
      sfMapTex.destroy();
      sfMapReadbackBuf.destroy();
      sfMapConstUbo.destroy();
      sfMapGridUbo.destroy();
      sfMapPackConstUbo.destroy();
      sfMapStepIndexBuf?.destroy();
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
