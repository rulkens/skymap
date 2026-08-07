/**
 * createGalaxyEngine — GPU orchestration: the WebGPU device, every pipeline,
 * render target and bind group, and the per-frame encode. What a galaxy IS —
 * geometry, mixtures, generated buffers, the SSPISM map — lives in
 * `model/createGalaxyModel.ts`, and the orbit camera in
 * `createOrbitCameraInput`; both are driven from here.
 * `timing/timingSlots.ts` is the one account of the pass chain — a second copy
 * here would be the copy that drifts.
 *
 * ## The whole chain is the APP's, not this tool's
 *
 * A look tuned here only transfers while the two chains ARE one chain, so
 * nothing about the image is hand-matched: the sprite draws are the runtime's
 * `milkyWay/sprites/` shaders over its `io.wesl` struct, the analytic field's are
 * its `milkyWay/{field,ismMap}/`, and the post chain is the runtime's
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
import type { PassTiming } from '../../@types/engine/PassTiming';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { GalaxyIsmMap } from '../../../../src/@types/galaxy/GalaxyIsmMap';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../../src/utils/url/hasUrlGate';

import { createFrameTimer } from './timing/createFrameTimer';
import { createReportThrottle } from './timing/createReportThrottle';
import { TIMING_SLOTS } from './timing/timingSlots';
import { createRafLoop } from './createRafLoop';
import { createGalaxyRenderTargets } from './gpu/createGalaxyRenderTargets';
import type { TargetDivisors } from './gpu/createGalaxyRenderTargets';
import { createOrbitCameraInput } from './camera/createOrbitCameraInput';
import { createPassTimingWindows } from './timing/createPassTimingWindows';
import { beginClearPass } from './passes/beginClearPass';
import { encodeBloomPyramid } from './post/encodeBloomPyramid';
import { encodeDustMapPass } from './field/encodeDustMapPass';
import { encodeDustPresentPass } from './field/encodeDustPresentPass';
import { encodePresentOverlay } from './passes/encodePresentOverlay';
import { encodeSceneComposites } from './passes/encodeSceneComposites';
import { encodeSplatPass } from './field/encodeSplatPass';
import { encodeStarPass } from './sprites/encodeStarPass';
import { encodeTransmittanceDust } from './sprites/encodeTransmittanceDust';
import { createIsmMapGenerator } from './ismMap/createIsmMapGenerator';
import { createIsmMapOrientation } from './ismMap/createIsmMapOrientation';
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
import type { FieldCamera } from '../../@types/engine/FieldCamera';
import { GEN_RECORD_BYTES } from '../../../../src/services/engine/galaxyGenerator/v1/genRecordBytes';
import { createBloomPyramid } from '../../../../src/services/gpu/passes/bloomPyramid';
import { createCompositor } from '../../../../src/services/gpu/passes/compositor';
import { createAdditiveUpsample } from '../../../../src/services/gpu/passes/additiveUpsample';
import { ADDITIVE_BLEND } from '../../../../src/services/gpu/lib/blendStates';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { DEFAULT_RENDER_SETTINGS } from '../data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../data/defaultLodSettings';

import starWgsl from './shaders/milkyWay/sprites/stars.wesl?static';
import dustWgsl from './shaders/milkyWay/sprites/dust.wesl?static';
import splatWgsl from './shaders/milkyWay/field/splat.wesl?static';
import dustMapWgsl from './shaders/milkyWay/field/dustMap.wesl?static';
import dustPresentWgsl from './shaders/milkyWay/field/dustPresent.wesl?static';
import dustNoiseBakeWgsl from './shaders/milkyWay/field/dustNoiseBake.wesl?static';
import bubblePresentWgsl from './shaders/milkyWay/field/bubblePresent.wesl?static';
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

  // ---- cloud uniform buffers: ONE PER PASS ----
  // Both hold `milkyWay/sprites/io.wesl`'s `Uniforms`, and every lane but
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
  // The HII tier's own header, byte-identical layout to `fieldUbo` (same
  // `io.wesl` struct, same `splatPipe`) — see `model.hiiComps` for why the tier
  // gets its own buffers, its own target (`hiiTex`) and its own divisor
  // (`render.hiiDivisor`) rather than a slice of the field's.
  const hiiUbo = own(
    device.createBuffer({
      label: 'galaxy:hiiUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
  // The module is the runtime's `milkyWay/sprites/stars.wesl`. It must stay a
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
  // The runtime's `milkyWay/sprites/dust.wesl`, drawn FULL-RES into `sceneTex`
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
  // `milkyWay/field/dustMap.wesl`: one instanced quad per PRIMARY dust
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
  // `milkyWay/field/dustPresent.wesl`: a fullscreen triangle over `dustMapTex`,
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

  // ---- bubble-view overlay: the SF-event catalog's own placements ----
  // A SECOND, independent star-formation model (dustBubblePlacements.ts,
  // resolved from sfEventCatalog.ts) drawn as its own debug layer so it can
  // be compared directly against the SSPSF automaton's ismMap view — see the
  // model's `rebuildBubblePlacements` for how `model.bubbleComps` is built and
  // packed. One instanced camera-facing quad per
  // placement, no storage buffer/comps lookup: bubblePresent.wesl reads its
  // per-instance center/radius/kind straight off the vertex buffer, and
  // `u` (fieldUbo) only for the camera basis + its own crossfade weight —
  // so this bind group needs just binding 0, built once like
  // `ismMapPresentBG`/`orientationPresentBG` (fieldUbo's OBJECT never
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

  // One internal render bag merged by setRender (the spike's Object.assign).
  // Seeded from the same two constants the UI pushes on its first sync, so this
  // bag can't drift from the store slice + preset envelope that also seed from
  // them — and, through them, from the app's own defaults. Declared before the
  // model because the model's rebuild gates read three of its lanes live.
  const render = { ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS };

  // ---- the galaxy itself: geometry, mixtures, generated buffers ----
  // Everything derived from (params, tuning, seed) lives in the model; this
  // file keeps the pipelines, the targets and the per-frame headers. The two
  // regrow hooks are the `layout: 'auto'` contract — see the bind groups below.
  const model = createGalaxyModel({
    device,
    ismMapGenerator,
    orientation: ismMapOrientation,
    render,
    onFieldCompsRegrow: () => {
      splatBG = buildSplatBindGroup();
      dustMapBG = buildDustMapBindGroup();
    },
    onHiiCompsRegrow: () => {
      hiiBG = buildHiiBindGroup();
    },
    onStats: opts.onStats,
    onOrientationDiagnostics: opts.onOrientationDiagnostics,
  });

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
  //    everywhere splat.wesl OR dustMap.wesl imports them (both do now — the
  //    former for hiiNoiseTerm, the HII texture-breakup term), the dustDetail
  //    lane (3/7/8/9) only where dustMap.wesl imports it, dustMapSmp (6) only
  //    where splat.wesl samples `dustMapTex` through a filtered UV.
  //  - A group holds the EXACT GPUBuffer/GPUTexture objects it names. So each
  //    is a `let` + a builder, and the resource owns the rebuild: the model's
  //    two `onRegrow` hooks above for the comps buffers, and
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
        { binding: 1, resource: { buffer: model.fieldComps.buffer } },
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
        // S4's ISM-map detail term (dustDetail.wesl) rides the accumulation
        // pass now, applied per dust splat — see dustMap.wesl's fs.
        { binding: 3, resource: { buffer: ismMapGenerator.gridBuffer } },
        { binding: 7, resource: ismMapGenerator.mapSampler },
        { binding: 8, resource: ismMapGenerator.texture.createView() },
        { binding: 9, resource: ismMapGenerator.dustBlurTexture.createView() },
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
        { binding: 1, resource: { buffer: model.fieldComps.buffer } },
        { binding: 2, resource: targets.dustMapTex.createView() },
        // Bindings 4/5: dustNoiseTex/dustNoiseSampler — splat.wesl's fs now
        // imports these for hiiNoiseTerm (the HII texture-breakup term), the
        // SAME resources dustMapBG binds for the dust cloud's own erosion.
        // The field draw's own components never carry a nonzero
        // textureWeight, so this pass reads them but never samples them
        // (dustDetail.y is packed 0 here — see packFieldHeaderUniforms).
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
        // Binding 6: dustMapSmp — splat.wesl's fs now samples dustMapTex
        // through a filtered UV rather than a 1:1 texel load (see
        // dustMapTex's own declaration comment for why the divisors split).
        // No 3/7/8/9 here: S4's ISM-map detail term (dustDetail.wesl) now
        // rides dustMap.wesl's accumulation pass, not this consumer — the
        // shader no longer references those bindings, and with
        // layout:'auto' a superfluous entry is a bind-group creation ERROR.
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
        // No 3/7/8/9: S4's detail term now applies at accumulation
        // (dustMap.wesl); this pass just presents the already-modulated
        // column.
      ],
    });
  }
  // The HII pass reuses `splatPipe` itself (same shader, same emission math)
  // against its own header/storage buffers and its own target.
  // `dustMapTex`/`dustMapSampler` are bound because splat.wesl's fs samples
  // them for this pass too now: `packFieldHeaderUniforms`'s `primaryCount` is
  // packed to this pass's OWN instance count for this header (see
  // `drawFrame`), so `instanceIndex < primaryCount` is true for every HII
  // sprite and the dust-attenuation branch fires across the whole tier — the
  // same dust law the primary disc reads, so a shell embedded in a lane
  // darkens with it. No 3/7/8/9 here either, for the same reason `splatBG` has
  // none: `splatPipe`'s shader (splat.wesl) no longer references dustDetail.
  // Bindings 4/5 (dustNoiseTex/dustNoiseSampler) ARE bound and DO get
  // sampled here — this header's own `dustDetail.y`/`.z` carry the real
  // tier-global texture scale/contrast (`model.hiiTexture`), unlike
  // `splatBG`'s.
  let hiiBG: GPUBindGroup;
  function buildHiiBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:hiiBG',
      layout: splatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: hiiUbo } },
        { binding: 1, resource: { buffer: model.hiiComps.buffer } },
        { binding: 2, resource: targets.dustMapTex.createView() },
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
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
    const {
      view,
      viewProj: vp,
      aspect,
      fade,
      galaxyWeight,
      debugViews,
      ismMapChannels,
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
      dustReachR: model.dustHeaderLanes.reachR,
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
        emissionCount: model.fieldCounts.emission,
        primaryCount: model.fieldCounts.primary,
        targetSizePx: targets.reducedSize(render.fieldDivisor),
        dust: {
          count: model.fieldCounts.dust,
          // All three cached by rebuildDustMixture, not recomputed per frame.
          extinctionRgb: model.dustHeaderLanes.extinctionRgb,
          noise: model.dustHeaderLanes.noise,
          carve: model.dustHeaderLanes.carve,
          detail: model.dustHeaderLanes.detail,
          // VIEW-dependent, unlike every other lane in this bag.
          slices: dustSlices,
          mapHeightPx: targets.reducedSize(render.dustDivisor)[1],
        },
        // Each present shader reads its own view's lane out of this; bubble's
        // does so through its own bind group, bound to THIS header's
        // `fieldUbo` and never to the HII one below.
        debugViews,
        galaxyWeight,
        ismMapChannels,
        // ismMapPresent.wesl binds ONLY this header (createIsmMapOutput.ts's
        // presentBindGroup, shared by both generators) — the HII header
        // below omits this and packs the seeding lanes inert.
        ismMapSeeding: model.ismMapSeedingView,
      },
      fieldData,
    );
    device.queue.writeBuffer(fieldUbo, 0, fieldData);

    // The HII tier's own header, same camera basis, its own target's pixel
    // size. `primaryCount` is packed to this pass's OWN instance count
    // (`emissionCount` below), not the primary galaxy's — splat.wesl's fs
    // gates its attenuation branch on `input.inst < primaryCount`, which is
    // then true for every HII sprite, so the whole tier darkens under the
    // same dust law the disc reads (an embedded shell/DIG/association is not
    // exempt just because its sprite lives on its own target).
    //
    // `dust.extinctionRgb`/`.slices` carry the field header's own live values
    // — the only two lanes splat.wesl's attenuation branch reads. Everything
    // else in the bag stays INERT (matching the previous no-dust default):
    // `noise`/`detail`/`count`/`mapHeightPx` feed dustMap.wesl's
    // accumulation pass, which this draw never runs — carrying the field's
    // real `dust.noise` here would silently retune `hiiNoiseTerm`'s sampling
    // frequency (`u.dustNoise.x`, splat.wesl's OWN reader of that lane) as a
    // side effect of a fix that is only about attenuation.
    //
    // `debugViews`/`ismMapChannels` are the same values as above. Only
    // `galaxyWeight` is read by this pass's own draw (hiiBG binds none of the
    // present pipelines), but sharing them keeps HII's dimming in lockstep
    // with the rest of the galaxy under an active view.
    packFieldHeaderUniforms(
      {
        camera: fieldCamera,
        emissionCount: model.hiiComps.count,
        primaryCount: model.hiiComps.count,
        targetSizePx: targets.reducedSize(render.hiiDivisor),
        dust: {
          count: 0,
          extinctionRgb: model.dustHeaderLanes.extinctionRgb,
          noise: { tileUnits: 1, amplitude: 0, cloudOffset: 0, contrastExp: 1 },
          // S5, like `noise`/`detail` just above, feeds dustMap.wesl's
          // accumulation pass only — this draw never runs it.
          carve: { carve: 0, sharpness: 0.5, stretch: 1 },
          detail: 0,
          slices: dustSlices,
          mapHeightPx: 0,
        },
        // The tier-global texture scale/contrast — see `hiiTexture`'s own
        // doc for why only THIS header (never the field one above) carries
        // real values.
        hiiTexture: model.hiiTexture,
        debugViews,
        galaxyWeight,
        ismMapChannels,
      },
      hiiData,
    );
    device.queue.writeBuffer(hiiUbo, 0, hiiData);
    // The post chain's uniforms are written by the shared factories at draw
    // time (bloom thresholds/texel sizes, compositor exposure + curve), so
    // there is nothing else to pack here.

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
    const drawHii = model.hiiComps.count > 0;
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
      if (model.fieldCounts.dust > 0 || drawDustView || dustMapPopulated) {
        dustMapPopulated = encodeDustMapPass({
          enc,
          timestampWrites: timing.descriptorFor('dustMap'),
          targetView: targets.dustMapTex.createView(),
          pipeline: dustMapPipe,
          bindGroup: dustMapBG,
          instanceCount: model.fieldCounts.dust,
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
        instanceCount: model.fieldCounts.emission,
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
          instanceCount: model.hiiComps.count,
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
        // automaton — hence its own `if`, never an `else if`.
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
    // The SSPSF automaton's packed output (ismMapPack.wesl) — a persistent
    // GPU texture, always non-null, whose CONTENT is only meaningful once
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
