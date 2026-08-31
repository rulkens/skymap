/**
 * createGalaxyFieldRenderer — one instantiable owner of the v2 analytic
 * field: the Gaussian-mixture + HII component buffers, the fluid ISM map and
 * its orientation/CDF/placement chain, the six splat pipelines and the
 * per-frame encode. The host owns the render targets, the camera, the sprite
 * tier and every CPU readback.
 *
 * Construction order below is load-bearing (`fieldUbo` before the ISM chain
 * before `createFieldPipelines`) — see the block comments at each step.
 */
import type { DustHeaderLanes } from '../../../../@types/galaxy/DustHeaderLanes';
import type { ExtraGalaxySpec } from '../../../../@types/galaxy/ExtraGalaxySpec';
import type { FieldSliceCounts } from '../../../../@types/galaxy/FieldSliceCounts';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldComponent } from '../../../../@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldMixtureResult } from '../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyIsmMapFluidParams } from '../../../../@types/galaxy/GalaxyIsmMapFluidParams';
import type { GalaxyIsmMapParams } from '../../../../@types/galaxy/GalaxyIsmMapParams';
import type { HiiSegment } from '../../../../@types/galaxy/HiiSegment';
import type { HiiTextureLanes } from '../../../../@types/galaxy/HiiTextureLanes';
import type { HiiTier } from '../../../../@types/galaxy/HiiTier';
import type { IsmMapSeedingLanes } from '../../../../@types/galaxy/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../../../../@types/galaxy/YoungStarsLanes';
import type { TimingSlotName } from '../../../../@types/gpu/timing/TimingSlotName';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';

import {
  buildGalaxyFieldMixture,
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ismMapGridRadiusOrDefault,
} from '../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import {
  buildHiiRegions,
  buildHiiShellsAndYoungWithSegments,
  DIG_MAX_COUNT,
  HII_MAX_COUNT,
} from '../../../engine/galaxyGenerator/v2/hiiRegions';
import { MAX_PARTICLE_COUNT } from '../../../engine/galaxyGenerator/v2/dustParticleCloud';
import { YOUNG_CHAIN_MAX_COMPONENTS } from '../../../engine/galaxyGenerator/v2/youngStarChain';
import { ISM_MAP_AMBIENT_DUST } from '../../../../utils/galaxy/ismMapAmbientDust';
import { transformGalaxyFieldComponent } from '../../../../utils/galaxy/transformGalaxyFieldComponent';

import { HII_TIER_KINDS, mapHiiTiers } from '../../../../data/hiiTiers';

import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { createKeyedRebuild } from '../../lib/createKeyedRebuild';

import { buildFieldHeaderInputs } from './field/buildFieldHeaderInputs';
import type { FieldHeaderFrameLanes, FieldHeaderRenderLanes } from './field/buildFieldHeaderInputs';
import { createFieldPipelines } from './field/createFieldPipelines';
import { deriveDustHeaderLanes } from './field/deriveDustHeaderLanes';
import { encodeDustMapPass } from './field/encodeDustMapPass';
import { encodeDustPresentPass } from './field/encodeDustPresentPass';
import { encodeSplatPass } from './field/encodeSplatPass';
import { findHiiSegment } from './field/findHiiSegment';
import { BUBBLE_RECORD_FLOATS } from './field/packBubbleInstances';
import {
  FIELD_COMPONENT_FLOATS,
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldComponents,
  packFieldHeaderUniforms,
} from './field/packFieldUniforms';
import { bakeVolumeTexture } from './gpu/bakeVolumeTexture';
import { createGrowOnlyRecordBuffer } from './gpu/createGrowOnlyRecordBuffer';
import { buildDigArmEnvelopeTable } from './ismMap/buildDigArmEnvelopeTable';
import { computeDigVeilBudget } from './ismMap/computeDigVeilBudget';
import type { DigVeilBudget } from './ismMap/computeDigVeilBudget';
import { computePlaceDustBudget } from './ismMap/computePlaceDustBudget';
import type { PlaceDustBudget } from './ismMap/computePlaceDustBudget';
import { createIsmMapDustCdfScan } from './ismMap/createIsmMapDustCdfScan';
import { createIsmMapGenerator } from './ismMap/createIsmMapGenerator';
import type { IsmMapGenerator } from './ismMap/createIsmMapGenerator';
import { createIsmMapOrientation } from './ismMap/createIsmMapOrientation';
import type { IsmMapOrientation } from './ismMap/createIsmMapOrientation';
import { createIsmMapPlaceArmCloud } from './ismMap/createIsmMapPlaceArmCloud';
import type { PlaceArmCloudDispatchInput } from './ismMap/createIsmMapPlaceArmCloud';
import { createIsmMapPlaceArmSpurCloud } from './ismMap/createIsmMapPlaceArmSpurCloud';
import type { PlaceArmSpurCloudDispatchInput } from './ismMap/createIsmMapPlaceArmSpurCloud';
import { createIsmMapPlaceDigVeil } from './ismMap/createIsmMapPlaceDigVeil';
import type { PlaceDigVeilDispatchInput } from './ismMap/createIsmMapPlaceDigVeil';
import { createIsmMapPlaceDust } from './ismMap/createIsmMapPlaceDust';
import type { PlaceDustDispatchInput } from './ismMap/createIsmMapPlaceDust';
import { createIsmMapRingReduce } from './ismMap/createIsmMapRingReduce';

import dustNoiseBakeWgsl from '../../shaders/milkyWay/field/dustNoiseBake.wesl?static';
import warpNoiseBakeWgsl from '../../shaders/milkyWay/field/warpNoiseBake.wesl?static';
import starGrainBakeWgsl from '../../shaders/milkyWay/field/starGrainBake.wesl?static';
import bubblePresentVsWgsl from '../../shaders/milkyWay/field/bubblePresent/vertex.wesl?static';
import bubblePresentFsWgsl from '../../shaders/milkyWay/field/bubblePresent/fragment.wesl?static';

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
 * discipline as `dustNoiseTex`.
 */
const STAR_GRAIN_TEX_SIZE = 128;

/** Matches starGrainBake.wesl's `@workgroup_size(4, 4, 4)`. */
const STAR_GRAIN_WORKGROUP_SIZE = 4;

/** A background galaxy's contribution: its own geometry, plus the rigid transform placing it in the scene. */
export type GalaxyFieldExtra = {
  readonly geometry: GalaxyDescription;
  readonly transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
};

export type GalaxyFieldRendererDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  /**
   * The two hooks the CPU readback path keeps on the host side (its queue and
   * decoders are host-owned — see the spec's tool-only table). Each fires from
   * the one place inside this module that knows the copy just went stale.
   */
  readonly onIsmMapRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
  readonly onOrientationRebuilt?: (grid: GalaxyIsmMapGridRadius) => void;
};

/**
 * Everything the mixture/ISM rebuild is a function of. The first three are
 * the galaxy itself; `extras` is the rest of the scene (the component buffers
 * are scene-wide, not per-galaxy — see `repackFieldComponents`); the last
 * three are host render knobs the orientation chain consumes.
 */
export type GalaxyFieldMixtureInput = {
  readonly geometry: GalaxyDescription | null;
  readonly fieldTuning: GalaxyFieldTuning;
  readonly seed: number;
  readonly extras: readonly GalaxyFieldExtra[];
  readonly sigmaDerivTexels: number;
  readonly sigmaIntegTexels: number;
  readonly orientationViewWanted: boolean;
};

/**
 * Render targets the HOST allocates and owns. `GPUTexture` rather than
 * `GPUTextureView`: every field/HII/tier header packs `targetSizePx` off the
 * target's own pixel size, and a view exposes no dimensions. `dustMapTex` is
 * SAMPLED as well as written, so a reallocation must reach
 * `onTargetsReallocated` — a fresh view at encode time is not enough.
 */
export type GalaxyFieldRenderTargets = {
  readonly fieldTex: GPUTexture;
  readonly dustMapTex: GPUTexture;
  readonly dustViewTex: GPUTexture;
  readonly hiiTex: GPUTexture;
  readonly hiiTiers: Readonly<Record<HiiTier, GPUTexture>>;
};

/**
 * The per-frame camera/settings lanes the five field headers are packed from
 * — the half of the encode inputs no `GPUTexture` can supply.
 */
export type GalaxyFieldFrame = {
  readonly eye: Vec3;
  readonly fov: number;
  readonly shiftX: number;
  readonly view: FieldHeaderFrameLanes;
  /** `analyticField` gates every pass below, never the header writes. */
  readonly render: FieldHeaderRenderLanes & { readonly analyticField: boolean };
  /** Host-owned because both are derived from the CPU ISM-map readback. */
  readonly ismMapSeeding: IsmMapSeedingLanes;
  readonly youngStars: YoungStarsLanes;
  /**
   * `gpuTimingService.descriptorFor`. Called ONLY where a pass is actually
   * encoded: asking for a descriptor marks its slot consumed, which is what
   * makes a skipped pass's HUD row vanish rather than freeze.
   */
  readonly timestampWrites?: (slot: TimingSlotName) => GPURenderPassTimestampWrites | undefined;
};

/** The three additive diagnostic overlays drawn straight into the host's open scene pass. */
export type GalaxyFieldOverlays = {
  readonly ismMap: boolean;
  readonly orientation: boolean;
  /** The SF-event catalog's own placements — host-owned data, module-owned pipeline. */
  readonly bubbles: { readonly buf: GPUBuffer; readonly count: number } | null;
};

/** Debug-only surface, driven by the host's GPU-error probe. No production caller. */
export type GalaxyFieldProbe = {
  peekRecords(buffer: 'field' | 'hii', offset: number, count: number): Promise<Float32Array>;
  requestDustPlacementReadback(opts?: { readonly forceGeneratorIsFluid?: boolean }): Promise<{
    readonly count: number;
    readonly records: Float32Array;
    readonly mass: Float32Array;
    readonly renormScale: number;
  } | null>;
  requestArmSpurCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  requestArmCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    readonly fluxWeight: Float32Array;
    readonly renormScale: number;
  } | null>;
  requestDigVeilPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly amplitudeBase: number;
    readonly records: Float32Array;
  } | null>;
  /** The REAL production pair, so a host-side isolated-range draw exercises the real fragment shader. */
  readonly fieldSplatPipe: GPURenderPipeline;
  readonly fieldSplatBG: GPUBindGroup;
};

export type GalaxyFieldRenderer = {
  /**
   * Rebuild whatever the moved half of `input` feeds. Idempotent: a call in
   * which nothing moved (the host re-pushes its whole render bag on any knob)
   * does no work.
   */
  setMixture(input: GalaxyFieldMixtureInput): void;
  /**
   * Run the deferred GPU rebuilds in their own dependency order. The host
   * must call this BEFORE the frame's encoder exists — the orientation chain
   * submits an encoder of its own that has to precede the frame's. `done` is
   * always true today; the seam exists so a future per-galaxy scheduler can
   * spread the same calls across frames with no API change.
   */
  stepIsmMap(): { readonly done: boolean };
  /**
   * Pack this frame's five headers, then encode the dust-map, dust-present,
   * field-splat and HII-tier passes into the caller's encoder. The only
   * ordering owned here is what is intrinsic to one galaxy's own passes
   * (dustMap before field); where they sit in the frame is the host's call.
   */
  encode(
    encoder: GPUCommandEncoder,
    targets: GalaxyFieldRenderTargets,
    frame: GalaxyFieldFrame,
  ): void;
  /** The three present overlays, into the host's already-open scene pass. */
  encodeOverlays(pass: GPURenderPassEncoder, overlays: GalaxyFieldOverlays): void;
  /**
   * The host reallocated its targets. Rebuilds every `layout: 'auto'` bind
   * group holding a view of the old `dustMapTex` and resets the stale-map
   * latch — must be called from the allocation itself, never hoisted to a
   * caller that may skip it (the latch reset asserts the texture is zeroed,
   * true only of one just created).
   */
  onTargetsReallocated(targets: GalaxyFieldRenderTargets): void;

  readonly fieldCounts: FieldSliceCounts;
  /** Cached by the dust rebuild — the header reads these every frame, they change only when dust does. */
  readonly dustHeaderLanes: DustHeaderLanes;
  /** `hiiComps`' buffer-wide segmentation, recomputed on every repack — the host's composite gates read it. */
  readonly hiiSegments: readonly HiiSegment[];
  readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];
  /**
   * Exposed for the host's CPU readback path alone (`createIsmMapReadbacks`
   * and the ISM-map debug view), which stays host-side per the spec.
   */
  readonly ismMapGenerator: IsmMapGenerator;
  readonly ismMapOrientation: IsmMapOrientation;
  readonly probe: GalaxyFieldProbe;
  dispose(): void;
};

export function createGalaxyFieldRenderer(
  device: GPUDevice,
  deps: GalaxyFieldRendererDeps,
): GalaxyFieldRenderer {
  const { makeShader, hdrFormat, dustMapFormat } = deps;

  // ---- ownership ledger ----
  // Every allocation this module makes registers at its own site; `dispose`
  // walks it in reverse. Resources that own their own teardown (the ISM
  // chain, the two record buffers) delegate instead and are deliberately
  // absent, which is also why nothing registered here is ever reassigned.
  const owned: { destroy(): void }[] = [];
  const own = <T extends { destroy(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };

  // The analytic field's own buffer, own struct — see `packFieldUniforms`.
  // Camera/params/dust-law only: the mixture itself rides `fieldComps`, a
  // separate storage binding, so this uniform stays `FIELD_HEADER_BUFFER_SIZE`
  // regardless of how many galaxies are on screen.
  const fieldUbo = own(
    device.createBuffer({
      label: 'galaxy:fieldUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // The `hii:extras` pass's own header, byte-identical layout to `fieldUbo`
  // (same `io.wesl` struct, drawn by `hiiExtrasPipe`) — see `hiiComps` for
  // why the tier gets its own buffers, its own target and its own divisor
  // rather than a slice of the field's.
  const hiiUbo = own(
    device.createBuffer({
      label: 'galaxy:hiiUniforms',
      size: FIELD_HEADER_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // The three HII sub-tiers' own headers, same layout and same `hiiComps`
  // storage binding as `hiiUbo` — every tier's header differs from `hiiUbo`'s
  // only in `targetSizePx`. Separate buffers, one per tier, for the same
  // reason `hiiUbo` is separate from `fieldUbo`: two passes writing one frame
  // both land before either pass runs, so sharing would hand whichever pass
  // writes last its `targetSizePx` to every tier — and that lane feeds
  // `counts2.w`, which the shader's footprint gates read directly, so a wrong
  // one there is a silently wrong LOD/splat footprint, not a crash.
  const tierUbo: Record<HiiTier, GPUBuffer> = mapHiiTiers((kind) =>
    own(
      device.createBuffer({
        label: `galaxy:hiiTierUniforms:${kind}`,
        size: FIELD_HEADER_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    ),
  );

  // ---- three baked volumes, each baked ONCE via bakeVolumeTexture ----
  // All three are view- and param-independent (fixed octave bands, no
  // camera/galaxy input), which is what lets them bake here rather than
  // inside the per-frame encoder.
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

  // dustAttenuation.wesl's own sampler for `dustMapTex` (io.wesl binding 6) —
  // a plain filtering sampler, no address-mode wrap needed since the UV it is
  // fed is always clamped to the [0,1] the field pass's own fragment coords
  // cover. `rgba16float` is filterable in WebGPU core.
  const dustMapSampler = device.createSampler({
    label: 'galaxy:dustMapSampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // ---- ISM-map generator + its orientation chain ----
  // Each owns every resource it touches, including its readback staging
  // buffers; this module keeps only the handles and the gates.
  const ismMapGenerator = createIsmMapGenerator(device, {
    makeShader,
    hdrFormat,
    fieldUbo,
  });
  const ismMapOrientation = createIsmMapOrientation(device, {
    makeShader,
    hdrFormat,
    fieldUbo,
    sourceTexture: ismMapGenerator.texture,
  });
  // GPU replacement for `ismMapRingMeans.ts`'s CPU loop — see its own header.
  const ringReduce = createIsmMapRingReduce(device, {
    makeShader,
    ismMapTexture: ismMapGenerator.texture,
    ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
  });
  // GPU replacement for `buildIsmMapDustCdf.ts`'s CPU prefix sum.
  const dustCdfScan = createIsmMapDustCdfScan(device, {
    makeShader,
    maxRings: ISM_MAP_RINGS,
    maxAz: ISM_MAP_AZ,
  });
  // A SECOND instance of the same factory, at the same ceiling — the DIG
  // veil's own arm-biased weight table. Its OWN buffer, never sharing
  // `dustCdfScan`'s: dust's and DIG's placement dispatches are each deferred
  // independently to `stepIsmMap()`, so one shared `prefixBuffer` would let
  // whichever dispatch runs second silently overwrite the first's input.
  const digCdfScan = createIsmMapDustCdfScan(device, {
    makeShader,
    maxRings: ISM_MAP_RINGS,
    maxAz: ISM_MAP_AZ,
  });
  // GPU replacement for `buildDustParticleCloud`'s map-seeded placement.
  const placeDust = createIsmMapPlaceDust(device, { makeShader });
  // GPU replacement for `buildArmSpurParticleCloud`'s placement body.
  const placeArmSpurCloud = createIsmMapPlaceArmSpurCloud(device, { makeShader });
  // GPU replacement for `buildArmParticleCloud`'s placement body.
  const placeArmCloud = createIsmMapPlaceArmCloud(device, { makeShader });
  // GPU replacement for `buildDigVeil`'s complex/children placement.
  const placeDigVeil = createIsmMapPlaceDigVeil(device, { makeShader });

  // `getDustMapTex` is a thunk because `createFieldPipelines` is built before
  // the host has allocated anything. Its `dustMapTex` is the ONLY row read off
  // this snapshot: `onTargetsReallocated` fires from inside the host's own
  // dust allocation, so the other six rows can be a reallocation behind — or,
  // on the very first one, not allocated at all. Every other reader takes the
  // targets `encode` is handed for that frame.
  let targets: GalaxyFieldRenderTargets | null = null;

  // ---- field/HII splat pipelines + their bind-group apparatus ----
  // Must come after everything above: it takes all three UBOs, the generator,
  // all three noise volumes and the ring-reduce renorm buffers.
  const fieldPipelines = createFieldPipelines({
    device,
    makeShader,
    hdrFormat,
    dustMapFormat,
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
    dustRenormBuffer: ringReduce.dustRenormBuffer,
    armRenormBuffer: ringReduce.armCloudRenormBuffer,
    spurRenormBuffer: ringReduce.spurCloudRenormBuffer,
    getDustMapTex: () => targets!.dustMapTex,
  });

  // ---- bubble-view overlay: the SF-event catalog's own placements ----
  // One instanced camera-facing quad per placement, no storage buffer:
  // bubblePresent/vertex.wesl reads its per-instance center/radius/kind
  // straight off the vertex buffer the HOST packs, and `u` (fieldUbo) only
  // for the camera basis + its own crossfade weight — so this bind group
  // needs just binding 0, built once (fieldUbo's OBJECT never changes, only
  // its content, rewritten every `encode`).
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
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const bubblePresentBG = device.createBindGroup({
    label: 'galaxy:bubblePresentBG',
    layout: bubblePresentPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: fieldUbo } }],
  });

  // ---- the scene's component buffers ----
  // `comps` (io.wesl binding 1): every mixture's Gaussians, already
  // world-transformed — a read-only STORAGE array, not a uniform, specifically
  // so N background extras can push the total past a uniform's ~1000-component
  // cap. Starts at one galaxy's EMISSION ceiling; the trailing dust slice is a
  // particle cloud thousands of components deep, so the first mixture with
  // dust on regrows this regardless.
  const fieldComps = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:fieldComps',
    // COPY_SRC beyond STORAGE|COPY_DST's production need: the debug-only
    // dust-slot readback copies that range back to the CPU.
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    floatsPerRecord: FIELD_COMPONENT_FLOATS,
    initialCapacity: GALAXY_FIELD_MAX_COMPONENTS,
    // A regrow REPLACES the GPUBuffer and a bind group holds the exact object
    // it was built against — internal now that both live here.
    onRegrow: () => fieldPipelines.rebuildFieldCompsBindGroups(fieldComps.buffer),
  });
  // The HII tier's own storage buffer, byte-identical layout to `fieldComps`
  // but never concatenated into it — see `docs/research/milky-way/
  // hii-regions.md`: a shell sprite is small and bright by construction, so
  // sharing the smooth field's coarser target collapsed it into a bloom
  // firefly. Own buffer, own target, own divisor, own admission ceiling.
  const hiiComps = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:hiiComps',
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    floatsPerRecord: FIELD_COMPONENT_FLOATS,
    // + DIG_MAX_COUNT: the DIG veil rides this SAME buffer as a bounded group
    // pushed after `HII_MAX_COUNT`'s admission, not a reservation carved out
    // of it — so the common case never regrows on first activation.
    // + YOUNG_CHAIN_MAX_COMPONENTS: the young-stars chain rides it too.
    initialCapacity: HII_MAX_COUNT + DIG_MAX_COUNT + YOUNG_CHAIN_MAX_COMPONENTS,
    onRegrow: () => fieldPipelines.rebuildTierBindGroups(hiiComps.buffer),
  });

  /**
   * peekScratchBuffer — the ONE shared COPY_DST|MAP_READ target behind
   * `probe.peekRecords`: a peek COPIES whatever is CURRENTLY sitting in
   * `fieldComps`/`hiiComps` without dispatching anything, so the host's probe
   * can tell "the keyed rebuilds refilled the slots the last repack zeroed"
   * apart from "the placement kernel itself is correct" (the readbacks below
   * re-dispatch fresh and so cannot see the former). Sized at
   * `MAX_PARTICLE_COUNT`, the largest of the four tiers. ONE peek at a time:
   * the sole caller always awaits one before starting the next.
   */
  const peekScratchBuffer = own(
    device.createBuffer({
      label: 'galaxy:peekScratch',
      size: MAX_PARTICLE_COUNT * FIELD_COMPONENT_FLOATS * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    }),
  );

  // `dustMapBG` is the only one of the five bind groups that doesn't
  // reference `dustMapTex` (it is the pass that WRITES that texture), so it
  // is also the only one buildable before the host has any targets.
  fieldPipelines.rebuildDustMapBindGroup(fieldComps.buffer);

  // ---- mixture state ----
  let geometry: GalaxyDescription | null = null;
  let fieldTuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING;
  let seed = 0;
  let extras: readonly GalaxyFieldExtra[] = [];
  /** Each extra's own mixtures, already in world space — index-parallel to `extras`. */
  let extraMixtures: readonly {
    readonly fieldMixture: readonly GalaxyFieldComponent[];
    readonly hiiMixture: readonly GalaxyFieldComponent[];
  }[] = [];
  let sigmaDerivTexels = 0;
  let sigmaIntegTexels = 0;
  let orientationViewWanted = false;

  // The CENTRAL galaxy's emission mixture. Empty until the first
  // `setMixture`: a field of zero components draws nothing, which is not the
  // same as stale.
  let fieldMixture: readonly GalaxyFieldComponent[] = [];
  // The CENTRAL galaxy's HII tier, cached like `fieldMixture` but never
  // concatenated into it (see `hiiComps`).
  let hiiMixture: readonly GalaxyFieldComponent[] = [];
  // The central galaxy's own tier boundaries within `hiiMixture`, captured
  // alongside it at every rebuild site; `repackHiiComponents` extends this
  // with the extras span to get the buffer-wide `hiiSegments`.
  let hiiTierSegments: readonly HiiSegment[] = [];
  let hiiSegments: readonly HiiSegment[] = [];
  // The shell tier's own flux total and the recent-event population — DIG's
  // own two inputs, captured alongside `hiiMixture` since both are a
  // byproduct of `buildHiiShellsAndYoungWithSegments`.
  let shellFluxSum = 0;
  let recentEventCount = 0;
  // The DIG veil's RESERVATION, CENTRAL galaxy only. `null` means none
  // reserved this rebuild. `digOffset` is its absolute index into `hiiComps`,
  // set by `repackHiiComponents` — the one place that decides where the DIG
  // span lands between shells and young.
  let digBudget: DigVeilBudget | null = null;
  let digOffset = 0;
  // The analytic dust lane's RESERVATION, CENTRAL galaxy only. The CPU only
  // ever sees this budget/uniform shape — `placeDust.wesl` decides slot
  // CONTENT on the GPU.
  let dustBudget: PlaceDustBudget | null = null;
  // The spur-cloud and arm-cloud tiers' RESERVATIONS, CENTRAL galaxy only.
  // Captured alongside `fieldMixture` at every central rebuild site since
  // each `offset` is a local index into THAT mixture, valid as an absolute
  // `fieldComps` index only because the central galaxy's mixture always sits
  // first in `repackFieldComponents`' concatenation.
  let spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'] = null;
  let armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'] = null;
  // What the ISM map was last rebuilt against — two keys: `ismMap` is the
  // shared switch, `ismMapFluid` the generator's own param block.
  let ismMapKey: GalaxyIsmMapParams = fieldTuning.ismMap;
  let ismMapFluidKey: GalaxyIsmMapFluidParams = fieldTuning.ismMapFluid;
  // Cached, not recomputed per frame: the header reads all three every frame,
  // but they only change when `rebuildDustMixture` runs. Seeded at the
  // no-galaxy answer, which is what the first frames draw.
  let dustHeaderLanes = deriveDustHeaderLanes(null, DEFAULT_GALAXY_FIELD_TUNING.dust, false);
  // How the last `repackFieldComponents` concatenation sliced `fieldComps`.
  let fieldCounts: FieldSliceCounts = { emission: 0, primary: 0, dust: 0 };

  /**
   * The CPU copy of the orientation field — diagnostics-only (the host's
   * coherence-stat report); dust placement reads `orientationTex` on the GPU
   * directly. Still gated on the generator being active: a disabled generator
   * has nothing coherent to report either.
   */
  const orientationDataRebuild = createKeyedRebuild({
    wanted: () => fieldTuning.ismMap.generator !== 'none',
    build: () => deps.onOrientationRebuilt?.(ismMapGridRadiusOrDefault(geometry)),
  });

  /**
   * The GPU structure-tensor chain over the CURRENT `ismMapTex`. Two
   * independent consumers — the debug overlay reads the texture on the GPU,
   * dust placement the same texture — either enough to justify the six
   * dispatches. Needs no readback to run FROM: ismMapTex is a GPU texture
   * WebGPU zero-initialises, so dispatching before `rebuildIsmMap` has ever
   * populated it is safe. Invalidated by `rebuildIsmMap` and by a sigma move.
   */
  const orientationTexRebuild = createKeyedRebuild({
    wanted: () => orientationViewWanted || fieldTuning.ismMap.generator !== 'none',
    build: () => {
      // gasFloor=1 when the generator is off: the map texture is a cleared
      // (all-zero) blank then, and ismMapOrientationField.wesl's
      // IsmMapOrientationPedestal derives its zero-gradient invariant from
      // gasProfile(r) collapsing to a flat 1.0 — a real fluid gasFloor here
      // would subtract a non-flat pedestal from that blank data and paint a
      // fake radial gradient into the orientation view. gasScaleLength must
      // still be finite even though it's then algebraically unused.
      const pedestal =
        fieldTuning.ismMap.generator === 'fluid'
          ? fieldTuning.ismMapFluid
          : { gasFloor: 1, gasScaleLength: 1 };
      ismMapOrientation.dispatch({
        grid: ismMapGridRadiusOrDefault(geometry),
        sigmaDerivTexels,
        sigmaIntegTexels,
        gasFloor: pedestal.gasFloor,
        gasScaleLength: pedestal.gasScaleLength,
        ambient: ISM_MAP_AMBIENT_DUST,
      });
      orientationDataRebuild.invalidate();
    },
  });

  /**
   * dispatchDustCdfScan — (re)scans the CURRENT `ismMapTex` with the CURRENT
   * `cloud.dustPlacementCap`, own encoder/submit. Two independent triggers
   * call this, not one: the map's own CONTENT changes only from
   * `rebuildIsmMap`, but the SCAN's cap input can also move on its own via a
   * bare dust-tuning drag — missing either trigger leaves `dustPlacementCap`
   * (or a stepped map) stale in `prefixBuf` until some unrelated later
   * rebuild happens to re-scan it.
   */
  function dispatchDustCdfScan(): void {
    if (!geometry || fieldTuning.ismMap.generator !== 'fluid') return;
    const grid = ismMapGridRadiusOrDefault(geometry);
    const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDustCdfScanRebuild' });
    // `ringCap` reproduces dustParticleCloud.ts's density() ring-mean-
    // normalised, capped placement density (ismMapDustCdfScan.wesl's own doc).
    dustCdfScan.dispatchScan(enc, {
      ismMapTexture: ismMapGenerator.texture,
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      weights: {
        kind: 'channel',
        channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
        ringCap: fieldTuning.dust.cloud.dustPlacementCap ?? 0,
      },
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
    });
    device.queue.submit([enc.finish()]);
    dustPlacementRebuild.invalidate();
  }

  /**
   * dispatchDigCdfScan — the DIG veil's own arm-biased counterpart, own
   * encoder/submit, own `digCdfScan` instance (see its declaration for why a
   * shared `prefixBuffer` would race). Two independent triggers, same shape
   * as dust's: the map's own content, and DIG's own tuning. `armBias` is
   * CLAMPED here, at the packing call site — `buildDigVeil`'s CPU original
   * clamps to `[0, 1]` before ever building the envelope, and the scan shader
   * trusts whatever `params.armBias` the caller packed.
   */
  function dispatchDigCdfScan(): void {
    if (!geometry || fieldTuning.ismMap.generator !== 'fluid') return;
    const grid = ismMapGridRadiusOrDefault(geometry);
    const armBias = Math.min(1, Math.max(0, fieldTuning.hii.dig?.armBias ?? 0));
    const armCount = geometry.arms.length;
    const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDigCdfScanRebuild' });
    digCdfScan.dispatchScan(enc, {
      ismMapTexture: ismMapGenerator.texture,
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      weights: {
        kind: 'armBiased',
        // DIG's own CDF weights the map's `activity` channel alone.
        channelWeights: { gas: 0, stars: 0, activity: 1, dust: 0 },
        armBias,
        armCount,
        entries: buildDigArmEnvelopeTable(geometry, fieldTuning, {
          rings: ISM_MAP_RINGS,
          rMin: grid.rMin,
          rMax: grid.rMax,
        }),
      },
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
    });
    device.queue.submit([enc.finish()]);
    digPlacementRebuild.invalidate();
  }

  /**
   * rebuildDustMixture — recomputes the central galaxy's dust RESERVATION off
   * the CACHED geometry + dust params, then re-scans the CDF for the CURRENT
   * `cloud.dustPlacementCap` (the map itself may already be fresh, but the
   * cap value is this function's own to apply). Gated on
   * `fieldTuning.dust.enabled` the same way `disc.enabled`/`arms.enabled`
   * gate their shader loops — an off pill skips the work entirely.
   *
   * Does NOT invalidate `dustPlacementRebuild` itself: `repackFieldComponents`
   * owns that, and every call site here is unconditionally followed by one in
   * the same synchronous invocation.
   */
  function rebuildDustMixture(): void {
    const dust = fieldTuning.dust;
    dustHeaderLanes = deriveDustHeaderLanes(geometry, dust, fieldTuning.dust.enabled);
    dustBudget =
      geometry && fieldTuning.dust.enabled ? computePlaceDustBudget(geometry, dust) : null;
    dispatchDustCdfScan();
  }

  /**
   * rebuildDigVeilBudget — the DIG twin of `rebuildDustMixture`: a pure
   * function of geometry + `fieldTuning.hii.dig` + `shellFluxSum`/
   * `recentEventCount` (the two values the shell/young build this rebuild's
   * callers ALWAYS run first), then the arm-biased CDF rescan. Same
   * "whoever zeroes the slots owns the invalidation" split as dust's.
   */
  function rebuildDigVeilBudget(): void {
    digBudget = geometry
      ? computeDigVeilBudget(geometry, fieldTuning, shellFluxSum, recentEventCount)
      : null;
    dispatchDigCdfScan();
  }

  /**
   * rebuildIsmMap — reruns the fluid generator from scratch off the CACHED
   * geometry. NEVER per frame. `createIsmMapGenerator` owns the dispatch and
   * the none/fluid gate; what stays here is the pair of things that follow it
   * either way — and the readback hook fires on BOTH exits, the disabled one
   * too, so the host's CPU copy reflects the cleared texture it just wrote
   * rather than an earlier galaxy's map.
   */
  function rebuildIsmMap(): void {
    const grid = ismMapGenerator.rebuild({ geometry, tuning: fieldTuning, seed });
    if (fieldTuning.ismMap.generator === 'fluid') {
      const enc = device.createCommandEncoder({ label: 'galaxy:ismMapRingReduceRebuild' });
      // ringMeansBuffer written HERE; dispatchDustCdfScan's own LATER submit
      // reads it — WebGPU's cross-SUBMIT ordering on one queue is what makes
      // that safe with no barrier of our own.
      ringReduce.dispatchRingMeans(enc);
      device.queue.submit([enc.finish()]);
      dispatchDustCdfScan();
      dispatchDigCdfScan();
    }
    deps.onIsmMapRebuilt?.(grid);
    orientationTexRebuild.invalidate();
    // The map itself just changed (or was cleared) — placement must
    // re-dispatch even when the budgets' OWN inputs didn't move, e.g. a bare
    // ismMapFluid tuning drag, which reaches here with no repack of its own
    // to own the invalidation.
    dustPlacementRebuild.invalidate();
    digPlacementRebuild.invalidate();
  }

  /**
   * dustPlacementRebuild — encodes `placeDust.wesl` into its own encoder, off
   * the CURRENT `dustBudget`. Consumed from `stepIsmMap()` AFTER
   * `orientationTexRebuild`, never synchronously from the rebuilds above:
   * this dispatch needs `orientationTex` already fresh for whatever
   * `ismMapTex` the rebuild wrote, and the lazy per-frame gate is what
   * guarantees that ordering. A one-frame-late fill is the honest cost.
   */
  const dustPlacementRebuild = createKeyedRebuild({
    wanted: () => dustBudget !== null,
    build: () => {
      const budget = dustBudget;
      if (!geometry || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDust' });
      placeDust.dispatchPlaceDust(enc, dustDispatchInput(geometry, budget));
      // Survivor-sum + Larson renorm, encoded into the SAME encoder/submit
      // right after the dispatch: cross-pass ordering within one submit is
      // what lets this read `placeDust.massBuffer` fresh with no readback of
      // its own, tying the renorm's freshness to THIS placement rebuild.
      ringReduce.dispatchSurvivorSum(enc, {
        massBuffer: placeDust.massBuffer,
        count: budget.count,
        totalMass: budget.totalMass,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `dustPlacementRebuild` and the debug readback — one input shape, one place that assembles it. */
  function dustDispatchInput(
    geo: GalaxyDescription,
    budget: PlaceDustBudget,
    /**
     * Debug-only override: forcing this to `false` exercises placeDust.wesl's
     * mode-1 (smoothDisc) branch directly, WITHOUT flipping
     * `fieldTuning.ismMap.generator` — the real 'none' transition hits an
     * unrelated, pre-existing bug in `ismMapGenerator.rebuild`'s clear path.
     * The production path never passes this.
     */
    forceGeneratorIsFluid?: boolean,
  ): PlaceDustDispatchInput {
    const grid = ismMapGridRadiusOrDefault(geo);
    return {
      seed,
      budget,
      dustOffset: fieldCounts.emission,
      generatorIsFluid: forceGeneratorIsFluid ?? fieldTuning.ismMap.generator === 'fluid',
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      warp: {
        warpStrength: geo.warpStrength,
        warpTwist: geo.warpTwist,
        warpStartRadius: geo.warpStartRadius,
        outerRadius: geo.outerRadius,
      },
      prefixBuffer: dustCdfScan.prefixBuffer,
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
      ismMapTexture: ismMapGenerator.texture,
      orientationTexture: ismMapOrientation.texture,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * spurCloudPlacementRebuild — the same deferred-dispatch shape
   * `dustPlacementRebuild` uses. Unlike dust, this tier reads no ISM-map/
   * orientation texture at all (`armRidge.wesl`'s ridge math is self-contained
   * off the per-spur record table), so there is no ordering dependency on
   * `orientationTexRebuild`; it is placed after it anyway, for one discipline
   * rather than two.
   */
  const spurCloudPlacementRebuild = createKeyedRebuild({
    wanted: () => spurCloudReservation !== null,
    build: () => {
      const reservation = spurCloudReservation;
      if (!geometry || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloud' });
      placeArmSpurCloud.dispatchPlaceArmSpurCloud(
        enc,
        spurCloudDispatchInput(geometry, reservation),
      );
      ringReduce.dispatchArmSpurFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmSpurCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `spurCloudPlacementRebuild` and the debug readback. */
  function spurCloudDispatchInput(
    geo: GalaxyDescription,
    reservation: NonNullable<GalaxyFieldMixtureResult['spurCloudReservation']>,
  ): PlaceArmSpurCloudDispatchInput {
    return {
      seed,
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      spurArms: reservation.spurArms,
      geometry: geo,
      tuning: fieldTuning,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * armCloudPlacementRebuild — the arm-cloud twin. Its own
   * `orientationTexture` bind is a dead pass-through (see
   * `placeArmCloud.wesl`), so this too has no real ordering dependency on
   * `orientationTexRebuild`.
   */
  const armCloudPlacementRebuild = createKeyedRebuild({
    wanted: () => armCloudReservation !== null,
    build: () => {
      const reservation = armCloudReservation;
      if (!geometry || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmCloud' });
      placeArmCloud.dispatchPlaceArmCloud(enc, armCloudDispatchInput(geometry, reservation));
      ringReduce.dispatchArmCloudFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `armCloudPlacementRebuild` and the debug readback. */
  function armCloudDispatchInput(
    geo: GalaxyDescription,
    reservation: NonNullable<GalaxyFieldMixtureResult['armCloudReservation']>,
  ): PlaceArmCloudDispatchInput {
    return {
      seed,
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      geometry: geo,
      tuning: fieldTuning,
      orientationTexture: ismMapOrientation.texture,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * digPlacementRebuild — the DIG twin. Reads no `orientationTex` at all
   * (this tier has no coherence-blend mode), so no real ordering dependency
   * either; placed after it anyway, one discipline rather than four.
   */
  const digPlacementRebuild = createKeyedRebuild({
    wanted: () => digBudget !== null,
    build: () => {
      const budget = digBudget;
      if (!geometry || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDigVeil' });
      placeDigVeil.dispatchPlaceDigVeil(enc, digDispatchInput(geometry, budget));
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `digPlacementRebuild` and the debug readback. */
  function digDispatchInput(
    geo: GalaxyDescription,
    budget: DigVeilBudget,
  ): PlaceDigVeilDispatchInput {
    const grid = ismMapGridRadiusOrDefault(geo);
    return {
      seed,
      budget,
      reservationOffset: digOffset,
      generatorIsFluid: fieldTuning.ismMap.generator === 'fluid',
      cdfRings: ISM_MAP_RINGS,
      cdfAz: ISM_MAP_AZ,
      cdfRMin: grid.rMin,
      cdfRMax: grid.rMax,
      warp: {
        warpStrength: geo.warpStrength,
        warpTwist: geo.warpTwist,
        warpStartRadius: geo.warpStartRadius,
        outerRadius: geo.outerRadius,
      },
      prefixBuffer: digCdfScan.prefixBuffer,
      hiiCompsBuffer: hiiComps.buffer,
    };
  }

  /**
   * repackFieldComponents — central galaxy's emission mixture, then every
   * extra's (already in world space), then the central galaxy's dust
   * RESERVATION last, into one `fieldComps` write. Runs whenever a mixture
   * changes, never per frame.
   *
   * The dust range is written ZERO here (amplitude 0 draws nothing) —
   * `dustPlacementRebuild` fills it in a LATER, separate GPU pass. This
   * write's only job is sizing/growing `fieldComps` so that pass has
   * somewhere to write into; the regrow (and the bind-group rebuild it
   * triggers) still happens HERE, synchronously.
   *
   * Dust trails every emission component (never interleaved) so
   * `dustOffset == fieldCounts.emission` always holds without a separate
   * bookkeeping pass — see io.wesl's layout comment.
   *
   * All three placement invalidations are UNCONDITIONAL here, because every
   * call overwrites the WHOLE buffer from the CPU-held arrays and so clobbers
   * whatever the spur/arm-cloud/dust dispatches last GPU-filled — including
   * calls whose own trigger has nothing to do with those tiers. Making each
   * caller invalidate for itself is exactly the gap that let a dust-only
   * patch leave the spur cloud vanished until an unrelated change fired it.
   */
  function repackFieldComponents(): void {
    const emission: GalaxyFieldComponent[] = [...fieldMixture];
    for (const e of extraMixtures) emission.push(...e.fieldMixture);
    const dustCount = dustBudget?.count ?? 0;
    fieldCounts = {
      emission: emission.length,
      primary: fieldMixture.length,
      dust: dustCount,
    };
    spurCloudPlacementRebuild.invalidate();
    armCloudPlacementRebuild.invalidate();
    dustPlacementRebuild.invalidate();
    const packedEmission = packFieldComponents(emission);
    if (dustCount <= 0) {
      fieldComps.write(packedEmission);
      return;
    }
    const combined = new Float32Array(packedEmission.length + dustCount * FIELD_COMPONENT_FLOATS);
    combined.set(packedEmission, 0);
    fieldComps.write(combined);
  }

  /**
   * repackHiiComponents — `repackFieldComponents`'s counterpart for the HII
   * tier. A SEPARATE buffer rather than a further slice of `fieldComps`: see
   * `hiiComps` for why the tier cannot share the field's target, and a shared
   * BUFFER with a separate TARGET would still mean one draw painting into two
   * attachments, which WebGPU has no way to do.
   *
   * `hiiMixture` is shells+young ONLY — DIG's span is a RESERVATION written
   * zero here, exactly `repackFieldComponents`' dust-tail discipline, except
   * EMBEDDED between shells and young (matching the tier's original ordering)
   * rather than appended at the buffer's end.
   */
  function repackHiiComponents(): void {
    const shellsSegment = hiiTierSegments.find((s) => s.label === 'hii:shells');
    const shellsCount = shellsSegment?.count ?? 0;
    const digCount = digBudget?.count ?? 0;
    const packedShells = packFieldComponents(hiiMixture.slice(0, shellsCount));
    const packedYoung = packFieldComponents(hiiMixture.slice(shellsCount));
    const extrasComponents: GalaxyFieldComponent[] = [];
    for (const e of extraMixtures) extrasComponents.push(...e.hiiMixture);
    const packedExtras = packFieldComponents(extrasComponents);

    digPlacementRebuild.invalidate();

    const total = new Float32Array(
      packedShells.length +
        digCount * FIELD_COMPONENT_FLOATS +
        packedYoung.length +
        packedExtras.length,
    );
    let offset = 0;
    total.set(packedShells, offset);
    offset += packedShells.length;
    digOffset = offset / FIELD_COMPONENT_FLOATS;
    offset += digCount * FIELD_COMPONENT_FLOATS; // zero block — digPlacementRebuild fills it later
    total.set(packedYoung, offset);
    offset += packedYoung.length;
    total.set(packedExtras, offset);
    hiiComps.write(total);

    const youngCount = hiiMixture.length - shellsCount;
    const extrasCount = extrasComponents.length;
    hiiSegments = [
      { label: 'hii:shells', first: 0, count: shellsCount },
      { label: 'hii:dig', first: digOffset, count: digCount },
      { label: 'hii:young', first: digOffset + digCount, count: youngCount },
      ...(extrasCount > 0
        ? [{ label: 'hii:extras', first: digOffset + digCount + youngCount, count: extrasCount }]
        : []),
    ];
  }

  /** Into world space — extras only; the central galaxy stays in its own frame. */
  function place(
    components: readonly GalaxyFieldComponent[],
    transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return components.map((c) => transformGalaxyFieldComponent(c, transform));
  }

  /**
   * The two analytic tiers are built SEPARATELY rather than as one pair: they
   * answer to different tuning sections, so a tuning move rebuilds only the
   * one whose inputs moved.
   */
  function extraFieldMixture(extra: GalaxyFieldExtra): readonly GalaxyFieldComponent[] {
    return place(buildGalaxyFieldMixture(extra.geometry, fieldTuning).components, extra.transform);
  }

  /**
   * `geometry.seed` is what `buildHiiRegions` was called with when it still
   * lived inside `buildGalaxyFieldMixture` — the field's own generated seed,
   * not a re-derivation. `ismMap` is null for every extra: extras have no
   * ISM-map generator of their own.
   */
  function extraHiiMixture(extra: GalaxyFieldExtra): readonly GalaxyFieldComponent[] {
    return place(
      buildHiiRegions(
        extra.geometry,
        fieldTuning,
        fieldTuning.starFormation,
        extra.geometry.seed,
        null,
      ),
      extra.transform,
    );
  }

  /**
   * Central-galaxy mixture rebuild that also captures the spur-cloud AND
   * arm-cloud reservations — extras never take either (only the central
   * galaxy's mixture is ever GPU-filled today), so only this path pays for it.
   */
  function rebuildCentralFieldMixture(geo: GalaxyDescription): void {
    const result = buildGalaxyFieldMixture(geo, fieldTuning);
    fieldMixture = result.components;
    spurCloudReservation = result.spurCloudReservation;
    armCloudReservation = result.armCloudReservation;
  }

  /**
   * Central-galaxy HII rebuild that also captures the tier's segmentation and
   * the two values DIG's own budget needs — `shellFluxSum`/`recentEventCount`
   * — extras need none of it (they have no DIG at all), so only this path
   * pays for `buildHiiShellsAndYoungWithSegments`' bookkeeping.
   */
  function rebuildCentralHiiMixture(geo: GalaxyDescription): void {
    const result = buildHiiShellsAndYoungWithSegments(
      geo,
      fieldTuning,
      fieldTuning.starFormation,
      geo.seed,
    );
    hiiMixture = result.components;
    hiiTierSegments = result.segments;
    shellFluxSum = result.shellFluxSum;
    recentEventCount = result.recentEventCount;
  }

  /** A new galaxy: everything derived from its geometry, plus an unconditional ISM-map regenerate. */
  function rebuildForGeometry(): void {
    if (geometry) {
      rebuildCentralFieldMixture(geometry);
      rebuildCentralHiiMixture(geometry);
    }
    rebuildDustMixture();
    rebuildDigVeilBudget();
    repackFieldComponents();
    repackHiiComponents();
    // Always — a new galaxy means new geometry/arms, so the active generator
    // and the ridge it forces/biases against are both stale otherwise.
    rebuildIsmMap();
  }

  /**
   * A tuning move: reference identity per SECTION is the change signal.
   * Sections are replaced wholesale (`GalaxyFieldTuning`'s contract) and the
   * host's merge is shallow, so an untouched section arrives as the same
   * object. What each one feeds:
   *
   *   disc          -> field mixture
   *   arms          -> field mixture, HII tier
   *   hii           -> HII tier
   *   starFormation -> HII tier (same path as hii)
   *   dust          -> dust mixture + the header's dust lanes
   *   ismMap        -> the shared enabled/generator switch
   *   ismMapFluid   -> the fluid generator's own params
   */
  function rebuildForTuning(prev: GalaxyFieldTuning): void {
    // `arms.widthScale` reaches further than the arms: `armCrossSigma` sizes
    // the cross-arm scatter `buildSfEventCatalog` draws every SF event from.
    // `arms.cloud` shares this flag by construction — the UI cannot replace
    // the cloud without replacing the `arms` object around it.
    const armsMoved = prev.arms !== fieldTuning.arms;
    const fieldMoved = armsMoved || prev.disc !== fieldTuning.disc;
    // HII reads `tuning.arms` ONLY through `armCrossSigma`'s `widthScale`, so
    // a whole-section identity check here would rebuild HII's
    // ~O(rings x az x arms) CDF sweep on an arm-cloud drag that cannot change
    // its output.
    const armsWidthMoved = prev.arms.widthScale !== fieldTuning.arms.widthScale;
    // `starFormation` feeds the HII tier alone (dust reads none of it), so it
    // joins `hiiMoved` rather than getting its own flag.
    const starFormationMoved = prev.starFormation !== fieldTuning.starFormation;
    const hiiMoved = armsWidthMoved || starFormationMoved || prev.hii !== fieldTuning.hii;
    const dustMoved = prev.dust !== fieldTuning.dust;

    if (fieldMoved || hiiMoved) {
      if (geometry) {
        if (fieldMoved) rebuildCentralFieldMixture(geometry);
        if (hiiMoved) {
          rebuildCentralHiiMixture(geometry);
          rebuildDigVeilBudget();
        }
      }
      extraMixtures = extras.map((extra, i) => ({
        fieldMixture: fieldMoved ? extraFieldMixture(extra) : extraMixtures[i]!.fieldMixture,
        hiiMixture: hiiMoved ? extraHiiMixture(extra) : extraMixtures[i]!.hiiMixture,
      }));
    }
    if (dustMoved) rebuildDustMixture();
    // The dust mixture is the trailing slice of the SAME buffer the emission
    // mixtures pack into, so either moving needs the one repack.
    if (fieldMoved || dustMoved) repackFieldComponents();
    if (hiiMoved) repackHiiComponents();
    // A generator rebuild is N compute dispatches, far more expensive than
    // the CPU mixture rebuilds above. `arms.widthScale` feeds the ridge its
    // forcing field bakes, but re-triggering on it would make an arm-width
    // drag pay this cost per frame — deliberately left stale until `ismMap`
    // moves.
    const generatorMoved = ismMapKey !== fieldTuning.ismMap;
    const fluidParamsMoved = ismMapFluidKey !== fieldTuning.ismMapFluid;
    if (generatorMoved || fluidParamsMoved) {
      ismMapKey = fieldTuning.ismMap;
      ismMapFluidKey = fieldTuning.ismMapFluid;
      rebuildIsmMap();
    }
    // `generator` gates `placeDust.wesl`'s own in-shader placement mode
    // (map-seeded vs `smoothDisc`) from the `ismMap` section rather than
    // `dust`, so a generator flip is invisible to `dustMoved` and needs its
    // own rebuild — or the previous generator's reservation/CDF-scan state
    // keeps drawing as live until an unrelated change rebuilds it.
    if (generatorMoved && !dustMoved) {
      rebuildDustMixture();
      repackFieldComponents();
    }
  }

  /**
   * setMixture — the three movers (a new galaxy, a tuning patch, a new extras
   * set) each arrive from their own host call site, one at a time; the render
   * knobs at the end ride whichever call the host makes next and are compared
   * on every call, since the host re-pushes its whole bag on any knob.
   */
  function setMixture(input: GalaxyFieldMixtureInput): void {
    // `geometry` alone, not `seed`: a seed change always arrives with a fresh
    // `describeGalaxy` result, and every dispatch reads `seed` live anyway.
    const geometryMoved = input.geometry !== geometry;
    const tuningMoved = input.fieldTuning !== fieldTuning;
    const extrasMoved = input.extras !== extras;
    // The two sigmas are the only render lanes the orientation chain reads,
    // and the host re-pushes the WHOLE bag on any knob — so an unconditional
    // invalidate here would redispatch the six stages, and with a generator
    // active the readback and dust rebuild behind them, on every frame of an
    // unrelated exposure drag. No crossing to catch alongside them: an
    // invalidation raised while nothing wanted the value is retained, so the
    // overlay turning on rebuilds by itself.
    const sigmasMoved =
      input.sigmaDerivTexels !== sigmaDerivTexels || input.sigmaIntegTexels !== sigmaIntegTexels;

    const prevTuning = fieldTuning;
    geometry = input.geometry;
    fieldTuning = input.fieldTuning;
    seed = input.seed;
    extras = input.extras;
    sigmaDerivTexels = input.sigmaDerivTexels;
    sigmaIntegTexels = input.sigmaIntegTexels;
    orientationViewWanted = input.orientationViewWanted;

    if (sigmasMoved) orientationTexRebuild.invalidate();

    if (extrasMoved) {
      extraMixtures = extras.map((extra) => ({
        fieldMixture: extraFieldMixture(extra),
        hiiMixture: extraHiiMixture(extra),
      }));
    }

    if (geometryMoved) {
      rebuildForGeometry();
    } else if (tuningMoved) {
      rebuildForTuning(prevTuning);
    }
    // Outside the chain, not an `else if` tail: a call that moves extras AND
    // tuning would otherwise compute the extras' new components above and
    // never write them, since `rebuildForTuning`'s own repacks are gated on
    // which tuning section moved. `rebuildForGeometry` already repacked.
    if (extrasMoved && !geometryMoved) {
      repackFieldComponents();
      repackHiiComponents();
    }
  }

  function stepIsmMap(): { readonly done: boolean } {
    // Texture before CPU copy — the first invalidates the second.
    orientationTexRebuild.ensureFresh();
    orientationDataRebuild.ensureFresh();
    // AFTER orientationTexRebuild, never before: placeDust.wesl reads
    // orientationTex on the GPU directly, so it needs THIS rebuild's own
    // dispatch (if any) to have already run in this same call.
    dustPlacementRebuild.ensureFresh();
    spurCloudPlacementRebuild.ensureFresh();
    armCloudPlacementRebuild.ensureFresh();
    digPlacementRebuild.ensureFresh();
    return { done: true };
  }

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  // `tierData` serves all three tier headers in one loop rather than one
  // scratch per tier; the pack-then-writeBuffer pair per iteration is what
  // makes reuse safe.
  const fieldData = new Float32Array(FIELD_HEADER_FLOATS);
  const hiiData = new Float32Array(FIELD_HEADER_FLOATS);
  const tierData = new Float32Array(FIELD_HEADER_FLOATS);

  /** The HII tier's own tier-global texture knobs — cheap to derive, so read straight off `fieldTuning.hii` rather than cached like `dustHeaderLanes`. */
  function hiiTextureLanes(): HiiTextureLanes {
    // `?? 0`/`?? 1`: the same stale-stored-tuning guard `hiiRegions.ts`
    // applies at its own per-group `texture` reads — a preset saved before
    // this knob existed carries no such key.
    return {
      scale: fieldTuning.hii.shells.textureScale ?? 0,
      contrast: fieldTuning.hii.shells.textureContrast ?? 1,
    };
  }

  function encode(
    encoder: GPUCommandEncoder,
    frameTargets: GalaxyFieldRenderTargets,
    frame: GalaxyFieldFrame,
  ): void {
    // Every FieldHeaderInput this frame needs — field, `hii:extras`, and
    // every tier — assembled in one pure call off explicit mixture lanes,
    // host render settings and this frame's own derived view. Target sizes
    // come off the textures themselves: every reduced target is allocated at
    // exactly the pixel size its divisor floors to, and that lane feeds
    // `counts2.w`, which the shader's footprint gates read directly.
    const headers = buildFieldHeaderInputs({
      eye: frame.eye,
      fov: frame.fov,
      shiftX: frame.shiftX,
      frame: frame.view,
      render: frame.render,
      model: {
        fieldCounts,
        dustHeaderLanes,
        ismMapSeeding: frame.ismMapSeeding,
        hiiCount: hiiComps.count,
        hiiTexture: hiiTextureLanes(),
        youngStars: frame.youngStars,
        armCloudReservation,
        spurCloudReservation,
      },
      targetSizes: {
        field: [frameTargets.fieldTex.width, frameTargets.fieldTex.height],
        dustMapHeightPx: frameTargets.dustMapTex.height,
        hii: [frameTargets.hiiTex.width, frameTargets.hiiTex.height],
        tiers: mapHiiTiers<Vec2>((kind) => [
          frameTargets.hiiTiers[kind].width,
          frameTargets.hiiTiers[kind].height,
        ]),
      },
    });
    packFieldHeaderUniforms(headers.field, fieldData);
    device.queue.writeBuffer(fieldUbo, 0, fieldData);
    packFieldHeaderUniforms(headers.hii, hiiData);
    device.queue.writeBuffer(hiiUbo, 0, hiiData);
    for (const kind of HII_TIER_KINDS) {
      packFieldHeaderUniforms(headers.tiers[kind], tierData);
      device.queue.writeBuffer(tierUbo[kind], 0, tierData);
    }

    if (!frame.render.analyticField) return;
    const timestampWrites = frame.timestampWrites ?? ((): undefined => undefined);
    // The JWST view's own gate, read off the same `debugViews` the headers
    // above were packed from — one lane per fact, so the pass and its header
    // cannot disagree.
    const drawDustView = frame.view.debugViews.dust > 0;

    // Dust-column map: splat the primary's dust slice into `dustMapTex`, at
    // its own divisor-matched resolution (additive). Feeds
    // dustAttenuation.wesl's componentEmission always, and IS the dustPresent
    // pass's own source whenever the JWST view is live — so it has to run
    // whenever either consumer needs it.
    //
    // The third disjunct is `dustMapPopulated`: a skipped pass leaves the
    // last frame's contents, so the frame the dust count drops to zero still
    // has to run — as the clear that empties the map. Assigning the returned
    // latch is what carries that across; drop the assignment and the map
    // freezes at the previous galaxy's dust.
    if (fieldCounts.dust > 0 || drawDustView || fieldPipelines.dustMapPopulated) {
      fieldPipelines.setDustMapPopulated(
        encodeDustMapPass({
          enc: encoder,
          timestampWrites: timestampWrites('dustMap'),
          targetView: frameTargets.dustMapTex.createView(),
          pipeline: fieldPipelines.dustMapPipe,
          bindGroup: fieldPipelines.dustMapBG,
          instanceCount: fieldCounts.dust,
        }),
      );
    }

    // JWST dust-view presentation, into its OWN target — runs ADDITIONALLY
    // alongside the emission splat below rather than replacing it: the four
    // debug views crossfade independently, and the scene pass sums whichever
    // of them are live.
    if (drawDustView) {
      encodeDustPresentPass({
        enc: encoder,
        targetView: frameTargets.dustViewTex.createView(),
        pipeline: fieldPipelines.dustPresentPipe,
        bindGroup: fieldPipelines.dustPresentBG,
      });
    }

    // One draw for the WHOLE emission list `repackFieldComponents` wrote —
    // central galaxy's components then every extra's. `fieldCounts.emission`,
    // NOT the packed total: the trailing dust slice is never drawn as its own
    // quad, only read from inside a primary emission fragment.
    encodeSplatPass({
      enc: encoder,
      label: 'galaxy:fieldPass',
      timestampWrites: timestampWrites('field'),
      targetView: frameTargets.fieldTex.createView(),
      pipeline: fieldPipelines.fieldSplatPipe,
      bindGroup: fieldPipelines.fieldSplatBG,
      instanceCount: fieldCounts.emission,
    });

    // Every tier's own pass, into its own target at its own divisor: shells,
    // young stars and DIG each get a private target rather than sharing
    // `hiiTex`'s coarser one, since a shell or young-stars association is
    // small and bright enough that a coarser shared target would collapse it
    // under a texel. One pass per tier WITH CONTENT, into a freshly cleared
    // target. Asking for a timestamp descriptor marks its slot consumed, so
    // calling it only inside `if (segment)` is what makes a tier's HUD row
    // vanish on the frames it draws nothing.
    for (const kind of HII_TIER_KINDS) {
      const segment = findHiiSegment(hiiSegments, `hii:${kind}`);
      if (!segment) continue;
      encodeSplatPass({
        enc: encoder,
        label: `galaxy:hiiPass:${kind}`,
        timestampWrites: timestampWrites(`hii:${kind}`),
        targetView: frameTargets.hiiTiers[kind].createView(),
        pipeline: fieldPipelines.hiiTierPipeline(kind),
        bindGroup: fieldPipelines.tierBG(kind),
        instanceCount: segment.count,
        firstInstance: segment.first,
      });
    }
    // `hiiTex`'s own pass draws ONLY background extras' HII contribution —
    // see `HiiTierSpec` for why extras can't split into their own
    // shell/DIG/young tiers the way the central galaxy's do.
    const extrasSegment = findHiiSegment(hiiSegments, 'hii:extras');
    if (extrasSegment) {
      encodeSplatPass({
        enc: encoder,
        label: 'galaxy:hiiPass:extras',
        timestampWrites: timestampWrites('hii:extras'),
        targetView: frameTargets.hiiTex.createView(),
        pipeline: fieldPipelines.hiiExtrasPipe,
        bindGroup: fieldPipelines.hiiBG,
        instanceCount: extrasSegment.count,
        firstInstance: extrasSegment.first,
      });
    }
  }

  /**
   * The three overlays present straight into the host's scene pass at full
   * canvas resolution — read as data rather than as glow, so no offscreen and
   * no upsample. All three blend additively, so each sums with whatever the
   * composites already added.
   */
  function encodeOverlays(pass: GPURenderPassEncoder, overlays: GalaxyFieldOverlays): void {
    if (overlays.ismMap) {
      pass.setPipeline(ismMapGenerator.presentPipeline);
      pass.setBindGroup(0, ismMapGenerator.presentBindGroup);
      pass.draw(3);
    }
    if (overlays.orientation) {
      pass.setPipeline(ismMapOrientation.presentPipeline);
      pass.setBindGroup(0, ismMapOrientation.presentBindGroup);
      pass.draw(3);
    }
    // Instanced rather than a covering triangle (one camera-facing quad per
    // placement) and independent of the other two: the SF-event catalog is a
    // second, unrelated star-formation model, not another lens on the same
    // generator.
    if (overlays.bubbles) {
      pass.setPipeline(bubblePresentPipe);
      pass.setBindGroup(0, bubblePresentBG);
      pass.setVertexBuffer(0, overlays.bubbles.buf);
      pass.draw(6, overlays.bubbles.count);
    }
  }

  return {
    setMixture,
    stepIsmMap,
    encode,
    encodeOverlays,

    onTargetsReallocated(next: GalaxyFieldRenderTargets): void {
      targets = next;
      fieldPipelines.rebuildDustMapDependents(fieldComps.buffer, hiiComps.buffer);
    },

    get fieldCounts(): FieldSliceCounts {
      return fieldCounts;
    },
    get dustHeaderLanes(): DustHeaderLanes {
      return dustHeaderLanes;
    },
    get hiiSegments(): readonly HiiSegment[] {
      return hiiSegments;
    },
    get armCloudReservation(): GalaxyFieldMixtureResult['armCloudReservation'] {
      return armCloudReservation;
    },
    get spurCloudReservation(): GalaxyFieldMixtureResult['spurCloudReservation'] {
      return spurCloudReservation;
    },
    ismMapGenerator,
    ismMapOrientation,

    probe: {
      async peekRecords(
        buffer: 'field' | 'hii',
        offset: number,
        count: number,
      ): Promise<Float32Array> {
        if (count <= 0) return new Float32Array(0);
        const source = buffer === 'field' ? fieldComps.buffer : hiiComps.buffer;
        const byteSize = count * FIELD_COMPONENT_FLOATS * 4;
        const byteOffset = offset * FIELD_COMPONENT_FLOATS * 4;
        const enc = device.createCommandEncoder({ label: 'galaxy:peekRecords' });
        enc.copyBufferToBuffer(source, byteOffset, peekScratchBuffer, 0, byteSize);
        device.queue.submit([enc.finish()]);
        await peekScratchBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
        try {
          return new Float32Array(peekScratchBuffer.getMappedRange(0, byteSize).slice(0));
        } finally {
          peekScratchBuffer.unmap();
        }
      },

      async requestDustPlacementReadback(opts) {
        const budget = dustBudget;
        if (!geometry || !budget) return null;
        const { records, mass } = await placeDust.dispatchAndReadbackDust(
          dustDispatchInput(geometry, budget, opts?.forceGeneratorIsFluid),
        );
        // Own encoder/submit, AFTER the placement dispatch above's submit has
        // already retired — `placeDust.massBuffer` holds THIS dispatch's
        // fresh values with nothing else writing to it in between, so this
        // reduction is over the same records the caller just read back.
        const enc = device.createCommandEncoder({ label: 'galaxy:placeDustDebugSurvivorSum' });
        ringReduce.dispatchSurvivorSum(enc, {
          massBuffer: placeDust.massBuffer,
          count: budget.count,
          totalMass: budget.totalMass,
        });
        device.queue.submit([enc.finish()]);
        const renormScale = await ringReduce.readDustRenormScale();
        return { count: budget.count, records, mass, renormScale };
      },

      async requestArmSpurCloudPlacementReadback() {
        const reservation = spurCloudReservation;
        if (!geometry || !reservation) return null;
        const { records, fluxWeight } = await placeArmSpurCloud.dispatchAndReadbackArmSpurCloud(
          spurCloudDispatchInput(geometry, reservation),
        );
        const enc = device.createCommandEncoder({
          label: 'galaxy:placeArmSpurCloudDebugFluxWeightSum',
        });
        ringReduce.dispatchArmSpurFluxWeightSum(enc, {
          fluxWeightBuffer: placeArmSpurCloud.fluxWeightBuffer,
          count: reservation.count,
        });
        device.queue.submit([enc.finish()]);
        const renormScale = await ringReduce.readArmSpurRenormScale();
        return {
          count: reservation.count,
          offset: reservation.offset,
          flux: reservation.flux,
          records,
          fluxWeight,
          renormScale,
        };
      },

      async requestArmCloudPlacementReadback() {
        const reservation = armCloudReservation;
        if (!geometry || !reservation) return null;
        const { records, fluxWeight } = await placeArmCloud.dispatchAndReadbackArmCloud(
          armCloudDispatchInput(geometry, reservation),
        );
        const enc = device.createCommandEncoder({
          label: 'galaxy:placeArmCloudDebugFluxWeightSum',
        });
        ringReduce.dispatchArmCloudFluxWeightSum(enc, {
          fluxWeightBuffer: placeArmCloud.fluxWeightBuffer,
          count: reservation.count,
        });
        device.queue.submit([enc.finish()]);
        const renormScale = await ringReduce.readArmCloudRenormScale();
        return {
          count: reservation.count,
          offset: reservation.offset,
          flux: reservation.flux,
          records,
          fluxWeight,
          renormScale,
        };
      },

      async requestDigVeilPlacementReadback() {
        const budget = digBudget;
        if (!geometry || !budget) return null;
        const records = await placeDigVeil.dispatchAndReadbackDigVeil(
          digDispatchInput(geometry, budget),
        );
        return {
          count: budget.count,
          offset: digOffset,
          amplitudeBase: budget.amplitudeBase,
          records,
        };
      },

      fieldSplatPipe: fieldPipelines.fieldSplatPipe,
      get fieldSplatBG(): GPUBindGroup {
        return fieldPipelines.fieldSplatBG;
      },
    },

    dispose(): void {
      ismMapGenerator.dispose();
      ismMapOrientation.dispose();
      ringReduce.dispose();
      dustCdfScan.dispose();
      digCdfScan.dispose();
      placeDust.dispose();
      placeArmSpurCloud.dispose();
      placeArmCloud.dispose();
      placeDigVeil.dispose();
      fieldComps.destroy();
      hiiComps.destroy();
      for (let i = owned.length - 1; i >= 0; i--) owned[i]!.destroy();
    },
  };
}
