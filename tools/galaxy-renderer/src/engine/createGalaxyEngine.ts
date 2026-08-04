/**
 * createGalaxyEngine — the one GPU-orchestration module: it owns the WebGPU
 * device, every pipeline, buffer and bind group, and the per-frame encode. The
 * orbit camera lives in `createOrbitCameraInput`, driven once per frame from
 * here. `timing/timingSlots.ts` is the one account of the pass chain — a
 * second copy here would be the copy that drifts.
 *
 * ## The whole chain is the APP's, not this tool's
 *
 * A look tuned here only transfers while the two chains ARE one chain, so
 * nothing about the image is hand-matched: the sprite draws are the runtime's
 * `milkyWayCloud/` shaders over its `io.wesl` struct, the analytic field's are
 * its `milkyWayField/`, and the post chain is the runtime's
 * `createAdditiveUpsample` / `createBloomPyramid` / `createCompositor` — all
 * symlinked into this tool's WESL root (`wesl.toml`). Editing any of those
 * shaders changes both apps.
 *
 * What could NOT be shared is the ORCHESTRATION: `runBloom` and
 * `createMilkyWayCloudRenderer` each need engine-side context this tool has no
 * equivalent of (a `ReadyFrameContext`; one uniform buffer per draw, where this
 * tool draws N extras through one pipeline). So `encodeBloomPyramid` duplicates
 * `runBloom`'s pass ORDER and the cloud pipelines are built here — a change to
 * either runtime SEQUENCE has to be mirrored, a change to any shared SHADER
 * arrives for free.
 *
 * Design provenance: `docs/research/milky-way/` (its README indexes the files)
 * and `docs/superpowers/specs/completed/2026-07-02-galaxy-renderer-tool-design.md`;
 * `tools/galaxy-renderer/README.md` covers the controls and the perf HUD.
 */

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { InstanceDraw } from '../../@types/engine/InstanceDraw';
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDustParams } from '../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyDescription } from '../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxySfMapParams } from '../../../../src/@types/galaxy/GalaxySfMapParams';
import type { GalaxySfMap } from '../../../../src/@types/galaxy/GalaxySfMap';
import type { GalaxyStarFormationParams } from '../../../../src/@types/galaxy/GalaxyStarFormationParams';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './timing/createFrameTimer';
import { createReportThrottle } from './timing/createReportThrottle';
import { TIMING_SLOTS } from './timing/timingSlots';
import { createKeyedRebuild } from './createKeyedRebuild';
import { createRafLoop } from './createRafLoop';
import { createGalaxyRenderTargets } from './gpu/createGalaxyRenderTargets';
import type { TargetDivisors } from './gpu/createGalaxyRenderTargets';
import { createOrbitCameraInput } from './camera/createOrbitCameraInput';
import { createPassTimingWindows } from './timing/createPassTimingWindows';
import { beginClearPass } from './passes/beginClearPass';
import { encodeBloomPyramid } from './passes/encodeBloomPyramid';
import { encodeDustMapPass } from './passes/encodeDustMapPass';
import { encodeDustPresentPass } from './passes/encodeDustPresentPass';
import { encodePresentOverlay } from './passes/encodePresentOverlay';
import { encodeSceneComposites } from './passes/encodeSceneComposites';
import { encodeSplatPass } from './passes/encodeSplatPass';
import { encodeStarPass } from './passes/encodeStarPass';
import { encodeTransmittanceDust } from './passes/encodeTransmittanceDust';
import { createOrientationDiagnostics } from './sfMap/createOrientationDiagnostics';
import { createSfMapReadbacks } from './sfMap/createSfMapReadbacks';
import { createSfMapAutomaton } from './sfMap/createSfMapAutomaton';
import { createSfMapOrientation } from './sfMap/createSfMapOrientation';
import { createGrowOnlyRecordBuffer } from './gpu/createGrowOnlyRecordBuffer';
import { generateGalaxy } from './gpu/generateGalaxy';
import { deriveDustHeaderLanes } from './frame/deriveDustHeaderLanes';
import { gradeIsActive } from './frame/gradeIsActive';
import { toMilkyWayTuning } from './frame/toMilkyWayTuning';
import { deriveFrameView } from './frame/deriveFrameView';
import { BUBBLE_RECORD_FLOATS, packBubbleInstances } from './uniforms/packBubbleInstances';
import { createOffscreenProbe } from './probe/createOffscreenProbe';
import { CLOUD_UNIFORM_FLOATS, packCloudUniforms } from './uniforms/packCloudUniforms';
import {
  GRADE_UNIFORM_BUFFER_SIZE,
  GRADE_UNIFORM_FLOATS,
  packGradeUniforms,
} from './uniforms/packGradeUniforms';
import {
  FIELD_COMPONENT_FLOATS,
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldComponents,
  packFieldHeaderUniforms,
} from './uniforms/packFieldUniforms';
import type { FieldCamera } from '../../@types/engine/FieldCamera';
import { DEBUG_VIEWS } from '../data/debugViews';
import type { DebugViewKind } from '../../@types/data/DebugViewKind';
import { createGenerationPipelines } from '../../../../src/services/engine/galaxyGenerator/v1/createGenerationPipelines';
import {
  buildGalaxyFieldMixture,
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildHiiRegions,
  HII_MAX_COUNT,
} from '../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import {
  buildDustBubblePlacements,
  buildHiiCavityPlacements,
  BUBBLE_BUDGET,
  HII_CAVITY_BUDGET,
} from '../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';
import {
  sfMapGridRadius,
  sfMapGridRadiusOrDefault,
} from '../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import { buildDustParticleCloud } from '../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import type { OrientationDeltaStats } from '../../../../src/services/engine/galaxyGenerator/v2/clusteredDiscPlacement';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { normalizeGenerationSeed } from '../../../../src/utils/galaxy/normalizeGenerationSeed';
import { transformGalaxyFieldComponent } from '../../../../src/utils/galaxy/transformGalaxyFieldComponent';
import { GENERATION_UBO } from '../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import { GEN_RECORD_BYTES } from '../../../../src/services/engine/galaxyGenerator/v1/genRecordBytes';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';
import { ADDITIVE_BLEND } from '../../../../src/services/gpu/lib/blendStates';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { DEFAULT_RENDER_SETTINGS } from '../data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../data/defaultLodSettings';

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
 * Edge length of the baked ridged-noise volume (dustNoiseBake.wesl) —
 * 128^3 rgba8unorm, one ridged band per channel. Baked ONCE at construction
 * (view- and param-independent: four fixed octave bands, no camera/galaxy
 * input), never inside the per-frame encoder.
 */
const DUST_NOISE_TEX_SIZE = 128;

/** Matches dustNoiseBake.wesl's `@workgroup_size(4, 4, 4)`. */
const DUST_NOISE_WORKGROUP_SIZE = 4;

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
 * `fieldGeometry` + `transform` + `starFormation` are cached (like the central
 * galaxy's `fieldGeometry`/`lastParams`) so `setFieldTuning` can
 * rebuild `fieldMixture`/`hiiMixture` — this extra's world-space analytic
 * mixtures, already carried through `transformGalaxyFieldComponent` — without
 * a regenerate.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
  fieldGeometry: GalaxyDescription;
  transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
  starFormation: GalaxyStarFormationParams;
  fieldMixture: readonly GalaxyFieldComponent[];
  /** This extra's own HII tier — see `hiiMixture`'s declaration below for why it rides a separate buffer from `fieldMixture`. */
  hiiMixture: readonly GalaxyFieldComponent[];
};

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
  // their own teardown (`targets`, `sfMapAutomaton`, `sfMapOrientation`,
  // `bloomPyramid`, `compositor`, `aggregateUpsample`) keep delegating and are
  // deliberately absent here.
  const owned: (() => { destroy(): void } | null)[] = [];
  const own = <T extends { destroy(): void }>(resource: T): T => {
    owned.push(() => resource);
    return resource;
  };
  // Buffers reassigned at runtime (a regrow, or a new galaxy) register a READER
  // rather than a reference: the ledger has to destroy whatever is live at
  // dispose, not the instance the reassignment already destroyed.
  const ownLatest = (current: () => { destroy(): void } | null): void => {
    owned.push(current);
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
    own(
      device.createBuffer({
        label,
        size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );
  const starUbo = makeCloudUniformBuffer('galaxy:starUniforms');
  const dustUbo = makeCloudUniformBuffer('galaxy:dustUniforms');
  // The analytic field's own buffer, own struct — see `packFieldUniforms`.
  // It cannot share the cloud UBO: nothing in the 208-byte cloud layout is a
  // ray, and this pass reads none of the billboard lanes. Camera/params/dust-
  // law only now — the mixture itself rides `fieldComps` below, a separate
  // storage binding, so this uniform stays `FIELD_HEADER_BUFFER_SIZE`
  // regardless of how many galaxies are on screen.
  const fieldUbo = own(
    device.createBuffer({
      label: 'galaxy:fieldUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // `comps` (io.wesl binding 1): every mixture's Gaussians, central galaxy
  // then each extra, already world-transformed — a read-only STORAGE array,
  // not a uniform, specifically so N background extras can push the total
  // component count past a uniform's ~1000-component cap. Starts at
  // `GALAXY_FIELD_MAX_COMPONENTS`, one galaxy's EMISSION ceiling — the
  // trailing dust slice is a particle cloud thousands of components deep
  // (`DEFAULT_GALAXY_DUST_CLOUD_PARAMS.count`), so the first `setParams` with
  // dust on regrows this regardless.
  const fieldComps = own(
    createGrowOnlyRecordBuffer({
      device,
      label: 'galaxy:fieldComps',
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      floatsPerRecord: FIELD_COMPONENT_FLOATS,
      initialCapacity: GALAXY_FIELD_MAX_COMPONENTS,
      onRegrow: () => {
        splatBG = buildSplatBindGroup();
        dustMapBG = buildDustMapBindGroup();
      },
    }),
  );
  // The HII tier's own header + storage buffer, byte-identical layout to
  // `fieldUbo`/`fieldComps` (same `io.wesl` struct, same `splatPipe`) but
  // never concatenated into `fieldComps` — see `docs/research/milky-way/
  // hii-regions.md`: a shell sprite is small and bright by construction, so
  // sharing the smooth field's coarser target collapsed it into a bloom
  // firefly. Own buffer, own target (`hiiTex`), own divisor
  // (`render.hiiDivisor`). Capacity starts at `HII_MAX_COUNT`, the tier's own
  // per-galaxy admission ceiling (`hiiRegions.ts`).
  const hiiUbo = own(
    device.createBuffer({
      label: 'galaxy:hiiUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  const hiiComps = own(
    createGrowOnlyRecordBuffer({
      device,
      label: 'galaxy:hiiComps',
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      floatsPerRecord: FIELD_COMPONENT_FLOATS,
      initialCapacity: HII_MAX_COUNT,
      onRegrow: () => {
        hiiBG = buildHiiBindGroup();
      },
    }),
  );
  // The bubble-view overlay's own instance buffer (bubblePresent.wesl): a
  // plain VERTEX buffer, not a storage array like `fieldComps` — there is
  // no per-fragment lookup by index, just one instance-stepped attribute
  // pair per placement, so it binds into no 'auto'-layout bind group and
  // needs no `onRegrow`. Capacity starts at BUBBLE_BUDGET + HII_CAVITY_BUDGET
  // (both placement builders' own admission ceilings) so the overlay's first
  // activation never regrows.
  const bubbleComps = own(
    createGrowOnlyRecordBuffer({
      device,
      label: 'galaxy:bubbleComps',
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      floatsPerRecord: BUBBLE_RECORD_FLOATS,
      initialCapacity: BUBBLE_BUDGET + HII_CAVITY_BUDGET,
    }),
  );
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
  const dustNoiseTex = own(
    device.createTexture({
      label: 'galaxy:dustNoiseTex',
      size: [DUST_NOISE_TEX_SIZE, DUST_NOISE_TEX_SIZE, DUST_NOISE_TEX_SIZE],
      dimension: '3d',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    }),
  );
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
  // `bubbleComps` is built and packed. One instanced camera-facing quad per
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
  const genUbo = own(
    device.createBuffer({
      label: 'galaxy:genUbo',
      size: GENERATION_UBO.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );

  // ---- instance buffers (recreated on setParams) ----
  let starBuf: GPUBuffer | null = null;
  let starCount = 0;
  let dustBuf: GPUBuffer | null = null;
  let dustCount = 0;
  ownLatest(() => starBuf);
  ownLatest(() => dustBuf);
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
  let fieldGeometry: GalaxyDescription | null = null;
  let fieldTuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING;
  // What the automaton was last rebuilt against — see `setFieldTuning`.
  let sfMapKey: GalaxySfMapParams = fieldTuning.sfMap;
  // The CENTRAL galaxy's HII tier, built and cached the same way
  // `fieldMixture` is — but never concatenated into it (see `hiiTex`'s
  // declaration comment). Rebuilt on the same two triggers, packed into its
  // own `hiiComps` by `repackHiiComponents`.
  let hiiMixture: readonly GalaxyFieldComponent[] = [];
  // The analytic dust lane's mixture, CENTRAL galaxy only (grill session Q6:
  // extras get dust in a follow-up, zero rework — the packed layout already
  // carries per-galaxy dustOffset/dustCount). Cached like `fieldMixture` so
  // `setFieldTuning` can rebuild it without a regenerate.
  let dustMixture: readonly GalaxyFieldComponent[] = [];
  // What `setParams` was last handed. `setFieldTuning`, `rebuildDustMixture`,
  // `rebuildBubblePlacements` and `rebuildSfMap` all re-read it to rebuild
  // without a regenerate; each reads through the accessor below rather than a
  // field of its own, so none can go stale against this one.
  let lastParams: GalaxyParams | null = null;
  const currentDust = (): GalaxyDustParams => lastParams?.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
  const currentStarFormation = (): GalaxyStarFormationParams =>
    lastParams?.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;
  const currentSeed = (): number => normalizeGenerationSeed(lastParams?.seed);
  // Cached, not recomputed per frame: `packFieldHeaderUniforms` reads all
  // three every `drawFrame`, but they only change when `rebuildDustMixture`
  // runs. Seeded at the no-galaxy answer, which is what the first frames draw.
  let dustHeaderLanes = deriveDustHeaderLanes(null, DEFAULT_GALAXY_DUST_PARAMS, false);
  // The SSPSF chain's two CPU-side copies and the single queue that fills
  // them — see `createSfMapReadbacks`.
  const readbacks = createSfMapReadbacks({
    device,
    automaton: sfMapAutomaton,
    orientation: sfMapOrientation,
  });
  const orientationDiagnostics = createOrientationDiagnostics();

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
  // The analytic field's four groups. Two `layout: 'auto'` rules shape all of
  // them:
  //
  //  - The layout is derived from what a pipeline's OWN shader references, and
  //    a group built from one pipeline's layout fails another's draw-time
  //    compatibility check even for byte-identical WGSL. Hence four groups for
  //    three pipelines, with different binding sets: dustNoiseTex/Smp (4/5)
  //    only where dustMap.wesl imports them, dustMapSmp (6) only where
  //    splat.wesl samples `dustMapTex` through a filtered UV.
  //  - A group holds the EXACT GPUBuffer/GPUTexture objects it names. So each
  //    is a `let` + a builder, and the resource owns the rebuild: the two
  //    `createGrowOnlyRecordBuffer` `onRegrow` hooks above, and
  //    `rebuildDustMapDependents` below for `dustMapTex`.
  //
  // Only `dustMapBG` can build here. The other three bind `dustMapTex`, which
  // `targets` has not allocated yet.
  let dustMapBG = buildDustMapBindGroup();
  function buildDustMapBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:dustMapBG',
      layout: dustMapPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 1, resource: { buffer: fieldComps.buffer } },
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
        { binding: 1, resource: { buffer: fieldComps.buffer } },
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
  // The HII pass reuses `splatPipe` itself (same shader, same emission math)
  // against its own header/storage buffers and its own target.
  // `dustMapTex`/`dustMapSampler` are bound because splat.wesl's fs imports
  // both unconditionally, but `packFieldHeaderUniforms`'s `primaryCount` is
  // always packed 0 for this header (see `drawFrame`), so the dust-attenuation
  // branch never triggers — HII does not (yet) darken under the lane it may
  // sit inside.
  let hiiBG: GPUBindGroup;
  function buildHiiBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:hiiBG',
      layout: splatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: hiiUbo } },
        { binding: 1, resource: { buffer: hiiComps.buffer } },
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

  /**
   * Everything downstream of a `dustMapTex` recreation (every resize, every
   * `dustDivisor` move): the three bind groups holding a view of it, plus the
   * stale-map latch — a fresh texture is zero-initialised, so the latch resets
   * with it. Also the FIRST build of those three, which is why `targets` must
   * fire this once during `rebuildAll`.
   */
  function rebuildDustMapDependents(): void {
    splatBG = buildSplatBindGroup();
    hiiBG = buildHiiBindGroup();
    dustPresentBG = buildDustPresentBindGroup();
    dustMapPopulated = false;
  }

  // ---- size-dependent targets: HDR scene + star aggregate + bloom mips + LDR ----
  //
  // Allocates nothing yet — the first `rebuildAll` is the unconditional one
  // below the ResizeObserver, once the canvas has adopted its backing size.
  // The callback stays on this side because the groups also read
  // `fieldUbo`/`hiiUbo`/the comps buffers, which the target module has no
  // business knowing about.
  const targets = createGalaxyRenderTargets(
    device,
    canvas,
    { hdr: HDR, swap: format, dustMap: DUST_MAP_FORMAT },
    rebuildDustMapDependents,
  );

  // ---- camera state (orbit) ----
  const camera = createOrbitCameraInput(canvas, { autoRotate: opts.autoRotate !== false });

  // One internal render bag merged by setRender (the spike's Object.assign).
  // Seeded from the same two constants the UI pushes on its first sync, so this
  // bag can't drift from the store slice + preset envelope that also seed from
  // them — and, through them, from the app's own defaults.
  const render = { ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS };
  // What the orientation chain was last invalidated at — see `setRender`.
  let orientationSigmaDerivKey = render.orientationSigmaDerivTexels;
  let orientationSigmaIntegKey = render.orientationSigmaIntegTexels;

  // One debug view's live weight, through `DEBUG_VIEWS` rather than a named
  // settings key — what the rebuild gates' `wanted` predicates read. Passes
  // and uniform packs take the whole record off `deriveFrameView` instead, so
  // a pass and its own header agree; both read the same `render` bag.
  const viewIntensity = (kind: DebugViewKind): number => render[DEBUG_VIEWS[kind].intensityKey];

  // The targets module never reads the render bag, so both of its entry points
  // are handed all four divisors at once.
  const allDivisors = (): TargetDivisors => ({
    aggregate: render.aggregateDivisor,
    field: render.fieldDivisor,
    dust: render.dustDivisor,
    hii: render.hiiDivisor,
  });

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  // One scratch serves both cloud passes: each pack writes every lane before
  // its `writeBuffer`, so nothing of the star pass's fill survives into the
  // dust pass's. (The BUFFERS still have to be separate — see
  // `makeCloudUniformBuffer`.)
  const cloudData = new Float32Array(CLOUD_UNIFORM_FLOATS);
  const fieldData = new Float32Array(FIELD_HEADER_FLOATS);
  const hiiData = new Float32Array(FIELD_HEADER_FLOATS);
  const gradeData = new Float32Array(GRADE_UNIFORM_FLOATS);

  // How the last `repackFieldComponents` concatenation sliced `fieldComps`:
  // `emission` components then `dust` ones, of which the first `primary`
  // belong to the central galaxy. `emission` is what `drawFrame`'s splat draw
  // instances — the trailing dust slice is only ever read from inside an
  // emission fragment, never drawn as its own quad — so it is deliberately
  // NOT `fieldComps.count`, which counts both slices.
  let fieldCounts = { emission: 0, primary: 0, dust: 0 };

  /**
   * scheduleSfMapReadback — what the engine does WHEN the one-per-generation
   * copy of `sfMapTex` lands. Called from `rebuildSfMap`'s own two exits with
   * the grid it just wrote, so `GalaxySfMap.rMin/rMax` always matches the
   * CONTENT being copied.
   *
   * DETERMINISM: the copy lands asynchronously, so the dust mixture built
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
    readbacks.requestSfMap(grid, () => {
      if (fieldTuning.sfMapDustSeeding) {
        rebuildDustMixture();
        repackFieldComponents();
      }
    });
  }

  /**
   * scheduleOrientationReadback — the same, for the CPU copy of
   * `orientationTex`. Gated by `orientationDataRebuild` on
   * `fieldTuning.sfMapDustSeeding`: the dust placement is the only consumer of
   * the CPU copy, the debug overlay samples `orientationTex` on the GPU
   * directly.
   */
  function scheduleOrientationReadback(grid: GalaxySfMapGridRadius): void {
    readbacks.requestOrientation(grid, ({ data }) => {
      // Folded in once here, at the one point a fresh grid exists — not per
      // frame or per dust build.
      orientationDiagnostics.noteCoherence(data);
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
    opts.onOrientationDiagnostics?.(
      orientationDiagnostics.report({
        hasData: readbacks.orientationData !== null,
        generation: readbacks.orientationGeneration,
      }),
    );
  }

  /**
   * The CPU copy of the orientation field. Only the dust placement reads it,
   * so seeding alone decides whether a readback is worth scheduling.
   */
  const orientationDataRebuild = createKeyedRebuild({
    wanted: () => fieldTuning.sfMapDustSeeding,
    build: () => scheduleOrientationReadback(sfMapGridRadiusOrDefault(fieldGeometry)),
  });

  /**
   * The GPU structure-tensor chain (sfMapOrientationField -> Tensor ->
   * TensorBlur -> Coherence, see that quartet's own headers) over the CURRENT
   * `sfMapTex`. Two independent consumers — the debug overlay reads the
   * texture on the GPU, the dust placement reads the CPU copy above — either
   * one enough to justify the six dispatches. Unlike the deleted CPU build this
   * needs no readback to run FROM: sfMapTex is a GPU texture already and
   * WebGPU zero-initialises it, so dispatching before `rebuildSfMap` has ever
   * populated it is safe.
   *
   * Invalidated by `rebuildSfMap` (a new automaton state is a new field) and
   * by a sigma move in `setRender`.
   */
  const orientationTexRebuild = createKeyedRebuild({
    wanted: () => viewIntensity('orientation') > 0 || fieldTuning.sfMapDustSeeding,
    build: () => {
      sfMapOrientation.dispatch({
        grid: sfMapGridRadiusOrDefault(fieldGeometry),
        sigmaDerivTexels: render.orientationSigmaDerivTexels,
        sigmaIntegTexels: render.orientationSigmaIntegTexels,
      });
      orientationDataRebuild.invalidate();
    },
  });

  /**
   * rebuildDustMixture — the central galaxy's dust mixture from the CACHED
   * geometry + dust params, gated on `fieldTuning.dustEnabled` the same way
   * `discEnabled`/`armsEnabled` gate their own shader loops (an off pill
   * skips the shader work entirely, not just zeroes tau). Called from
   * `setParams` (new geometry or dust params arrived) and `setFieldTuning`
   * (toggle, or any tuning-driven geometry that later feeds dust) — the two
   * repack triggers `fieldMixture` itself uses — and again from each readback
   * landing above, which is the only way a map the placement seeds from can
   * arrive after the build that asked for it.
   *
   * `buildDustParticleCloud` is the ONLY dust tier (the smooth analytic lane
   * it used to be layered on was deleted — see `galaxyDustMixture.ts`'s
   * header), drawn through the dustMap splat pipeline. `currentSeed()`, not
   * a literal, so this galaxy's particle placement is reproducible from
   * `setParams`'s params alone.
   *
   * Also refreshes `dustHeaderLanes` off the same inputs — see
   * `deriveDustHeaderLanes` — and folds the "delta actually applied" pair
   * into `orientationDiagnostics` from a fresh `OrientationDeltaStats`
   * accumulator handed to `buildDustParticleCloud` as a pure out-param (see
   * that type's own doc). The `else` branch below (dust off, or no geometry
   * yet) leaves the accumulator untouched at its zeroed default, which is the
   * honest answer: no placement ran, so no delta was applied.
   */
  function rebuildDustMixture(): void {
    const dust = currentDust();
    dustHeaderLanes = deriveDustHeaderLanes(fieldGeometry, dust, fieldTuning.dustEnabled);
    const orientationDeltaStats: OrientationDeltaStats = {
      count: 0,
      sumAbsDeltaDeg: 0,
      maxAbsDeltaDeg: 0,
    };
    if (fieldGeometry && fieldTuning.dustEnabled) {
      const cloudMixture = buildDustParticleCloud(
        fieldGeometry,
        dust,
        fieldTuning,
        currentSeed(),
        readbacks.sfMapData,
        readbacks.orientationData,
        orientationDeltaStats,
      );
      dustMixture = [...cloudMixture];
    } else {
      dustMixture = [];
    }
    orientationDiagnostics.noteDelta(orientationDeltaStats);
    reportOrientationDiagnostics();
  }

  /**
   * rebuildBubblePlacements — the SF-event catalog's own bubble/cavity
   * placements (dustBubblePlacements.ts's `buildDustBubblePlacements` +
   * `buildHiiCavityPlacements`), packed into `bubbleComps` for the bubble-view
   * debug overlay. A SECOND, independent star-formation model — both
   * builders read the SAME `sfEventCatalog.ts` events the SSPSF automaton
   * never sees — drawn so it can be compared directly against the
   * automaton's own sfMap view. Central galaxy only, from the cached
   * `fieldGeometry` + `lastParams` — the same inputs `rebuildDustMixture`
   * reads, and invalidated from the same two sites (`setParams`,
   * `setFieldTuning`), right after it.
   *
   * Ungated: `bubblePlacements` owns whether this is worth running.
   */
  function rebuildBubblePlacements(): void {
    const relics = fieldGeometry
      ? buildDustBubblePlacements(
          fieldGeometry,
          currentDust(),
          currentStarFormation(),
          fieldTuning,
          currentSeed(),
        )
      : [];
    const cavities = fieldGeometry
      ? buildHiiCavityPlacements(
          fieldGeometry,
          currentDust(),
          currentStarFormation(),
          fieldTuning,
          currentSeed(),
        )
      : [];
    bubbleComps.write(packBubbleInstances(relics, cavities));
  }

  /** Nothing here is worth building while the overlay nobody is looking at is off. */
  const bubblePlacements = createKeyedRebuild({
    wanted: () => viewIntensity('bubble') > 0,
    build: rebuildBubblePlacements,
  });

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
      seed: currentSeed(),
    });
    scheduleSfMapReadback(grid);
    orientationTexRebuild.invalidate();
  }

  /**
   * repackFieldComponents — flattens the central galaxy's emission mixture,
   * every extra's (each already carried into world space by
   * `transformGalaxyFieldComponent` at the point it was built), then the
   * central galaxy's dust mixture LAST, into one list and rewrites
   * `fieldComps`. Called whenever any mixture changes — `setParams`,
   * `setExtras`, `setFieldTuning`, and each readback landing that rebuilds
   * the dust mixture — never per frame, unlike the header (see
   * `packFieldUniforms`'s header for why the two are split).
   *
   * Dust trails every emission component (never interleaved) so
   * `dustOffset == fieldCounts.emission` always holds without a separate
   * bookkeeping pass — see io.wesl's layout comment.
   */
  function repackFieldComponents(): void {
    const emission: GalaxyFieldComponent[] = [...fieldMixture];
    for (const e of extras) emission.push(...e.fieldMixture);
    fieldCounts = {
      emission: emission.length,
      primary: fieldMixture.length,
      dust: dustMixture.length,
    };
    const combined = fieldCounts.dust > 0 ? [...emission, ...dustMixture] : emission;
    fieldComps.write(packFieldComponents(combined));
  }

  /**
   * repackHiiComponents — `repackFieldComponents`'s exact counterpart for the
   * HII tier: central galaxy's `hiiMixture` then every extra's, into
   * `hiiComps`. A SEPARATE buffer rather than a fifth slice of
   * `fieldComps` — see `hiiTex`'s declaration comment for why this tier
   * cannot share the field's target, and a shared BUFFER with a separate
   * TARGET would still mean one draw call painting into two attachments,
   * which WebGPU has no way to do. Called from the three sites that can change
   * an HII mixture (`setParams`, `setFieldTuning`, `setExtras`), immediately
   * after `repackFieldComponents`; the readback landings rebuild dust alone
   * and leave this tier untouched.
   */
  function repackHiiComponents(): void {
    const combined: GalaxyFieldComponent[] = [...hiiMixture];
    for (const e of extras) combined.push(...e.hiiMixture);
    hiiComps.write(packFieldComponents(combined));
  }

  /**
   * galaxyMixtures — one galaxy's two analytic tiers off ONE geometry: the
   * emission field and the HII shells, both against the live `fieldTuning`,
   * and both carried into world space when a `transform` is given (an extra;
   * the central galaxy passes none and stays in its own frame).
   *
   * `geometry.seed` is what `buildHiiRegions` was called with when it still
   * lived inside `buildGalaxyFieldMixture` — the field's own generated seed,
   * not a re-derivation.
   */
  function galaxyMixtures(
    geometry: GalaxyDescription,
    starFormation: GalaxyStarFormationParams,
    transform?: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): { field: readonly GalaxyFieldComponent[]; hii: readonly GalaxyFieldComponent[] } {
    const place = (components: readonly GalaxyFieldComponent[]): readonly GalaxyFieldComponent[] =>
      transform ? components.map((c) => transformGalaxyFieldComponent(c, transform)) : components;
    return {
      field: place(buildGalaxyFieldMixture(geometry, fieldTuning)),
      hii: place(buildHiiRegions(geometry, fieldTuning, starFormation, geometry.seed)),
    };
  }

  /**
   * setParams — regenerate the central galaxy, then rebuild everything derived
   * from its geometry (both analytic tiers, the dust cloud, the SSPSF map).
   *
   * The write order — `queue.writeBuffer(genUbo, ...)`, THEN the compute passes
   * recorded into a fresh encoder, THEN `queue.submit` — is what makes this
   * safe on one shared `GPUQueue` without a readback: WebGPU processes
   * everything enqueued on a queue in submission order, so by the time this
   * submit's compute passes run on the GPU, the preceding `writeBuffer` has
   * already landed. That is NOT the same shape as the standing
   * writeBuffer-vs-submit trap (`makeCloudUniformBuffer` above, and
   * `generate.wesl`'s `writeStar`) — that trap is multiple writeBuffer/submit
   * pairs racing to mutate ONE shared buffer read by draws recorded at
   * different times; here there is exactly one write, one encoder, one submit,
   * for a buffer nothing else touches concurrently. The same ordering
   * guarantee is why the promise can resolve right after `submit`, with no
   * `mapAsync` wait: any `drawFrame` encoded afterwards shares this queue too,
   * so its draws are guaranteed to run after this submit's writes land.
   */
  async function setParams(p: GalaxyParams): Promise<void> {
    lastParams = p;
    const enc = device.createCommandEncoder({ label: 'galaxy:generate' });
    if (starBuf) starBuf.destroy();
    if (dustBuf) dustBuf.destroy();
    const generated = generateGalaxy({
      device,
      pipelines: genPipelines,
      params: p,
      spec: null,
      ubo: genUbo,
      encoder: enc,
    });
    // Assigned back into the `let`s the ownership ledger's `ownLatest` readers
    // close over, so `dispose` destroys these and not the pair just destroyed.
    starBuf = generated.starBuf;
    starCount = generated.starCount;
    dustBuf = generated.dustBuf;
    dustCount = generated.dustCount;

    fieldGeometry = generated.geometry;
    // `sfMapGridRadius` depends on `fieldGeometry` alone, so most params —
    // dust `share`, cloud counts, colours — leave the grid untouched and the
    // cached readbacks usable; see `dropIfGridMoved`.
    readbacks.dropIfGridMoved(sfMapGridRadius(fieldGeometry));
    const mixtures = galaxyMixtures(fieldGeometry, currentStarFormation());
    fieldMixture = mixtures.field;
    hiiMixture = mixtures.hii;
    rebuildDustMixture();
    bubblePlacements.invalidate();
    repackFieldComponents();
    repackHiiComponents();
    // Always — a new galaxy means new geometry/arms, so the automaton and
    // the ridge it forces against are both stale otherwise.
    rebuildSfMap();

    device.queue.submit([enc.finish()]);
    opts.onStats?.({ stars: generated.plannedStars, dust: generated.dustCount });
  }

  // Every knob here reaches the next frame through the uniform pack, so a
  // merge is all that is needed — except the four divisors, which size render
  // targets. `setDivisors` owns that comparison (it keys on the live
  // textures' pixel sizes), so this can hand it the whole bag on every push.
  function setRender(patch: Partial<RenderSettings & LodSettings>): void {
    Object.assign(render, patch);
    targets.setDivisors(allDivisors());
    // The two sigmas are the only lanes in this bag the orientation chain
    // reads, and the bridge re-pushes the WHOLE bag on any knob — so an
    // unconditional invalidate here would redispatch the six stages, and with
    // `sfMapDustSeeding` on (the default) the readback and dust rebuild behind
    // them, on every frame of an unrelated exposure drag. No crossing to catch
    // alongside them: an invalidation raised while nothing wanted the value is
    // retained, so the overlay turning on rebuilds by itself.
    if (
      orientationSigmaDerivKey !== render.orientationSigmaDerivTexels ||
      orientationSigmaIntegKey !== render.orientationSigmaIntegTexels
    ) {
      orientationSigmaDerivKey = render.orientationSigmaDerivTexels;
      orientationSigmaIntegKey = render.orientationSigmaIntegTexels;
      orientationTexRebuild.invalidate();
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
    fieldTuning = { ...fieldTuning, ...patch };
    if (fieldGeometry) {
      const mixtures = galaxyMixtures(fieldGeometry, currentStarFormation());
      fieldMixture = mixtures.field;
      hiiMixture = mixtures.hii;
    }
    extras = extras.map((e) => {
      const mixtures = galaxyMixtures(e.fieldGeometry, e.starFormation, e.transform);
      return { ...e, fieldMixture: mixtures.field, hiiMixture: mixtures.hii };
    });
    rebuildDustMixture();
    bubblePlacements.invalidate();
    repackFieldComponents();
    repackHiiComponents();
    // The automaton rebuild is N compute dispatches (rebuildSfMap's own
    // docblock) — far more expensive than the CPU mixture rebuilds above, so
    // it only reruns when `sfMap` itself changed, not on every unrelated
    // slider (armWidthScale etc. technically also feed the ridge the forcing
    // field bakes, but re-triggering on every tuning field would make dragging
    // any OTHER slider pay this pass's cost too — a follow-up if that
    // dependency ever needs to be exact).
    //
    // Reference identity IS the change signal: `sfMap` is only ever replaced
    // wholesale, by the UI's `patchSfMap` building a fresh `{ ...sfMap,
    // ...patch }` and by immer keeping the old object otherwise.
    if (sfMapKey !== fieldTuning.sfMap) {
      sfMapKey = fieldTuning.sfMap;
      rebuildSfMap();
    }
  }

  /**
   * The three GPU allocations one extra owns. Its own function because the
   * list is torn down from two places — `setExtras` replacing it, and
   * `dispose` — and the ownership ledger cannot hold a list whose length
   * changes.
   */
  function destroyExtras(list: readonly Extra[]): void {
    for (const e of list) {
      e.starBuf.destroy();
      e.dustBuf?.destroy();
      e.ubo.destroy();
    }
  }

  // Replace the set of background galaxies. Each runs the same
  // `generateGalaxy` the central one does, differing only in the `spec` it
  // passes: the transform + size scale ride that spec into the UBO's extra
  // lanes, so the compute passes emit records already placed in the scene.
  // ONE shared encoder for every extra, submitted once.
  //
  // The whole body is synchronous up to that single submit — no `await` splits
  // the destroy-old / build-new sequence, so replacing the extras is atomic per
  // call and needs no interleaving guard: the old buffers are torn down and the
  // new ones built with nothing able to run in between. The `async` signature
  // is kept only because `GalaxyEngineHandle` declares it; nothing is awaited.
  async function setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void> {
    destroyExtras(extras);
    extras = [];

    const enc = device.createCommandEncoder({ label: 'galaxy:generateExtras' });
    for (const spec of specs) {
      // Its own UBO, retained with the buffers it produced — one shared buffer
      // can't serve N extras in one submit (see `genUbo`'s declaration).
      const ubo = device.createBuffer({
        label: 'galaxy:extraGenUbo',
        size: GENERATION_UBO.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const generated = generateGalaxy({
        device,
        pipelines: genPipelines,
        params: spec.params,
        spec,
        ubo,
        encoder: enc,
      });

      // The mixtures land in world space through the SAME rigid transform
      // `applyExtraTransform` bakes into the sprites (see
      // `transformGalaxyFieldComponent`'s header), so the two representations
      // of this background galaxy register with each other.
      const transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'> = {
        pos: spec.pos,
        scale: spec.scale,
        rotY: spec.rotY,
        tiltX: spec.tiltX,
      };
      // This extra's OWN draw (`randomGalaxyParams` rolls `sfActivity` per
      // galaxy), never the shared default — the tier is what makes one
      // background galaxy read as more actively star-forming than the next.
      const starFormation = spec.params.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;
      const mixtures = galaxyMixtures(generated.geometry, starFormation, transform);

      extras.push({
        starBuf: generated.starBuf,
        starCount: generated.starCount,
        dustBuf: generated.dustBuf,
        dustCount: generated.dustCount,
        ubo,
        fieldGeometry: generated.geometry,
        transform,
        starFormation,
        fieldMixture: mixtures.field,
        hiiMixture: mixtures.hii,
      });
    }
    device.queue.submit([enc.finish()]);
    repackFieldComponents();
    repackHiiComponents();
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
    const {
      view,
      viewProj: vp,
      aspect,
      fade,
      galaxyWeight,
      debugViews,
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
      dustReachR: dustHeaderLanes.reachR,
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
    const tuning = toMilkyWayTuning(render, starCount);
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
    // The analytic field's ray basis, shared by both headers below. `aspect`
    // is the PROJECTION's (the canvas's), not the aggregate's: the fullscreen
    // triangle covers the aggregate, but the frustum it must reconstruct is
    // the one `proj` was built with.
    const fieldCamera: FieldCamera = {
      eye,
      view,
      fov,
      aspect,
      lensShiftX: shiftX,
      exposure: analyticExposure,
    };
    packFieldHeaderUniforms(
      {
        camera: fieldCamera,
        emissionCount: fieldCounts.emission,
        primaryCount: fieldCounts.primary,
        targetSizePx: targets.reducedSize(render.fieldDivisor),
        dust: {
          count: fieldCounts.dust,
          // Both cached by rebuildDustMixture, not recomputed per frame.
          extinctionRgb: dustHeaderLanes.extinctionRgb,
          noise: dustHeaderLanes.noise,
          // VIEW-dependent, unlike every other lane in this bag.
          slices: dustSlices,
          mapHeightPx: targets.reducedSize(render.dustDivisor)[1],
        },
        // Each present shader reads its own view's lane out of this; bubble's
        // does so through its own bind group, bound to THIS header's
        // `fieldUbo` and never to the HII one below.
        debugViews,
        galaxyWeight,
        sfMapChannels,
      },
      fieldData,
    );
    device.queue.writeBuffer(fieldUbo, 0, fieldData);

    // The HII tier's own header, same camera basis, its own target's pixel
    // size, and no dust: `primaryCount` 0 means splat.wesl's fs gates its
    // attenuation branch on `input.inst < 0`, which is never true, so it
    // always takes the plain (unattenuated) emission path — HII does not
    // (yet) darken under the dust lane it may physically sit inside.
    //
    // `debugViews`/`sfMapChannels` are the same values as above. Only
    // `galaxyWeight` is read by this pass's own draw (hiiBG binds none of the
    // present pipelines), but sharing them keeps HII's dimming in lockstep
    // with the rest of the galaxy under an active view.
    packFieldHeaderUniforms(
      {
        camera: fieldCamera,
        emissionCount: hiiComps.count,
        primaryCount: 0,
        targetSizePx: targets.reducedSize(render.hiiDivisor),
        debugViews,
        galaxyWeight,
        sfMapChannels,
      },
      hiiData,
    );
    device.queue.writeBuffer(hiiUbo, 0, hiiData);
    // The post chain's uniforms are written by the shared factories at draw
    // time (bloom thresholds/texel sizes, compositor exposure + curve), so
    // there is nothing else to pack here.

    // Before the encoder exists, not after: a rebuild can destroy and replace
    // `bubbleComps`'s buffer, which a recorded draw would already be holding, and the
    // orientation chain submits an encoder of its own that must precede this
    // frame's. Texture before CPU copy — the first invalidates the second.
    const bubblesLive = bubblePlacements.ensureFresh();
    orientationTexRebuild.ensureFresh();
    orientationDataRebuild.ensureFresh();

    const timingCtx = timing.beginFrame();
    const enc = device.createCommandEncoder({ label: 'galaxy:frame' });
    // Star pass: additive billboards into the reduced-resolution aggregate,
    // like the app's `mw-aggregate` row. `spriteField` (OFF at boot — see
    // `defaultRenderSettings.ts`) is the one thing that empties this list, and
    // it empties it wholesale: sprites off has to mean sprite COST off, which
    // an empty list gives (`encodeStarPass` then issues only its clear). The
    // four debug views never suppress a draw — they dim the galaxy through
    // fadeAlpha's debugGalaxyWeight factor (packed above), which is what makes
    // k=0.5 read as half galaxy / half map instead of a hard cut. Built here,
    // per frame, because every buffer in it is reallocated by
    // `setParams`/`setExtras`.
    //
    // No `setViewport` anywhere below: the pass's only attachment IS
    // `aggregateTex`, and a pass's default viewport is its attachment's full
    // size — the same `floor(canvas / divisor)` the uniform above was packed
    // with.
    const starInstances: InstanceDraw[] = [];
    if (render.spriteField) {
      if (starBuf) starInstances.push({ buf: starBuf, count: starCount });
      for (const e of extras) starInstances.push({ buf: e.starBuf, count: e.starCount });
    }
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
    const drawHii = hiiComps.count > 0;
    const drawDustView = debugViews.dust > 0;
    if (analytic) {
      // Dust-column map: splat the primary's dust slice into `dustMapTex`, at
      // its own divisor-matched resolution (`dustMapPipe`, additive). Feeds
      // splat.wesl's fs (the grey/RGB split) always now, and IS the
      // dustPresent pass's own source whenever the JWST view is live — so it
      // has to run whenever either consumer needs it: `dustViewIntensity > 0`
      // (the image itself) or a nonzero dust slice.
      //
      // The third disjunct is `dustMapPopulated`: a skipped pass leaves the
      // last frame's contents, so the frame the dust count drops to zero still
      // has to run — as the clear that empties the map. Assigning the returned
      // latch is what carries that across; drop the assignment and the map
      // freezes at the previous galaxy's dust.
      if (fieldCounts.dust > 0 || drawDustView || dustMapPopulated) {
        dustMapPopulated = encodeDustMapPass({
          enc,
          timestampWrites: timing.descriptorFor('dustMap'),
          targetView: targets.dustMapTex.createView(),
          pipeline: dustMapPipe,
          bindGroup: dustMapBG,
          instanceCount: fieldCounts.dust,
        });
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
          pipeline: dustPresentPipe,
          bindGroup: dustPresentBG,
        });
      }

      // One draw for the WHOLE emission list `repackFieldComponents` wrote —
      // central galaxy's components then every extra's — so the field pass's
      // timing slot honestly reports the analytic cost of everything on
      // screen, not just the central galaxy's share. `fieldCounts.emission`,
      // NOT the packed total: the trailing dust slice is never drawn as its
      // own quad, only read from inside a primary emission fragment. Always
      // runs now (no debug-view gate) — splat.wesl's fs dims its own output
      // through debugView.w, the same combined weight the sprites dim by.
      encodeSplatPass({
        enc,
        label: 'galaxy:fieldPass',
        timestampWrites: timing.descriptorFor('field'),
        targetView: targets.fieldTex.createView(),
        pipeline: splatPipe,
        bindGroup: splatBG,
        instanceCount: fieldCounts.emission,
      });

      // The HII tier's own pass — see `hiiTex`'s declaration comment for why
      // it shares neither the field's bind group nor its target.
      // Gated only on a nonempty HII tier now — the old `!render.dustView`
      // half of this existed because the field pass used to skip entirely
      // under the JWST view, leaving `hiiTex` stale; the field pass no longer
      // skips, so that concern is gone.
      if (drawHii) {
        encodeSplatPass({
          enc,
          label: 'galaxy:hiiPass',
          timestampWrites: timing.descriptorFor('hii'),
          targetView: targets.hiiTex.createView(),
          pipeline: splatPipe,
          bindGroup: hiiBG,
          instanceCount: hiiComps.count,
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
      // its own weight (splat.wesl's debugView.w, or a present shader's own
      // debugView.x/.y/.z) — nothing picks one exclusively any more. The list
      // order is the composite order: aggregate, analytic field, HII tier,
      // JWST view. See `hiiTex`'s declaration comment for why HII rides its
      // own target rather than joining the field's draw.
      const compositeViews = [targets.aggregateTex.createView()];
      if (analytic) {
        compositeViews.push(targets.fieldTex.createView());
        if (drawHii) compositeViews.push(targets.hiiTex.createView());
        if (drawDustView) compositeViews.push(targets.dustViewTex.createView());
      }
      encodeSceneComposites(pass, aggregateUpsample, compositeViews);
      if (analytic) {
        // The two diagnostics below present straight into `sceneTex` at full
        // canvas resolution — see the field pass above for why a
        // divisor-matched offscreen and the upsample's 4-tap reconstruction
        // were both wrong for them. Both pipelines blend additively, so each
        // sums with whatever the composites already added.
        if (debugViews.sfMap > 0) {
          encodePresentOverlay(
            pass,
            sfMapAutomaton.presentPipeline,
            sfMapAutomaton.presentBindGroup,
          );
        }
        if (debugViews.orientation > 0) {
          encodePresentOverlay(
            pass,
            sfMapOrientation.presentPipeline,
            sfMapOrientation.presentBindGroup,
          );
        }
        // The bubble-view overlay is instanced rather than a covering triangle
        // (one camera-facing quad per placement, see bubblePresent.wesl), and
        // independent of the other three: the SF-event catalog is a second,
        // unrelated star-formation model, not another lens on the same
        // automaton — hence its own `if`, never an `else if`.
        //
        // Both conjuncts, and neither is the other's duplicate: `bubblesLive`
        // is "a consumer wants this", `bubbleComps.count` is "we have
        // geometry to draw". Nothing rebuilds on the falling edge, so the
        // count outlives the overlay being switched off.
        if (bubblesLive && bubbleComps.count > 0) {
          encodePresentOverlay(pass, bubblePresentPipe, bubblePresentBG, {
            buf: bubbleComps.buffer,
            count: bubbleComps.count,
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
      const dustInstances: InstanceDraw[] = [];
      if (dustBuf) dustInstances.push({ buf: dustBuf, count: dustCount });
      for (const e of extras) {
        if (e.dustBuf) dustInstances.push({ buf: e.dustBuf, count: e.dustCount });
      }
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
    starCount: () => starCount,
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
    setParams,
    setRender,
    setFieldTuning,
    setView: camera.setView,
    setAutoRotate: camera.setAutoRotate,
    setInsets: camera.setInsets,
    setExtras,
    step: (now?: number): void => drawFrame(now ?? performance.now()),
    sample: probe.sample,
    getCamera: camera.getCamera,
    // The SSPSF automaton's packed output (sfMapPack.wesl) — a persistent
    // GPU texture, always non-null, whose CONTENT is only meaningful once
    // rebuildSfMap has run at least once (setParams). Consumed by nothing
    // yet but sfMapPresent.wesl's own overlay; exposed here for the sibling
    // UI and future consumers, per `docs/research/milky-way/sf-map.md`'s
    // staging note (overlay first, consumed by nothing).
    getSfMapTexture: (): GPUTexture => sfMapAutomaton.texture,
    // The CPU-side readback of the same output (`scheduleSfMapReadback`):
    // null until the first one lands. Consumed by `buildDustParticleCloud`
    // via `sfMapDustSeeding` today; exposed here for future consumers too.
    getSfMapData: (): GalaxySfMap | null => readbacks.sfMapData,
    grab: probe.grab,
    dispose(): void {
      rafLoop.stop();
      unsubscribeTiming();
      timing.destroy();
      bloomPyramid.destroy();
      compositor.destroy();
      aggregateUpsample.destroy();
      sfMapAutomaton.dispose();
      sfMapOrientation.dispose();
      // The size-dependent targets outlive every other resource here — they
      // are the only ones reallocated on resize, so an engine torn down and
      // rebuilt (an HMR remount hands the new engine the same canvas) leaked
      // a full set per remount until this call existed.
      targets.destroy();
      probe.destroy();
      destroyExtras(extras);
      for (let i = owned.length - 1; i >= 0; i--) owned[i]!()?.destroy();
      ro.disconnect();
      camera.dispose();
    },
  };
}
