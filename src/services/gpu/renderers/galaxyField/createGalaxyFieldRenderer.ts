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
import type { HiiSegment } from '../../../../@types/galaxy/HiiSegment';
import type { HiiTextureLanes } from '../../../../@types/galaxy/HiiTextureLanes';
import type { HiiTier } from '../../../../@types/galaxy/HiiTier';
import type { IsmMapSeedingLanes } from '../../../../@types/galaxy/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../../../../@types/galaxy/YoungStarsLanes';
import type { StageGraph } from '../../../../@types/gpu/StageGraph';
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
  EMPTY_SHELLS_AND_YOUNG,
  HII_MAX_COUNT,
} from '../../../engine/galaxyGenerator/v2/hiiRegions';
import type { HiiShellsAndYoungResult } from '../../../engine/galaxyGenerator/v2/hiiRegions';
import { MAX_PARTICLE_COUNT } from '../../../engine/galaxyGenerator/v2/dustParticleCloud';
import { YOUNG_CHAIN_MAX_COMPONENTS } from '../../../engine/galaxyGenerator/v2/youngStarChain';
import { ISM_MAP_AMBIENT_DUST } from '../../../../utils/galaxy/ismMapAmbientDust';
import { transformGalaxyFieldComponent } from '../../../../utils/galaxy/transformGalaxyFieldComponent';

import { HII_TIER_KINDS, mapHiiTiers } from '../../../../data/hiiTiers';

import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { createDerived } from '../../lib/createDerived';
import { createKeyedRebuild } from '../../lib/createKeyedRebuild';
import { createStageGraph } from '../../lib/createStageGraph';

import { buildFieldHeaderInputs } from './field/buildFieldHeaderInputs';
import type { FieldHeaderFrameLanes, FieldHeaderRenderLanes } from './field/buildFieldHeaderInputs';
import { createFieldPipelines } from './field/createFieldPipelines';
import type { FieldBindGroups } from './field/createFieldPipelines';
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
 * are scene-wide, not per-galaxy — see `fieldPack`); the last three are host
 * render knobs the orientation chain consumes.
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

const EMPTY_INPUT: GalaxyFieldMixtureInput = {
  geometry: null,
  fieldTuning: DEFAULT_GALAXY_FIELD_TUNING,
  seed: 0,
  extras: [],
  sigmaDerivTexels: 0,
  sigmaIntegTexels: 0,
  orientationViewWanted: false,
};

/**
 * Render targets the HOST allocates and owns. `GPUTexture` rather than
 * `GPUTextureView`: every field/HII/tier header packs `targetSizePx` off the
 * target's own pixel size, and a view exposes no dimensions.
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
  /**
   * `null` until the first `encode` has synced; afterwards it reflects the LAST
   * `encode`'s resources — a `setMixture` that regrew `fieldComps` leaves this
   * bound to the destroyed buffer until the next `encode`. Probe callers must
   * render a frame between mutation and readback (`settleFrames` already does).
   */
  readonly fieldSplatBG: GPUBindGroup | null;
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

  readonly fieldCounts: FieldSliceCounts;
  readonly dustHeaderLanes: DustHeaderLanes;
  /** `hiiComps`' buffer-wide segmentation — the host's composite gates read it. */
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
  // Every GPU-destroyable resource this module allocates registers here at
  // its own site — `dispose` is the single reverse walk, calling whichever
  // teardown method the entry has. Sub-factories spell it `dispose()`
  // (the ISM chain, the two record buffers); raw buffers/textures spell it
  // `destroy()`. Pipelines, bind groups and shader modules have neither in
  // WebGPU and so are never registered — nothing here is ever reassigned.
  const owned: ({ destroy(): void } | { dispose(): void })[] = [];
  const own = <T extends { destroy(): void } | { dispose(): void }>(resource: T): T => {
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
  const ismMapGenerator = own(
    createIsmMapGenerator(device, {
      makeShader,
      hdrFormat,
      fieldUbo,
    }),
  );
  const ismMapOrientation = own(
    createIsmMapOrientation(device, {
      makeShader,
      hdrFormat,
      fieldUbo,
      sourceTexture: ismMapGenerator.texture,
    }),
  );
  // GPU replacement for `ismMapRingMeans.ts`'s CPU loop — see its own header.
  const ringReduce = own(
    createIsmMapRingReduce(device, {
      makeShader,
      ismMapTexture: ismMapGenerator.texture,
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
    }),
  );
  // GPU replacement for `buildIsmMapDustCdf.ts`'s CPU prefix sum.
  const dustCdfScan = own(
    createIsmMapDustCdfScan(device, {
      makeShader,
      maxRings: ISM_MAP_RINGS,
      maxAz: ISM_MAP_AZ,
    }),
  );
  // A SECOND instance of the same factory, at the same ceiling — the DIG
  // veil's own arm-biased weight table. Its OWN buffer, never sharing
  // `dustCdfScan`'s: dust's and DIG's placement dispatches are each deferred
  // independently to `stepIsmMap()`, so one shared `prefixBuffer` would let
  // whichever dispatch runs second silently overwrite the first's input.
  const digCdfScan = own(
    createIsmMapDustCdfScan(device, {
      makeShader,
      maxRings: ISM_MAP_RINGS,
      maxAz: ISM_MAP_AZ,
    }),
  );
  // GPU replacement for `buildDustParticleCloud`'s map-seeded placement.
  const placeDust = own(createIsmMapPlaceDust(device, { makeShader }));
  // GPU replacement for `buildArmSpurParticleCloud`'s placement body.
  const placeArmSpurCloud = own(createIsmMapPlaceArmSpurCloud(device, { makeShader }));
  // GPU replacement for `buildArmParticleCloud`'s placement body.
  const placeArmCloud = own(createIsmMapPlaceArmCloud(device, { makeShader }));
  // GPU replacement for `buildDigVeil`'s complex/children placement.
  const placeDigVeil = own(createIsmMapPlaceDigVeil(device, { makeShader }));

  /** The dust map this module last saw, and whether it holds anything but zeros. */
  let dustMap: { readonly tex: GPUTexture; populated: boolean } | null = null;
  /** What the last `encode`'s `sync` returned — the probe's isolated-range draw reads it. */
  let bindGroups: FieldBindGroups | null = null;

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
  const fieldComps = own(
    createGrowOnlyRecordBuffer({
      device,
      label: 'galaxy:fieldComps',
      // COPY_SRC beyond STORAGE|COPY_DST's production need: the debug-only
      // dust-slot readback copies that range back to the CPU.
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      floatsPerRecord: FIELD_COMPONENT_FLOATS,
      initialCapacity: GALAXY_FIELD_MAX_COMPONENTS,
    }),
  );
  // The HII tier's own storage buffer, byte-identical layout to `fieldComps`
  // but never concatenated into it — see `docs/research/milky-way/
  // hii-regions.md`: a shell sprite is small and bright by construction, so
  // sharing the smooth field's coarser target collapsed it into a bloom
  // firefly. Own buffer, own target, own divisor, own admission ceiling.
  const hiiComps = own(
    createGrowOnlyRecordBuffer({
      device,
      label: 'galaxy:hiiComps',
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      floatsPerRecord: FIELD_COMPONENT_FLOATS,
      // + DIG_MAX_COUNT: the DIG veil rides this SAME buffer as a bounded group
      // pushed after `HII_MAX_COUNT`'s admission, not a reservation carved out
      // of it — so the common case never regrows on first activation.
      // + YOUNG_CHAIN_MAX_COMPONENTS: the young-stars chain rides it too.
      initialCapacity: HII_MAX_COUNT + DIG_MAX_COUNT + YOUNG_CHAIN_MAX_COMPONENTS,
    }),
  );

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

  // ---- mixture state: one input record, and the values derived from it ----
  // Every node below recomputes exactly when its declared key moves, so none
  // of them has (or needs) an invalidation site of its own.
  let current: GalaxyFieldMixtureInput = EMPTY_INPUT;

  /** The CENTRAL galaxy's field mixture, with the spur/arm-cloud reservations it carries. */
  const centralField = createDerived<GalaxyFieldMixtureResult>({
    key: () => [current.geometry, current.fieldTuning.disc, current.fieldTuning.arms],
    compute: () => {
      const geo = current.geometry;
      // No galaxy means zero components — which draws nothing, not the same as stale.
      if (!geo) return { components: [], spurCloudReservation: null, armCloudReservation: null };
      return buildGalaxyFieldMixture(geo, current.fieldTuning);
    },
  });

  /**
   * The central galaxy's HII tier — extras never take DIG, so only this path
   * pays `buildHiiShellsAndYoungWithSegments`' bookkeeping. `arms` enters the
   * key as `widthScale` alone: HII reads the arms only through `armCrossSigma`,
   * so a whole-section edge would rebuild its O(rings x az x arms) CDF sweep on
   * an arm-cloud drag that cannot change the output.
   */
  const centralHii = createDerived<HiiShellsAndYoungResult>({
    key: () => [
      current.geometry,
      current.fieldTuning.hii,
      current.fieldTuning.starFormation,
      current.fieldTuning.arms.widthScale,
    ],
    compute: () => {
      const geo = current.geometry;
      if (!geo) return EMPTY_SHELLS_AND_YOUNG;
      return buildHiiShellsAndYoungWithSegments(
        geo,
        current.fieldTuning,
        current.fieldTuning.starFormation,
        geo.seed,
      );
    },
  });

  /**
   * Each extra's own mixtures, already in world space — index-parallel to
   * `current.extras`. Two nodes rather than one pair: the tiers answer to
   * different tuning sections, so a move rebuilds only the half that moved.
   */
  const extraFieldMixtures = createDerived<readonly (readonly GalaxyFieldComponent[])[]>({
    key: () => [current.extras, current.fieldTuning.disc, current.fieldTuning.arms],
    compute: () => current.extras.map((extra) => extraFieldMixture(extra)),
  });

  const extraHiiMixtures = createDerived<readonly (readonly GalaxyFieldComponent[])[]>({
    key: () => [
      current.extras,
      current.fieldTuning.hii,
      current.fieldTuning.starFormation,
      current.fieldTuning.arms.widthScale,
    ],
    compute: () => current.extras.map((extra) => extraHiiMixture(extra)),
  });

  /** The header's dust lanes — read every frame, moved only by geometry or the dust section. */
  const dustHeaderLanes = createDerived<DustHeaderLanes>({
    key: () => [current.geometry, current.fieldTuning.dust],
    compute: () => {
      const dust = current.fieldTuning.dust;
      return deriveDustHeaderLanes(current.geometry, dust, dust.enabled);
    },
  });

  /**
   * The analytic dust lane's RESERVATION, CENTRAL galaxy only. The CPU only
   * ever sees this budget/uniform shape — `placeDust.wesl` decides slot
   * CONTENT on the GPU. `dust.enabled` gates it the way `disc.enabled`/
   * `arms.enabled` gate their shader loops: an off pill reserves nothing.
   */
  const dustBudget = createDerived<PlaceDustBudget | null>({
    key: () => [current.geometry, current.fieldTuning.dust],
    compute: () => {
      const geo = current.geometry;
      const dust = current.fieldTuning.dust;
      return geo && dust.enabled ? computePlaceDustBudget(geo, dust) : null;
    },
  });

  /**
   * The DIG veil's RESERVATION, CENTRAL galaxy only. Keyed on `centralHii`'s
   * whole record rather than the two flux lanes it reads: what used to be a
   * "call this after the HII rebuild" rule at two sites is now a declared edge.
   */
  const digBudget = createDerived<DigVeilBudget | null>({
    key: () => [current.geometry, current.fieldTuning.hii.dig, centralHii.get()],
    compute: () => {
      const geo = current.geometry;
      if (!geo) return null;
      const hii = centralHii.get();
      return computeDigVeilBudget(geo, current.fieldTuning, hii.shellFluxSum, hii.recentEventCount);
    },
  });

  /**
   * `fieldComps`' whole contents: the central galaxy's emission mixture, then
   * every extra's (already in world space), then the central galaxy's dust
   * RESERVATION — a zero block (amplitude 0 draws nothing) that
   * `dustPlacementRebuild` fills in a LATER, separate GPU pass; the pack's own
   * job is sizing it. Dust trails every emission component (never interleaved)
   * so `dustOffset == counts.emission` holds with no bookkeeping pass of its
   * own — see io.wesl's layout comment.
   */
  const fieldPack = createDerived<{ packed: Float32Array; counts: FieldSliceCounts }>({
    key: () => [centralField.get(), extraFieldMixtures.get(), dustBudget.get()],
    compute: () => {
      const primary = centralField.get().components;
      const emission: GalaxyFieldComponent[] = [...primary];
      for (const extra of extraFieldMixtures.get()) emission.push(...extra);
      const dustCount = dustBudget.get()?.count ?? 0;
      const counts: FieldSliceCounts = {
        emission: emission.length,
        primary: primary.length,
        dust: dustCount,
      };
      const packedEmission = packFieldComponents(emission);
      if (dustCount <= 0) return { packed: packedEmission, counts };
      const packed = new Float32Array(packedEmission.length + dustCount * FIELD_COMPONENT_FLOATS);
      packed.set(packedEmission, 0);
      return { packed, counts };
    },
  });

  /**
   * `hiiComps`' whole contents plus its buffer-wide segmentation. A SEPARATE
   * buffer rather than a further slice of `fieldComps`: see `hiiComps` for why
   * the tier cannot share the field's target, and a shared BUFFER with a
   * separate TARGET would still mean one draw painting into two attachments,
   * which WebGPU has no way to do. DIG's span is a RESERVATION written zero
   * here, exactly `fieldPack`'s dust-tail discipline, except EMBEDDED between
   * shells and young (matching the tier's original ordering).
   */
  const hiiPack = createDerived<{ packed: Float32Array; segments: readonly HiiSegment[] }>({
    key: () => [centralHii.get(), extraHiiMixtures.get(), digBudget.get()],
    compute: () => {
      const hii = centralHii.get();
      const shellsCount = hii.segments.find((s) => s.label === 'hii:shells')?.count ?? 0;
      const digCount = digBudget.get()?.count ?? 0;
      const packedShells = packFieldComponents(hii.components.slice(0, shellsCount));
      const packedYoung = packFieldComponents(hii.components.slice(shellsCount));
      const extrasComponents: GalaxyFieldComponent[] = [];
      for (const extra of extraHiiMixtures.get()) extrasComponents.push(...extra);
      const packedExtras = packFieldComponents(extrasComponents);

      const packed = new Float32Array(
        packedShells.length +
          digCount * FIELD_COMPONENT_FLOATS +
          packedYoung.length +
          packedExtras.length,
      );
      let offset = 0;
      packed.set(packedShells, offset);
      offset += packedShells.length;
      const digOffset = offset / FIELD_COMPONENT_FLOATS;
      offset += digCount * FIELD_COMPONENT_FLOATS;
      packed.set(packedYoung, offset);
      offset += packedYoung.length;
      packed.set(packedExtras, offset);

      const youngCount = hii.components.length - shellsCount;
      const extrasCount = extrasComponents.length;
      return {
        packed,
        segments: [
          { label: 'hii:shells', first: 0, count: shellsCount },
          { label: 'hii:dig', first: digOffset, count: digCount },
          { label: 'hii:young', first: digOffset + digCount, count: youngCount },
          ...(extrasCount > 0
            ? [
                {
                  label: 'hii:extras',
                  first: digOffset + digCount + youngCount,
                  count: extrasCount,
                },
              ]
            : []),
        ],
      };
    },
  });

  /**
   * The CPU copy of the orientation field — diagnostics-only (the host's
   * coherence-stat report); dust placement reads `orientationTex` on the GPU
   * directly. Still gated on the generator being active: a disabled generator
   * has nothing coherent to report either.
   */
  const orientationDataRebuild = createKeyedRebuild({
    wanted: () => current.fieldTuning.ismMap.generator !== 'none',
    build: () => deps.onOrientationRebuilt?.(ismMapGridRadiusOrDefault(current.geometry)),
  });

  /**
   * The GPU structure-tensor chain over the CURRENT `ismMapTex`. Two
   * independent consumers — the debug overlay reads the texture on the GPU,
   * dust placement the same texture — either enough to justify the six
   * dispatches. Needs no readback to run FROM: ismMapTex is a GPU texture
   * WebGPU zero-initialises, so dispatching before the `ismMap` stage has ever
   * populated it is safe. Invalidated by that stage and by a sigma move.
   */
  const orientationTexRebuild = createKeyedRebuild({
    wanted: () => current.orientationViewWanted || current.fieldTuning.ismMap.generator !== 'none',
    build: () => {
      // gasFloor=1 when the generator is off: the map texture is a cleared
      // (all-zero) blank then, and ismMapOrientationField.wesl's
      // IsmMapOrientationPedestal derives its zero-gradient invariant from
      // gasProfile(r) collapsing to a flat 1.0 — a real fluid gasFloor here
      // would subtract a non-flat pedestal from that blank data and paint a
      // fake radial gradient into the orientation view. gasScaleLength must
      // still be finite even though it's then algebraically unused.
      const pedestal =
        current.fieldTuning.ismMap.generator === 'fluid'
          ? current.fieldTuning.ismMapFluid
          : { gasFloor: 1, gasScaleLength: 1 };
      ismMapOrientation.dispatch({
        grid: ismMapGridRadiusOrDefault(current.geometry),
        sigmaDerivTexels: current.sigmaDerivTexels,
        sigmaIntegTexels: current.sigmaIntegTexels,
        gasFloor: pedestal.gasFloor,
        gasScaleLength: pedestal.gasScaleLength,
        ambient: ISM_MAP_AMBIENT_DUST,
      });
      orientationDataRebuild.invalidate();
    },
  });

  /**
   * dustPlacementRebuild — encodes `placeDust.wesl` into its own encoder, off
   * the CURRENT `dustBudget`. Consumed from `stepIsmMap()` AFTER
   * `orientationTexRebuild`, never synchronously from the rebuilds above:
   * this dispatch needs `orientationTex` already fresh for whatever
   * `ismMapTex` the rebuild wrote, and the lazy per-frame gate is what
   * guarantees that ordering. A one-frame-late fill is the honest cost.
   */
  const dustPlacementRebuild = createKeyedRebuild({
    wanted: () => dustBudget.get() !== null,
    build: () => {
      const geo = current.geometry;
      const budget = dustBudget.get();
      if (!geo || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDust' });
      placeDust.dispatchPlaceDust(enc, dustDispatchInput(geo, budget));
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
      seed: current.seed,
      budget,
      dustOffset: fieldPack.get().counts.emission,
      generatorIsFluid: forceGeneratorIsFluid ?? current.fieldTuning.ismMap.generator === 'fluid',
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
      fieldCompsBuffer: fieldComps.getBuffer(),
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
    wanted: () => centralField.get().spurCloudReservation !== null,
    build: () => {
      const geo = current.geometry;
      const reservation = centralField.get().spurCloudReservation;
      if (!geo || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloud' });
      placeArmSpurCloud.dispatchPlaceArmSpurCloud(enc, spurCloudDispatchInput(geo, reservation));
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
      seed: current.seed,
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      spurArms: reservation.spurArms,
      geometry: geo,
      tuning: current.fieldTuning,
      fieldCompsBuffer: fieldComps.getBuffer(),
    };
  }

  /**
   * armCloudPlacementRebuild — the arm-cloud twin. Its own
   * `orientationTexture` bind is a dead pass-through (see
   * `placeArmCloud.wesl`), so this too has no real ordering dependency on
   * `orientationTexRebuild`.
   */
  const armCloudPlacementRebuild = createKeyedRebuild({
    wanted: () => centralField.get().armCloudReservation !== null,
    build: () => {
      const geo = current.geometry;
      const reservation = centralField.get().armCloudReservation;
      if (!geo || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmCloud' });
      placeArmCloud.dispatchPlaceArmCloud(enc, armCloudDispatchInput(geo, reservation));
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
      seed: current.seed,
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      geometry: geo,
      tuning: current.fieldTuning,
      orientationTexture: ismMapOrientation.texture,
      fieldCompsBuffer: fieldComps.getBuffer(),
    };
  }

  /**
   * digPlacementRebuild — the DIG twin. Reads no `orientationTex` at all
   * (this tier has no coherence-blend mode), so no real ordering dependency
   * either; placed after it anyway, one discipline rather than four.
   */
  const digPlacementRebuild = createKeyedRebuild({
    wanted: () => digBudget.get() !== null,
    build: () => {
      const geo = current.geometry;
      const budget = digBudget.get();
      if (!geo || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDigVeil' });
      placeDigVeil.dispatchPlaceDigVeil(enc, digDispatchInput(geo, budget));
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
      seed: current.seed,
      budget,
      reservationOffset: findHiiSegment(hiiPack.get().segments, 'hii:dig')?.first ?? 0,
      generatorIsFluid: current.fieldTuning.ismMap.generator === 'fluid',
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
      hiiCompsBuffer: hiiComps.getBuffer(),
    };
  }

  /** Into world space — extras only; the central galaxy stays in its own frame. */
  function place(
    components: readonly GalaxyFieldComponent[],
    transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return components.map((c) => transformGalaxyFieldComponent(c, transform));
  }

  function extraFieldMixture(extra: GalaxyFieldExtra): readonly GalaxyFieldComponent[] {
    return place(
      buildGalaxyFieldMixture(extra.geometry, current.fieldTuning).components,
      extra.transform,
    );
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
        current.fieldTuning,
        current.fieldTuning.starFormation,
        extra.geometry.seed,
        null,
      ),
      extra.transform,
    );
  }

  type StageName = 'ismMap' | 'scan:dust' | 'scan:dig' | 'upload:field' | 'upload:hii';

  /**
   * The effect half of this module's dependency graph, as data: table order IS
   * the schedule and `after` only proves it. `ismMap` leads the two scans, so a
   * new galaxy scans once from the final map instead of once per trigger.
   *
   * TRANSITIONAL: every row still hand-invalidates the six surviving
   * `createKeyedRebuild` nodes, reproducing what the deleted rebuild functions
   * did. Those nodes become the table's own step-phase rows, and these calls go
   * with them.
   */
  const graph: StageGraph<StageName> = createStageGraph<StageName>([
    {
      name: 'ismMap',
      phase: 'sync',
      after: [],
      // No `arms.widthScale`, though the forcing field bakes against the ridge
      // it sizes: this rebuild is N compute dispatches, so keying on it would
      // make an arm-width drag pay them per frame. Deliberately left stale
      // until `ismMap` itself moves.
      key: () => [
        current.geometry,
        current.fieldTuning.ismMap,
        current.fieldTuning.ismMapFluid,
        current.seed,
      ],
      run: () => {
        const grid = ismMapGenerator.rebuild({
          geometry: current.geometry,
          tuning: current.fieldTuning,
          seed: current.seed,
        });
        if (current.fieldTuning.ismMap.generator === 'fluid') {
          const enc = device.createCommandEncoder({ label: 'galaxy:ismMapRingReduceRebuild' });
          // ringMeansBuffer written HERE; the two scan rows' own LATER submits
          // read it — WebGPU's cross-SUBMIT ordering on one queue is what makes
          // that safe with no barrier of our own.
          ringReduce.dispatchRingMeans(enc);
          device.queue.submit([enc.finish()]);
        }
        // Fires on BOTH exits, the disabled one too, so the host's CPU copy
        // reflects the cleared texture rather than an earlier galaxy's map.
        deps.onIsmMapRebuilt?.(grid);
        orientationTexRebuild.invalidate();
        dustPlacementRebuild.invalidate();
        digPlacementRebuild.invalidate();
      },
    },
    {
      name: 'scan:dust',
      phase: 'sync',
      after: ['ismMap'],
      // No `geometry` of its own — the map token already moves on one — and
      // `dustPlacementCap` is the only `dust` lane the scan reads.
      key: () => [
        graph.token('ismMap'),
        current.fieldTuning.dust.cloud.dustPlacementCap,
        current.fieldTuning.ismMap,
      ],
      run: () => {
        if (!current.geometry || current.fieldTuning.ismMap.generator !== 'fluid') return;
        const grid = ismMapGridRadiusOrDefault(current.geometry);
        const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDustCdfScanRebuild' });
        // `ringCap` reproduces dustParticleCloud.ts's density() ring-mean-
        // normalised, capped placement density (ismMapDustCdfScan.wesl's own doc).
        dustCdfScan.dispatchScan(enc, {
          ismMapTexture: ismMapGenerator.texture,
          grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
          weights: {
            kind: 'channel',
            channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
            ringCap: current.fieldTuning.dust.cloud.dustPlacementCap ?? 0,
          },
          ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
        });
        device.queue.submit([enc.finish()]);
        dustPlacementRebuild.invalidate();
      },
    },
    {
      name: 'scan:dig',
      phase: 'sync',
      after: ['ismMap'],
      // `arms.widthScale` because `buildDigArmEnvelopeTable` sizes its
      // cross-arm sigma from it (`armCrossSigma`) — the same single lane
      // `centralHii` keys on, and the only part of `arms` this row reads.
      key: () => [
        graph.token('ismMap'),
        current.fieldTuning.hii.dig,
        current.fieldTuning.arms.widthScale,
        current.fieldTuning.ismMap,
        current.geometry,
      ],
      run: () => {
        const geo = current.geometry;
        if (!geo || current.fieldTuning.ismMap.generator !== 'fluid') return;
        const grid = ismMapGridRadiusOrDefault(geo);
        // Clamped HERE, at the packing call site: `buildDigVeil`'s CPU original
        // clamps to [0, 1] before ever building the envelope, and the scan
        // shader trusts whatever `params.armBias` it is handed.
        const armBias = Math.min(1, Math.max(0, current.fieldTuning.hii.dig?.armBias ?? 0));
        const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDigCdfScanRebuild' });
        digCdfScan.dispatchScan(enc, {
          ismMapTexture: ismMapGenerator.texture,
          grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
          weights: {
            kind: 'armBiased',
            // DIG's own CDF weights the map's `activity` channel alone.
            channelWeights: { gas: 0, stars: 0, activity: 1, dust: 0 },
            armBias,
            armCount: geo.arms.length,
            entries: buildDigArmEnvelopeTable(geo, current.fieldTuning, {
              rings: ISM_MAP_RINGS,
              rMin: grid.rMin,
              rMax: grid.rMax,
            }),
          },
          ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
        });
        device.queue.submit([enc.finish()]);
        digPlacementRebuild.invalidate();
      },
    },
    {
      name: 'upload:field',
      phase: 'sync',
      after: [],
      key: () => [fieldPack.get()],
      run: () => {
        spurCloudPlacementRebuild.invalidate();
        armCloudPlacementRebuild.invalidate();
        dustPlacementRebuild.invalidate();
        fieldComps.write(fieldPack.get().packed);
      },
    },
    {
      name: 'upload:hii',
      phase: 'sync',
      after: [],
      key: () => [hiiPack.get()],
      run: () => {
        digPlacementRebuild.invalidate();
        hiiComps.write(hiiPack.get().packed);
      },
    },
  ]);

  function setMixture(input: GalaxyFieldMixtureInput): void {
    // Transitional alongside the table: the sigma lanes are the orientation
    // row's key element, and that row is still a `createKeyedRebuild`. An
    // unconditional invalidate would redispatch the six orientation stages on
    // every frame of an unrelated exposure drag, since the host re-pushes its
    // whole bag on any knob.
    const sigmasMoved =
      input.sigmaDerivTexels !== current.sigmaDerivTexels ||
      input.sigmaIntegTexels !== current.sigmaIntegTexels;
    current = input;
    if (sigmasMoved) orientationTexRebuild.invalidate();
    graph.run('sync');
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
      scale: current.fieldTuning.hii.shells.textureScale ?? 0,
      contrast: current.fieldTuning.hii.shells.textureContrast ?? 1,
    };
  }

  function encode(
    encoder: GPUCommandEncoder,
    frameTargets: GalaxyFieldRenderTargets,
    frame: GalaxyFieldFrame,
  ): void {
    // Pulled, not pushed: the bind groups any pass below binds are the ones
    // built from THIS frame's own resources, so a buffer regrow or a target
    // reallocation the module was never told about cannot leave a group
    // holding a dead object.
    bindGroups = fieldPipelines.sync({
      fieldComps: fieldComps.getBuffer(),
      hiiComps: hiiComps.getBuffer(),
      dustMap: frameTargets.dustMapTex,
    });

    // Every FieldHeaderInput this frame needs — field, `hii:extras`, and
    // every tier — assembled in one pure call off explicit mixture lanes,
    // host render settings and this frame's own derived view. Target sizes
    // come off the textures themselves: every reduced target is allocated at
    // exactly the pixel size its divisor floors to, and that lane feeds
    // `counts2.w`, which the shader's footprint gates read directly.
    const fieldCounts = fieldPack.get().counts;
    const hiiSegments = hiiPack.get().segments;
    const central = centralField.get();

    const headers = buildFieldHeaderInputs({
      eye: frame.eye,
      fov: frame.fov,
      shiftX: frame.shiftX,
      frame: frame.view,
      render: frame.render,
      model: {
        fieldCounts,
        dustHeaderLanes: dustHeaderLanes.get(),
        ismMapSeeding: frame.ismMapSeeding,
        hiiCount: hiiComps.count,
        hiiTexture: hiiTextureLanes(),
        youngStars: frame.youngStars,
        armCloudReservation: central.armCloudReservation,
        spurCloudReservation: central.spurCloudReservation,
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

    // `bindGroups` is null only before the host has allocated a dust map, and
    // then there is nothing to draw with — same "headers still written, no
    // passes" exit as the disabled field.
    if (!frame.render.analyticField || bindGroups === null) return;
    const groups = bindGroups;
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
    // The third disjunct is `populated`: a skipped pass leaves the last
    // frame's contents, so the frame the dust count drops to zero still has to
    // run — as the clear that empties the map. Assigning the returned latch is
    // what carries that across; drop the assignment and the map freezes at the
    // previous galaxy's dust. A texture WebGPU just created is zeroed, so a
    // moved identity implies `populated: false` rather than the host having to
    // announce it.
    if (dustMap?.tex !== frameTargets.dustMapTex) {
      dustMap = { tex: frameTargets.dustMapTex, populated: false };
    }
    const dustState = dustMap;
    if (fieldCounts.dust > 0 || drawDustView || dustState.populated) {
      dustState.populated = encodeDustMapPass({
        enc: encoder,
        timestampWrites: timestampWrites('dustMap'),
        targetView: frameTargets.dustMapTex.createView(),
        pipeline: fieldPipelines.dustMapPipe,
        bindGroup: groups.dustMap,
        instanceCount: fieldCounts.dust,
      });
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
        bindGroup: groups.dustPresent,
      });
    }

    // One draw for the WHOLE emission list `upload:field` wrote —
    // central galaxy's components then every extra's. `fieldCounts.emission`,
    // NOT the packed total: the trailing dust slice is never drawn as its own
    // quad, only read from inside a primary emission fragment.
    encodeSplatPass({
      enc: encoder,
      label: 'galaxy:fieldPass',
      timestampWrites: timestampWrites('field'),
      targetView: frameTargets.fieldTex.createView(),
      pipeline: fieldPipelines.fieldSplatPipe,
      bindGroup: groups.fieldSplat,
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
        bindGroup: groups.tier(kind),
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
        bindGroup: groups.hii,
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

    get fieldCounts(): FieldSliceCounts {
      return fieldPack.get().counts;
    },
    get dustHeaderLanes(): DustHeaderLanes {
      return dustHeaderLanes.get();
    },
    get hiiSegments(): readonly HiiSegment[] {
      return hiiPack.get().segments;
    },
    get armCloudReservation(): GalaxyFieldMixtureResult['armCloudReservation'] {
      return centralField.get().armCloudReservation;
    },
    get spurCloudReservation(): GalaxyFieldMixtureResult['spurCloudReservation'] {
      return centralField.get().spurCloudReservation;
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
        const source = buffer === 'field' ? fieldComps.getBuffer() : hiiComps.getBuffer();
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
        const budget = dustBudget.get();
        if (!current.geometry || !budget) return null;
        const { records, mass } = await placeDust.dispatchAndReadbackDust(
          dustDispatchInput(current.geometry, budget, opts?.forceGeneratorIsFluid),
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
        const reservation = centralField.get().spurCloudReservation;
        if (!current.geometry || !reservation) return null;
        const { records, fluxWeight } = await placeArmSpurCloud.dispatchAndReadbackArmSpurCloud(
          spurCloudDispatchInput(current.geometry, reservation),
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
        const reservation = centralField.get().armCloudReservation;
        if (!current.geometry || !reservation) return null;
        const { records, fluxWeight } = await placeArmCloud.dispatchAndReadbackArmCloud(
          armCloudDispatchInput(current.geometry, reservation),
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
        const budget = digBudget.get();
        if (!current.geometry || !budget) return null;
        const records = await placeDigVeil.dispatchAndReadbackDigVeil(
          digDispatchInput(current.geometry, budget),
        );
        return {
          count: budget.count,
          offset: findHiiSegment(hiiPack.get().segments, 'hii:dig')?.first ?? 0,
          amplitudeBase: budget.amplitudeBase,
          records,
        };
      },

      fieldSplatPipe: fieldPipelines.fieldSplatPipe,
      get fieldSplatBG(): GPUBindGroup | null {
        return bindGroups?.fieldSplat ?? null;
      },
    },

    dispose(): void {
      for (let i = owned.length - 1; i >= 0; i--) {
        const resource = owned[i]!;
        if ('destroy' in resource) resource.destroy();
        else resource.dispose();
      }
    },
  };
}
