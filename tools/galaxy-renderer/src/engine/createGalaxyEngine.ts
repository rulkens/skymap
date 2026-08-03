/**
 * createGalaxyEngine — the one GPU-orchestration module. Owns the WebGPU
 * device, every pipeline and buffer, and the per-frame render loop; the orbit
 * camera and its input belong to `createOrbitCameraInput`, which this drives
 * once per frame. A straight port of the spike's `galaxy-engine.js`
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
 * cosmetic here — see `deriveFrameView`.
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

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDustParams } from '../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldGeometry } from '../../../../src/@types/galaxy/GalaxyFieldGeometry';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxySfMap } from '../../../../src/@types/galaxy/GalaxySfMap';
import type { GalaxySfMapOrientation } from '../../../../src/@types/galaxy/GalaxySfMapOrientation';
import type { GalaxyStarFormationParams } from '../../../../src/@types/galaxy/GalaxyStarFormationParams';
import type { MilkyWayTuning } from '../../../../src/@types/settings/MilkyWayTuning';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './timing/createFrameTimer';
import { createGalaxyRenderTargets } from './gpu/createGalaxyRenderTargets';
import { createOrbitCameraInput } from './camera/createOrbitCameraInput';
import { createPassTimingWindows } from './timing/createPassTimingWindows';
import { beginClearPass } from './passes/beginClearPass';
import { encodeDustPresentPass } from './passes/encodeDustPresentPass';
import { encodeSplatPass } from './passes/encodeSplatPass';
import { createSfMapAutomaton } from './sfMap/createSfMapAutomaton';
import { createSfMapOrientation } from './sfMap/createSfMapOrientation';
import { createReadbackQueue } from './gpu/createReadbackQueue';
import { deriveFrameView } from './frame/deriveFrameView';
import { decodeOrientationTexels } from './sfMap/decodeOrientationTexels';
import { orientationCoherenceStats } from './sfMap/orientationCoherenceStats';
import { BUBBLE_RECORD_FLOATS, packBubbleInstances } from './uniforms/packBubbleInstances';
import { sampleLuminanceStats } from './probe/sampleLuminanceStats';
import { swizzleToRgba } from './probe/swizzleToRgba';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './uniforms/packCloudUniforms';
import {
  FIELD_COMPONENT_FLOATS,
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldComponents,
  packFieldHeaderUniforms,
} from './uniforms/packFieldUniforms';
import type { FieldDustNoise, FieldDustSlices } from './uniforms/packFieldUniforms';
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
  buildDustBubblePlacements,
  buildHiiCavityPlacements,
  BUBBLE_BUDGET,
  HII_CAVITY_BUDGET,
} from '../../../../src/data/galaxy/dustBubblePlacements';
import {
  sfMapGridRadius,
  SF_MAP_AZ,
  SF_MAP_RINGS,
} from '../../../../src/data/galaxy/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../src/data/galaxy/galaxySfMapArmForcing';
import { DISC_SIGMA_RATIOS } from '../../../../src/data/galaxy/discSurfaceFit';
import { dustDiscShape, dustSigmaR } from '../../../../src/data/galaxy/galaxyDustMixture';
import {
  buildDustParticleCloud,
  dustNoiseTileUnits,
} from '../../../../src/data/galaxy/dustParticleCloud';
import type { OrientationDeltaStats } from '../../../../src/data/galaxy/clusteredDiscPlacement';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../src/data/galaxy/defaultGalaxyDustParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../src/data/galaxy/defaultGalaxyStarFormationParams';
import { dustExtinctionRgb } from '../../../../src/utils/galaxy/dustExtinctionRgb';
import { alignedBytesPerRow } from '../../../../src/utils/gpu/alignedBytesPerRow';
import { unpadRows } from '../../../../src/utils/gpu/unpadRows';
import { transformGalaxyFieldComponent } from '../../../../src/utils/galaxy/transformGalaxyFieldComponent';
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
import bubblePresentWgsl from './shaders/milkyWayField/bubblePresent.wesl?static';
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
 * to any real galaxy's scale (generator units where the orbit distance ranges
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
  // The bubble-view overlay's own instance buffer (bubblePresent.wesl): a
  // plain VERTEX buffer, not a storage array like `fieldCompsBuf` — there is
  // no per-fragment lookup by index, just one instance-stepped attribute
  // pair per placement, so it needs no 'auto'-layout bind group of its own
  // and growing it never forces a bind-group rebuild the way
  // `fieldCompsBuf`'s regrow does. Capacity starts at
  // BUBBLE_BUDGET + HII_CAVITY_BUDGET (both placement builders' own admission
  // ceilings) so the overlay's first activation never regrows. Grown, never
  // shrunk — same discipline as `fieldCompsBuf`, see `rebuildBubblePlacements`.
  let bubbleCapacity = BUBBLE_BUDGET + HII_CAVITY_BUDGET;
  let bubbleBuf = device.createBuffer({
    label: 'galaxy:bubbleComps',
    size: bubbleCapacity * BUBBLE_RECORD_FLOATS * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
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

  // ---- SSPSF star-formation automaton + its orientation chain ----
  // Both own every resource they touch, including their readback staging
  // buffers; the engine keeps only the handles and the perf GATES (which read
  // the render bag / field tuning, which those modules deliberately don't).
  const sfMapAutomaton = createSfMapAutomaton(device, {
    makeShader,
    hdrFormat: HDR,
    fieldUbo,
  });
  const sfMapOrientation = createSfMapOrientation(device, {
    makeShader,
    hdrFormat: HDR,
    fieldUbo,
    sourceTexture: sfMapAutomaton.texture,
  });

  // ---- bubble-view overlay: the SF-event catalog's own placements ----
  // A SECOND, independent star-formation model (dustBubblePlacements.ts,
  // resolved from sfEventCatalog.ts) drawn as its own debug layer so it can
  // be compared directly against the SSPSF automaton's sfMap view — see
  // `rebuildBubblePlacements` (below `rebuildDustMixture`) for how
  // `bubbleBuf` is built and packed. One instanced camera-facing quad per
  // placement, no storage buffer/comps lookup: bubblePresent.wesl reads its
  // per-instance center/radius/kind straight off the vertex buffer, and
  // `u` (fieldUbo) only for the camera basis + its own crossfade weight —
  // so this bind group needs just binding 0, built once like
  // `sfMapPresentBG`/`orientationPresentBG` (fieldUbo's OBJECT never
  // changes, only its content, rewritten every `drawFrame`).
  const bubblePresentMod = makeShader(bubblePresentWgsl, 'galaxy:bubblePresent');
  const bubblePresentPipe = device.createRenderPipeline({
    label: 'galaxy:bubblePresentPipe',
    layout: 'auto',
    vertex: {
      module: bubblePresentMod,
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
      module: bubblePresentMod,
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
  // The SF-event knobs `setParams` was last handed, cached for the same
  // reason `currentDust` is: `setFieldTuning` rebuilds the HII tier and the
  // bubble placements without a `GalaxyParams` of its own to re-read.
  let currentStarFormation: GalaxyStarFormationParams = DEFAULT_GALAXY_STAR_FORMATION_PARAMS;
  // The CCM89 law for `currentDust.rV`, cached alongside it (recomputed in
  // `rebuildDustMixture`, not per frame in `drawFrame`) — `packFieldHeaderUniforms`
  // needs this every frame now that the primary galaxy's attenuation reads
  // it from the header rather than a per-component colour lane (see
  // io.wesl's dust-component comment).
  let currentDustExtinctionRgb = dustExtinctionRgb(DEFAULT_GALAXY_DUST_PARAMS.rV);
  // The dust-noise erosion lane (io.wesl's `dustNoise`), cached alongside
  // `currentDustExtinctionRgb` for the same reason — `packFieldHeaderUniforms`
  // needs it every `drawFrame` but it only changes when `rebuildDustMixture`
  // runs. `cloudOffset` is always 0 now: it used to be the smooth lane
  // tier's own length (deleted — see `galaxyDustMixture.ts`'s header), the
  // index within the dust slice where the particle cloud started; with the
  // cloud as the only tier it starts at index 0.
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
  // `orientationTex`'s CPU-side readback, same lifecycle as `sfMapData` above.
  // Both streams share ONE queue (see `createReadbackQueue` for why a second
  // chain would be unsafe) while keeping independent tokens: the orientation
  // readback dispatches on triggers that never touch `sfMapData` (`setRender`'s
  // `orientationViewIntensity` crossing 0, `setFieldTuning`'s `sfMapDustSeeding`
  // toggle), so one shared token would let an unrelated trigger wrongly
  // supersede a still-pending readback.
  let orientationData: GalaxySfMapOrientation | null = null;
  const readbackQueue = createReadbackQueue(device);
  const sfMapReadback = readbackQueue.stream({
    label: 'galaxy:sfMapReadback',
    texture: sfMapAutomaton.texture,
    buffer: sfMapAutomaton.readbackBuffer,
    bytesPerRow: sfMapAutomaton.readbackBytesPerRow,
    width: SF_MAP_AZ,
    height: SF_MAP_RINGS,
    decode: (mapped) =>
      unpadRows(
        new Uint8Array(mapped),
        sfMapAutomaton.readbackBytesPerRow,
        SF_MAP_AZ * 4,
        SF_MAP_RINGS,
      ),
  });
  const orientationReadback = readbackQueue.stream({
    label: 'galaxy:orientationReadback',
    texture: sfMapOrientation.texture,
    buffer: sfMapOrientation.readbackBuffer,
    bytesPerRow: sfMapOrientation.readbackBytesPerRow,
    width: SF_MAP_AZ,
    height: SF_MAP_RINGS,
    decode: (mapped) =>
      decodeOrientationTexels(
        new Uint16Array(mapped),
        sfMapOrientation.readbackBytesPerRow,
        SF_MAP_AZ,
        SF_MAP_RINGS,
      ),
  });
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
  // `targets`' `onDustMapRecreated` below, alongside `dustPresentBG`
  // (dustMapTex is that bind group's ONLY binding). All three rebuild in
  // `repackFieldComponents`'s regrow branch when `fieldCompsBuf` grows;
  // `splatBG`/`dustPresentBG` rebuild again whenever `dustMapTex` itself is
  // recreated (every resize, and every `dustDivisor` move).
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
        { binding: 2, resource: targets.dustMapTex.createView() },
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
        { binding: 2, resource: targets.dustMapTex.createView() },
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
        { binding: 2, resource: targets.dustMapTex.createView() },
        { binding: 6, resource: dustMapSampler },
      ],
    });
  }

  /**
   * Whether `dustMapTex` currently holds anything but zeros. `drawFrame` skips
   * the dust-map pass when there is no dust to draw, and a skipped pass leaves
   * the last frame's contents — so this is what lets the skip stay correct
   * across the nonzero -> zero transition (an elliptical, or tau pulled to 0)
   * instead of stranding the previous galaxy's dust in front of the new one.
   */
  let dustMapPopulated = false;

  // ---- size-dependent targets: HDR scene + star aggregate + bloom mips + LDR ----
  //
  // Allocates nothing yet — the first `rebuildAll` is the unconditional one
  // below the ResizeObserver, once the canvas has adopted its backing size.
  // The callback is the engine's half of a `dustMapTex` recreation: three
  // `layout: 'auto'` bind groups are tied to the specific GPUTexture they were
  // built against, and they also read `fieldUbo`/`hiiUbo`/the comps buffers,
  // which the target module has no business knowing about.
  const targets = createGalaxyRenderTargets(
    device,
    canvas,
    { hdr: HDR, swap: format, dustMap: DUST_MAP_FORMAT },
    () => {
      splatBG = buildSplatBindGroup();
      hiiBG = buildHiiBindGroup();
      dustPresentBG = buildDustPresentBindGroup();
      // A fresh texture is zero-initialised, so the stale-map latch resets with it.
      dustMapPopulated = false;
    },
  );

  // ---- camera state (orbit) — galaxy-engine.js:159-166 ----
  const camera = createOrbitCameraInput(canvas, { autoRotate: opts.autoRotate !== false });

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
  // The live total from the last `rebuildBubblePlacements` pack — relic
  // bubbles plus HII cavities, concatenated. What `drawFrame` instances for
  // the bubble-view overlay pass. Stays 0 (and `bubbleBuf` stale-but-unread)
  // whenever `render.bubbleViewIntensity` is 0 — see that function's own
  // early-return.
  let bubbleInstanceCount = 0;

  /**
   * scheduleSfMapReadback — the ONE-PER-GENERATION CPU copy of `sfMapTex`
   * (research doc §19's staged architecture: never a per-frame readback,
   * never a CPU mirror of the automaton). Called from `rebuildSfMap`'s own
   * two exits with the grid it just wrote, so `GalaxySfMap.rMin/rMax` always
   * matches the CONTENT being copied.
   *
   * Does not block the caller, and overlapping rebuilds (a dragged slider)
   * coalesce rather than race — `createReadbackQueue` owns that discipline.
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
    sfMapReadback.request((packed) => {
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
    });
  }

  /**
   * scheduleOrientationReadback — the CPU copy of `orientationTex`, same
   * one-per-dispatch discipline as `scheduleSfMapReadback` (whose own
   * docblock explains why the copy/submit/map/unmap has to live INSIDE the
   * chain rather than run eagerly). Shares the sfMap stream's queue —
   * `rebuildSfMapOrientationIfNeeded`'s own docblock explains why a second,
   * independent chain would be unsafe here. Gated by its caller on
   * `fieldTuning.sfMapDustSeeding`: this is the only consumer of the CPU
   * copy, the debug overlay samples `orientationTex` on the GPU directly.
   */
  function scheduleOrientationReadback(grid: GalaxySfMapGridRadius): void {
    orientationReadback.request((data) => {
      orientationData = {
        az: SF_MAP_AZ,
        rings: SF_MAP_RINGS,
        rMin: grid.rMin,
        rMax: grid.rMax,
        data,
      };
      // Computed once here, at the one point a fresh grid exists — not per
      // frame or per dust build.
      const coherenceStats = orientationCoherenceStats(data);
      orientationCoherenceMean = coherenceStats.mean;
      orientationCoherenceMax = coherenceStats.max;
      if (fieldTuning.sfMapDustSeeding) {
        rebuildDustMixture(); // also reports — see its own doc
        repackFieldComponents();
      } else {
        reportOrientationDiagnostics();
      }
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
      generation: orientationReadback.generation,
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
    sfMapOrientation.dispatch({
      grid,
      sigmaDerivTexels: render.orientationSigmaDerivTexels,
      sigmaIntegTexels: render.orientationSigmaIntegTexels,
    });
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
   * `buildDustParticleCloud` is the ONLY dust tier (the smooth analytic lane
   * it used to be layered on was deleted — see `galaxyDustMixture.ts`'s
   * header), drawn through the dustMap splat pipeline. `currentSeed`, not a
   * literal, so this galaxy's particle placement is reproducible from
   * `setParams`'s params alone.
   *
   * Also rebuilds `currentDustNoise` (io.wesl's `dustNoise` lane):
   * `cloudOffset` is always 0 now (see its own declaration comment above).
   *
   * And `currentDustReachR` (io.wesl's dustSlices doc): computed from
   * `dustDiscShape`/`dustSigmaR` — the same disc shape the particle cloud's
   * mass budget is anchored to — rather than from `dustMixture` after the
   * fact, since the particle cloud's own components don't carry a
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
      const cloudMixture = buildDustParticleCloud(
        fieldGeometry,
        currentDust,
        fieldTuning,
        currentSeed,
        sfMapData,
        orientationData,
        orientationDeltaStats,
      );
      dustMixture = [...cloudMixture];
      currentDustNoise = {
        tileUnits: dustNoiseTileUnits(currentDust.cloud.textureScale),
        amplitude: currentDust.cloud.texture,
        cloudOffset: 0,
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
   * rebuildBubblePlacements — the SF-event catalog's own bubble/cavity
   * placements (dustBubblePlacements.ts's `buildDustBubblePlacements` +
   * `buildHiiCavityPlacements`), packed into `bubbleBuf` for the bubble-view
   * debug overlay. A SECOND, independent star-formation model — both
   * builders read the SAME `sfEventCatalog.ts` events the SSPSF automaton
   * never sees — drawn so it can be compared directly against the
   * automaton's own sfMap view. Central galaxy only, from the CACHED
   * `fieldGeometry`/`currentDust`/`currentStarFormation`/`currentSeed` — same
   * inputs `rebuildDustMixture` reads, and called from the same two sites
   * (`setParams`, `setFieldTuning`), right after it.
   *
   * Gated on `render.bubbleViewIntensity > 0`, same early-return discipline
   * as `rebuildSfMapOrientationIfNeeded` — with the overlay off, this call
   * is one comparison and nothing else, so a debug layer nobody is looking
   * at costs nothing. `setRender` calls this again, edge-triggered on the
   * 0 -> nonzero crossing (see its own comment), so switching the overlay on
   * populates it immediately rather than waiting for the next geometry
   * change.
   *
   * Growing `bubbleBuf` needs no bind-group rebuild, unlike `fieldCompsBuf`
   * — it is a plain VERTEX buffer, not part of an 'auto'-layout bind group
   * (see `bubbleBuf`'s own declaration comment).
   */
  function rebuildBubblePlacements(): void {
    if (render.bubbleViewIntensity <= 0) {
      bubbleInstanceCount = 0;
      return;
    }
    const relics = fieldGeometry
      ? buildDustBubblePlacements(fieldGeometry, currentDust, currentStarFormation, currentSeed)
      : [];
    const cavities = fieldGeometry
      ? buildHiiCavityPlacements(
          fieldGeometry,
          currentDust,
          currentStarFormation,
          fieldTuning,
          currentSeed,
        )
      : [];
    const total = relics.length + cavities.length;
    if (total > bubbleCapacity) {
      bubbleCapacity = total;
      bubbleBuf.destroy();
      bubbleBuf = device.createBuffer({
        label: 'galaxy:bubbleComps',
        size: bubbleCapacity * BUBBLE_RECORD_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    bubbleInstanceCount = total;
    if (total === 0) return;
    const data = packBubbleInstances(relics, cavities);
    device.queue.writeBuffer(bubbleBuf, 0, data);
  }

  /**
   * rebuildSfMap — reruns the SSPSF automaton from scratch: bakes the
   * arm-forcing texture (galaxySfMapArmForcing.ts, off the CACHED geometry —
   * same contract rebuildDustMixture follows). Called from setParams (new
   * galaxy, always) and setFieldTuning (only when the incoming patch actually
   * touches `sfMap` — see its call site) — NEVER per frame, per the params
   * contract. `createSfMapAutomaton` owns the dispatch; what stays here is the
   * pair of things that follow it either way.
   *
   * The readback runs on BOTH of the automaton's exits — the disabled one too,
   * so `sfMapData` reflects the cleared (all-zero-gas) texture it just wrote
   * rather than holding some earlier galaxy's map.
   */
  function rebuildSfMap(): void {
    const grid = sfMapAutomaton.rebuild({
      geometry: fieldGeometry,
      tuning: fieldTuning,
      seed: currentSeed,
    });
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
    currentStarFormation = p.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;
    // Same `geometry.seed` `buildHiiRegions` was called with when it still
    // lived inside `buildGalaxyFieldMixture` — the field's own generated
    // seed, not a re-derivation.
    hiiMixture = buildHiiRegions(
      fieldGeometry,
      fieldTuning,
      currentStarFormation,
      fieldGeometry.seed,
    );
    // Same seed normalisation `packGenerationUniforms` applies internally —
    // duplicated rather than read back off `genUniforms` because it is a
    // scalar the packer never round-trips into the UBO bytes.
    currentSeed = (p.seed ?? 0) | 0 || 1;
    rebuildDustMixture();
    rebuildBubblePlacements();
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
    const previousBubbleViewIntensity = render.bubbleViewIntensity;
    Object.assign(render, patch);
    if (render.aggregateDivisor !== previousDivisor) {
      targets.rebuildAggregate(render.aggregateDivisor);
    }
    if (render.fieldDivisor !== previousFieldDivisor) targets.rebuildField(render.fieldDivisor);
    // `rebuildDust` covers dustMapTex AND dustViewTex — they share dustDivisor
    // (see dustMapTex's declaration comment), and rebuilding one without the
    // other reintroduces the resolution-mismatch bug the divisor-matched
    // contract exists to prevent.
    if (render.dustDivisor !== previousDustDivisor) targets.rebuildDust(render.dustDivisor);
    if (render.hiiDivisor !== previousHiiDivisor) targets.rebuildHii(render.hiiDivisor);
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
    // Same 0 -> nonzero edge-trigger as the orientation chain just above,
    // for the same reason: `rebuildBubblePlacements`'s own early return
    // already makes every OTHER render-bag push a no-op, but the crossing
    // itself has to force one rebuild so switching the overlay on shows
    // something immediately rather than waiting for the next
    // setParams/setFieldTuning.
    if (previousBubbleViewIntensity <= 0 && render.bubbleViewIntensity > 0) {
      rebuildBubblePlacements();
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
    // it only reruns when `sfMap` itself changed, not on every unrelated
    // slider (armWidthScale etc. technically also feed the ridge the forcing
    // field bakes, but re-triggering on every tuning field would make
    // dragging any OTHER slider pay this pass's cost too — a follow-up if
    // that dependency ever needs to be exact).
    //
    // The bridge (`connectEngineBridge`) pushes the WHOLE `fieldTuning` slice
    // on every change, so `patch.sfMap !== undefined` is true unconditionally
    // and can't gate anything — identity is the only signal `sfMap` changed.
    // That identity is trustworthy because the sole writer
    // (`fieldTuningSlice`'s `Object.assign` under RTK/immer) only replaces
    // `sfMap` when a patch supplies it, and the sole UI producer
    // (`SfMapSection`'s `patchSfMap`) always builds a fresh `{ ...sfMap,
    // ...patch }` object — so the reference changes exactly when a value did.
    const sfMapTouched = patch.sfMap !== undefined && patch.sfMap !== fieldTuning.sfMap;
    const previousSfMapDustSeeding = fieldTuning.sfMapDustSeeding;
    fieldTuning = { ...fieldTuning, ...patch };
    if (fieldGeometry) {
      fieldMixture = buildGalaxyFieldMixture(fieldGeometry, fieldTuning);
      hiiMixture = buildHiiRegions(
        fieldGeometry,
        fieldTuning,
        currentStarFormation,
        fieldGeometry.seed,
      );
    }
    extras = extras.map((e) => ({
      ...e,
      fieldMixture: buildGalaxyFieldMixture(e.fieldGeometry, fieldTuning).map((c) =>
        transformGalaxyFieldComponent(c, e.transform),
      ),
      // Extras carry no star-formation params of their own yet (see
      // `rebuildDustMixture`'s docblock) — `DEFAULT_GALAXY_STAR_FORMATION_PARAMS`
      // is the same implicit default `buildGalaxyFieldMixture(e.fieldGeometry,
      // fieldTuning)` used to gate an extra's HII tier on before this tier
      // owned its own buffer.
      hiiMixture: buildHiiRegions(
        e.fieldGeometry,
        fieldTuning,
        DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
        e.fieldGeometry.seed,
      ).map((c) => transformGalaxyFieldComponent(c, e.transform)),
    }));
    rebuildDustMixture();
    rebuildBubblePlacements();
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
      // Same implicit `DEFAULT_GALAXY_STAR_FORMATION_PARAMS` gate
      // `setFieldTuning`'s extras branch uses — see its own comment for why.
      const extraHiiMixture = buildHiiRegions(
        geometry,
        fieldTuning,
        DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
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

  // ---- resize (galaxy-engine.js:253-264) ----
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // full native resolution
  const backingSize = (): Vec2 => [
    Math.max(1, Math.floor(canvas.clientWidth * dpr)),
    Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  ];
  // The targets module never reads the render bag, so a full reallocation has
  // to be handed all four divisors at once.
  const allDivisors = (): { aggregate: number; field: number; dust: number; hii: number } => ({
    aggregate: render.aggregateDivisor,
    field: render.fieldDivisor,
    dust: render.dustDivisor,
    hii: render.hiiDivisor,
  });
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

  // The honest instrument: wall time between consecutive rAF callbacks. Fed
  // from `loop` rather than `drawFrame`, so the matcher's offscreen frames
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
    const hdrView = targets.sceneTex.createView();
    const mips = targets.bloomMips;
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
            ? { view: mips[level]!.createView(), loadOp, storeOp: 'store', clearValue: clear }
            : { view: mips[level]!.createView(), loadOp, storeOp: 'store' },
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
        mips[level - 1]!.createView(),
        level,
        targets.bloomTexelSize(level - 1),
        level === 1,
      );
      pass.end();
    }

    for (let level = BLOOM_LEVELS - 2; level >= 0; level--) {
      const pass = open(level, 'load');
      bloomPyramid.upsample(
        pass,
        mips[level + 1]!.createView(),
        level,
        targets.bloomTexelSize(level + 1),
      );
      pass.end();
    }

    const foldPass = enc.beginRenderPass({
      label: 'galaxy:bloomFold',
      colorAttachments: [{ view: hdrView, loadOp: 'load', storeOp: 'store' }],
      ...(endWrites ? { timestampWrites: endWrites } : {}),
    });
    bloomPyramid.fold(foldPass, mips[0]!.createView(), render.bloom);
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

    const { eye, target, fov, dist } = camera.update(dt, now);
    const shiftX = camera.shiftX(canvas.clientWidth);
    // Every camera-and-settings derivation for this frame, in one pure call —
    // the sprite passes and BOTH field headers below read the same objects out
    // of it, which is what keeps the two representations of the cloud summing
    // to the same image as they fade and dim.
    const {
      view,
      viewProj: vp,
      aspect,
      fade,
      galaxyWeight,
      debugView,
      sfMapChannels,
      dustSlices,
      analyticExposure,
    } = deriveFrameView({
      eye,
      target,
      fov,
      dist,
      shiftX,
      viewportPx: [canvas.width, canvas.height],
      render,
      dustReachR: currentDustReachR,
    });
    lastFade = fade;

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
    // The analytic field's ray basis. `aspect` is the PROJECTION's (the
    // canvas's), not the aggregate's: the fullscreen triangle covers the
    // aggregate, but the frustum it must reconstruct is the one `proj` was
    // built with.
    packFieldHeaderUniforms(
      { eye, view, fov, aspect, lensShiftX: shiftX, exposure: analyticExposure },
      fieldEmissionCount,
      fieldEmissionCount,
      fieldDustCount,
      fieldPrimaryCount,
      // dustMapTex's own pixel height — the same `reducedSize` call that sized
      // the texture, at its own divisor, independent of fieldTex's. Read by
      // dustMap.wesl's dust-noise multiplier to band-limit its four baked
      // octaves against the fragment's own world-space pixel footprint — see
      // io.wesl's counts2.y doc.
      targets.reducedSize(render.dustDivisor)[1],
      // fieldTex's own pixel size — splat.wesl's fs needs this to build the
      // normalized UV it now samples dustMapTex through, since the two maps
      // no longer share a resolution (see io.wesl's counts2.zw doc).
      targets.reducedSize(render.fieldDivisor),
      // The CCM89 extinction law for currentDust.rV — cached by
      // rebuildDustMixture, not recomputed here every frame.
      currentDustExtinctionRgb,
      // The dust-noise erosion lane — also cached by rebuildDustMixture.
      currentDustNoise,
      // The dust-slice edges computed just above — VIEW-dependent, unlike
      // every other packFieldHeaderUniforms argument past the camera basis.
      dustSlices,
      // The three crossfade sliders + the combined galaxy weight, computed
      // once above — splat.wesl's fs reads .w, dustPresent.wesl's fs .x.
      debugView,
      // The SF-map per-channel isolation weights, computed once above —
      // only sfMapPresent.wesl's fs reads this lane.
      sfMapChannels,
      // The bubble-view overlay's own crossfade weight — only
      // bubblePresent.wesl's fs reads this lane (via its own bind group,
      // bound to THIS header's `fieldUbo`, not the HII one below).
      render.bubbleViewIntensity,
      fieldData,
    );
    device.queue.writeBuffer(fieldUbo, 0, fieldData);

    // The HII tier's own header, same camera basis, its own target's pixel
    // size, and every dust lane inert: `primaryCount` 0 means splat.wesl's fs
    // gates its attenuation branch on `input.inst < 0`, which is never true,
    // so it always takes the plain (unattenuated) emission path — HII does
    // not (yet) darken under the dust lane it may physically sit inside.
    packFieldHeaderUniforms(
      { eye, view, fov, aspect, lensShiftX: shiftX, exposure: analyticExposure },
      hiiEmissionCount,
      hiiEmissionCount,
      0,
      0,
      0,
      targets.reducedSize(render.hiiDivisor),
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
      // Same scalar as the field header above — never read by this pass's
      // own draw (hiiBG never binds bubblePresentPipe either), shared purely
      // because both calls write the same struct shape.
      render.bubbleViewIntensity,
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
      const pass = beginClearPass(
        enc,
        'galaxy:starPass',
        targets.aggregateTex.createView(),
        starWrites,
      );
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
        const dustMapPass = beginClearPass(
          enc,
          'galaxy:dustMapPass',
          targets.dustMapTex.createView(),
          dustMapWrites,
        );
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
      // pass sums whichever of them are live.
      if (render.dustViewIntensity > 0) {
        encodeDustPresentPass({
          enc,
          targetView: targets.dustViewTex.createView(),
          pipeline: dustPresentPipe,
          bindGroup: dustPresentBG,
        });
      }

      // One draw for the WHOLE emission list `repackFieldComponents` wrote —
      // central galaxy's components then every extra's — so the field pass's
      // timing slot honestly reports the analytic cost of everything on
      // screen, not just the central galaxy's share. `fieldEmissionCount`,
      // NOT the packed total: the trailing dust slice is never drawn as its
      // own quad, only read from inside a primary emission fragment. Always
      // runs now (no debug-view gate) — splat.wesl's fs dims its own output
      // through debugView.w, the same combined weight the sprites dim by.
      encodeSplatPass({
        enc,
        timing,
        label: 'galaxy:fieldPass',
        slot: 'field',
        targetView: targets.fieldTex.createView(),
        pipeline: splatPipe,
        bindGroup: splatBG,
        instanceCount: fieldEmissionCount,
      });

      // The HII tier's own pass — see `hiiTex`'s declaration comment for why
      // it shares neither the field's bind group nor its target.
      // Gated only on `hiiEmissionCount > 0` now — the old `!render.dustView`
      // half of this existed because the field pass used to skip entirely
      // under the JWST view, leaving `hiiTex` stale; the field pass no longer
      // skips, so that concern is gone.
      if (hiiEmissionCount > 0) {
        encodeSplatPass({
          enc,
          timing,
          label: 'galaxy:hiiPass',
          slot: 'hii',
          targetView: targets.hiiTex.createView(),
          pipeline: splatPipe,
          bindGroup: hiiBG,
          instanceCount: hiiEmissionCount,
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
      aggregateUpsample.draw(pass, targets.aggregateTex.createView());
      // Every representation below is additive into the SAME attachment, so
      // the crossfade is just which of them ran this frame, each already
      // carrying its own weight (splat.wesl's debugView.w, or a present
      // shader's own debugView.x/.y/.z) — nothing here picks one exclusively
      // any more.
      if (render.analyticField) {
        aggregateUpsample.draw(pass, targets.fieldTex.createView());
        // The HII tier's own composite, same additive upsample as the
        // field's own draw just above — see `hiiTex`'s declaration comment
        // for why it rides a separate target rather than joining that draw.
        if (hiiEmissionCount > 0) {
          aggregateUpsample.draw(pass, targets.hiiTex.createView());
        }
        // Picks up `dustViewTex` in ADDITION to `fieldTex` above — the two
        // are no longer mutually exclusive now that the JWST view is a
        // crossfade weight rather than a replacement (see the field pass).
        if (render.dustViewIntensity > 0) {
          aggregateUpsample.draw(pass, targets.dustViewTex.createView());
        }
        // Presented straight into `sceneTex` at full canvas resolution — see
        // the field pass above for why a divisor-matched offscreen and this
        // same upsample's 4-tap reconstruction were both wrong for this
        // diagnostic. `sfMapPresentPipe` blends additively (see its own
        // construction comment) so this draw sums with whatever the upsample
        // above already added.
        if (render.sfMapViewIntensity > 0) {
          pass.setPipeline(sfMapAutomaton.presentPipeline);
          pass.setBindGroup(0, sfMapAutomaton.presentBindGroup);
          pass.draw(3);
        }
        // Same shape as the sfMap draw just above, same reason:
        // full-canvas-resolution presentation, additive so it sums with
        // whatever else this pass has already drawn.
        if (render.orientationViewIntensity > 0) {
          pass.setPipeline(sfMapOrientation.presentPipeline);
          pass.setBindGroup(0, sfMapOrientation.presentBindGroup);
          pass.draw(3);
        }
        // The bubble-view overlay: an instanced draw, not a fullscreen
        // triangle like the two presents just above (each placement is its
        // own camera-facing quad, see bubblePresent.wesl). Additive, so it
        // sums with whatever this pass has already drawn; independent of
        // the other three — the SF-event catalog is a second, unrelated
        // star-formation model, not another lens on the same automaton, so
        // this is its own `if`, not an `else if` chained onto sfMap's or
        // orientation's.
        if (render.bubbleViewIntensity > 0 && bubbleInstanceCount > 0) {
          pass.setPipeline(bubblePresentPipe);
          pass.setBindGroup(0, bubblePresentBG);
          pass.setVertexBuffer(0, bubbleBuf);
          pass.draw(6, bubbleInstanceCount);
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
    encodePost(enc, ctx.getCurrentTexture().createView(), targets.ldrTex.createView(), true);
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
    setView: camera.setView,
    setAutoRotate: camera.setAutoRotate,
    setInsets: camera.setInsets,
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
      return { ...sampleLuminanceStats(a), stars: starCount };
    },
    getCamera: camera.getCamera,
    // The SSPSF automaton's packed output (sfMapPack.wesl) — a persistent
    // GPU texture, always non-null, whose CONTENT is only meaningful once
    // rebuildSfMap has run at least once (setParams). Consumed by nothing
    // yet but sfMapPresent.wesl's own overlay; exposed here for the sibling
    // UI and future consumers per the research doc §19's staging note.
    getSfMapTexture: (): GPUTexture => sfMapAutomaton.texture,
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
      const bpr = alignedBytesPerRow(S * 4);
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
      const out = swizzleToRgba(src, bpr, S, format.startsWith('bgra'));
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
      bubbleBuf.destroy();
      dustNoiseTex.destroy();
      sfMapAutomaton.dispose();
      sfMapOrientation.dispose();
      gradeBuf.destroy();
      // The size-dependent targets outlive every other resource here — they
      // are the only ones reallocated on resize, so an engine torn down and
      // rebuilt (an HMR remount hands the new engine the same canvas) leaked
      // a full set per remount until this call existed.
      targets.destroy();
      ro.disconnect();
      camera.dispose();
    },
  };
}
