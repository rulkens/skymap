/**
 * createGalaxyModel — what a galaxy IS, as opposed to how a frame draws it:
 * the central galaxy's sprite buffers and background extras, the two
 * analytic mixtures (emission + HII), the dust cloud, the SSPISM map, and the
 * GPU record buffers all of that packs into.
 *
 * `setParams` / `setFieldTuning` / `setExtras` are the only writers; a tuning
 * slider is a CPU rebuild rather than a regenerate. Nothing here encodes a
 * render pass or reads a camera — the engine owns the pipelines, targets and
 * per-frame headers, and binds the buffers this exposes.
 */

import type { DebugViewKind } from '../../../@types/data/DebugViewKind';
import type { DustHeaderLanes } from '../../../@types/engine/DustHeaderLanes';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import type { FieldSliceCounts } from '../../../@types/engine/FieldSliceCounts';
import type { HiiSegment } from '../../../@types/engine/HiiSegment';
import type { HiiTextureLanes } from '../../../@types/engine/HiiTextureLanes';
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';
import type { LodSettings } from '../../../@types/engine/LodSettings';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { IsmMapSeedingLanes } from '../../../@types/engine/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../../../@types/engine/YoungStarsLanes';

import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldMixtureResult } from '../../../../../src/@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';
import type { GalaxyIsmMapParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapParams';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';

import { createGenerationPipelines } from '../../../../../src/services/engine/galaxyGenerator/v1/createGenerationPipelines';
import { GENERATION_UBO } from '../../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import {
  buildDustBubblePlacements,
  buildHiiCavityPlacements,
  BUBBLE_BUDGET,
  HII_CAVITY_BUDGET,
} from '../../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';
import {
  buildGalaxyFieldMixture,
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ismMapGridRadius,
  ismMapGridRadiusOrDefault,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import {
  buildHiiRegions,
  buildHiiShellsAndYoungWithSegments,
  DIG_MAX_COUNT,
  HII_MAX_COUNT,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { YOUNG_CHAIN_MAX_COMPONENTS } from '../../../../../src/services/engine/galaxyGenerator/v2/youngStarChain';
import { normalizeGenerationSeed } from '../../../../../src/utils/galaxy/normalizeGenerationSeed';
import { areaWeightedMeanIsmMapChannel } from '../../../../../src/utils/galaxy/areaWeightedMeanIsmMapChannel';
import { ismMapRingMeans } from '../../../../../src/utils/galaxy/ismMapRingMeans';
import { ISM_MAP_AMBIENT_DUST } from '../../../../../src/utils/galaxy/ismMapAmbientDust';
import { transformGalaxyFieldComponent } from '../../../../../src/utils/galaxy/transformGalaxyFieldComponent';
import { arrayMean } from '../../../../../src/utils/math/arrayMean';

import { DEBUG_VIEWS } from '../../data/debugViews';
import { createKeyedRebuild } from '../createKeyedRebuild';
import { deriveDustHeaderLanes } from '../field/deriveDustHeaderLanes';
import { createGrowOnlyRecordBuffer } from '../gpu/createGrowOnlyRecordBuffer';
import type { GrowOnlyRecordBuffer } from '../gpu/createGrowOnlyRecordBuffer';
import { generateGalaxy } from '../sprites/generateGalaxy';
import { createOrientationDiagnostics } from '../ismMap/createOrientationDiagnostics';
import type { IsmMapGenerator } from '../ismMap/createIsmMapGenerator';
import type { IsmMapOrientation } from '../ismMap/createIsmMapOrientation';
import type { IsmMapRingReduce } from '../ismMap/createIsmMapRingReduce';
import type { IsmMapDustCdfScan } from '../ismMap/createIsmMapDustCdfScan';
import { computePlaceDustBudget } from '../ismMap/computePlaceDustBudget';
import type { PlaceDustBudget } from '../ismMap/computePlaceDustBudget';
import { computeDigVeilBudget } from '../ismMap/computeDigVeilBudget';
import type { DigVeilBudget } from '../ismMap/computeDigVeilBudget';
import { buildDigArmEnvelopeTable } from '../ismMap/buildDigArmEnvelopeTable';
import type { IsmMapPlaceDust, PlaceDustDispatchInput } from '../ismMap/createIsmMapPlaceDust';
import type {
  IsmMapPlaceArmSpurCloud,
  PlaceArmSpurCloudDispatchInput,
} from '../ismMap/createIsmMapPlaceArmSpurCloud';
import type {
  IsmMapPlaceArmCloud,
  PlaceArmCloudDispatchInput,
} from '../ismMap/createIsmMapPlaceArmCloud';
import type {
  IsmMapPlaceDigVeil,
  PlaceDigVeilDispatchInput,
} from '../ismMap/createIsmMapPlaceDigVeil';
import { SPUR_CLOUD_MAX_COUNT } from '../../../../../src/services/engine/galaxyGenerator/v2/armSpurParticleCloud';
import { ARM_CLOUD_MAX_COUNT } from '../../../../../src/services/engine/galaxyGenerator/v2/armParticleCloud';
import { MAX_PARTICLE_COUNT } from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import { createIsmMapReadbacks } from '../ismMap/createIsmMapReadbacks';
import { BUBBLE_RECORD_FLOATS, packBubbleInstances } from '../field/packBubbleInstances';
import { FIELD_COMPONENT_FLOATS, packFieldComponents } from '../field/packFieldUniforms';

/**
 * A single generated extra galaxy. The UBO is retained rather than destroyed
 * right after the generation submit, so its lifetime brackets the vertex
 * buffers it produced; the whole triple is torn down together on the next
 * `setExtras`. `fieldGeometry`/`transform` are cached for the same reason the
 * central galaxy's are — `setFieldTuning` rebuilds this extra's world-space
 * mixtures off them, with no regenerate. No per-extra `starFormation` any
 * more: the tier moved onto `GalaxyFieldTuning`, so every extra now reads the
 * SAME scene-wide `currentStarFormation()` the central galaxy does.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
  fieldGeometry: GalaxyDescription;
  transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
  fieldMixture: readonly GalaxyFieldComponent[];
  /** This extra's own HII tier — see `hiiComps` for why it rides a separate buffer from `fieldMixture`. */
  hiiMixture: readonly GalaxyFieldComponent[];
};

export type GalaxyModelDeps = {
  readonly device: GPUDevice;
  readonly ismMapGenerator: IsmMapGenerator;
  readonly orientation: IsmMapOrientation;
  /** GPU replacement for `ismMapRingMeans.ts`'s CPU loop — see `recomputeIsmMapSeedingMeans`. */
  readonly ringReduce: IsmMapRingReduce;
  /** GPU replacement for `buildIsmMapDustCdf.ts`'s CPU prefix sum — dust-weight table, see `rebuildIsmMap`. */
  readonly dustCdfScan: IsmMapDustCdfScan;
  /** GPU replacement for `buildDustParticleCloud`'s map-seeded placement — see `dustPlacementRebuild`. */
  readonly placeDust: IsmMapPlaceDust;
  /** GPU replacement for `buildArmSpurParticleCloud`'s placement body — see `spurCloudPlacementRebuild`. */
  readonly placeArmSpurCloud: IsmMapPlaceArmSpurCloud;
  /** GPU replacement for `buildArmParticleCloud`'s placement body — see `armCloudPlacementRebuild`. */
  readonly placeArmCloud: IsmMapPlaceArmCloud;
  /** GPU replacement for `buildIsmMapDustCdf.ts`'s CPU prefix sum, the DIG veil's OWN 'armBiased' weight table — a SEPARATE instance/buffer from `dustCdfScan` (see `dispatchDigCdfScan`'s own doc for why sharing one buffer across two tiers' own deferred dispatches would race). */
  readonly digCdfScan: IsmMapDustCdfScan;
  /** GPU replacement for `buildDigVeil`'s complex/children placement — see `digPlacementRebuild`. */
  readonly placeDigVeil: IsmMapPlaceDigVeil;
  /** The engine's live bag, merged in place by `setRender`. Read for exactly two debug-view weights and the orientation chain's two sigmas. */
  readonly render: Readonly<RenderSettings & LodSettings>;
  /**
   * Rebuild every `layout: 'auto'` bind group naming `fieldComps.buffer` /
   * `hiiComps.buffer`. A regrow REPLACES the GPUBuffer and a group holds the
   * exact object it was built against, so these are not optional bookkeeping.
   */
  readonly onFieldCompsRegrow: () => void;
  readonly onHiiCompsRegrow: () => void;
  readonly onStats?: (stats: EngineStats) => void;
  readonly onOrientationDiagnostics?: (diagnostics: OrientationDiagnostics) => void;
};

export type GalaxyModel = {
  setParams(params: GalaxyParams): Promise<void>;
  setFieldTuning(patch: Partial<GalaxyFieldTuning>): void;
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>;
  /** Re-key the rebuild gates against the render bag the engine just merged into. */
  noteRenderChanged(): void;
  /**
   * Run the per-frame rebuild gates, in their own dependency order. The caller
   * must do this BEFORE the frame's encoder exists: a rebuild can replace
   * `bubbleComps`'s buffer, which a recorded draw would already hold, and the
   * orientation chain submits an encoder that must precede the frame's.
   */
  ensureFresh(): { readonly bubblesLive: boolean };

  readonly starCount: number;
  readonly fieldCounts: FieldSliceCounts;
  /** Cached by the dust rebuild — the header reads these every frame, they change only when dust does. */
  readonly dustHeaderLanes: DustHeaderLanes;
  /** The HII tier's own tier-global texture knobs — cheap to derive, so read straight off `fieldTuning.hii` rather than cached like `dustHeaderLanes`. */
  readonly hiiTexture: HiiTextureLanes;
  /**
   * §5's shader-side young-stars stars-map read (`hiiSplat/youngFragment.wesl`'s
   * `g3.w` branch) — `contrastGamma` reads `fieldTuning.hii.youngStars.contrast`
   * live, `invMeanNorm` is `areaWeightedMeanIsmMapChannel`'s texel-area-
   * weighted `pow(stars, contrastGamma)` mean, inverted and memoized per
   * (map identity, gamma) since gamma can move between readback landings.
   */
  readonly youngStars: YoungStarsLanes;
  readonly fieldComps: GrowOnlyRecordBuffer;
  readonly hiiComps: GrowOnlyRecordBuffer;
  /**
   * `hiiComps`' own contiguous tiers — the central galaxy's shell/cluster,
   * DIG and young-stars spans (see `hiiRegions.ts`'s `buildHiiRegionsWithSegments`),
   * plus one trailing `'hii:extras'` span when background extras contribute
   * (their own three tiers interleave with the central galaxy's across the
   * buffer, so they can't be split further without a label per extra — see
   * `repackHiiComponents`). Recomputed on every repack; feeds
   * `createGalaxyEngine.ts`'s per-tier HII sub-passes as their own draw-call
   * bounds AND gates the scene composite's target list — see that file's own
   * doc for why every tier's pass now runs unconditionally, not just while
   * the timing HUD is live.
   */
  readonly hiiSegments: readonly HiiSegment[];
  readonly bubbleComps: GrowOnlyRecordBuffer;
  /** Null until the first SSPSF readback lands. */
  readonly ismMapData: GalaxyIsmMap | null;
  /**
   * The ISM-map "seeding" debug view's three scalar lanes — `weight` reads
   * `render.ismMapSeedingViewWeight` live (forced to 0 while `ismMapData` is
   * null or the mean is 0), `globalMean` is cached at the ismMap readback
   * landing, not recomputed per frame — same cadence as `dustHeaderLanes`.
   * `cap` reads `currentDust().cloud.dustPlacementCap` live, same source
   * `rebuildDustMixture` passes to `buildDustParticleCloud`, so a cap-slider
   * drag updates the view without waiting on a rebuild. The per-RING means
   * `globalMean` is itself the mean of are NOT part of this type — they ride
   * `ismMapGenerator.ringMeansBuffer`, written by `ringReduce`'s GPU pass at
   * rebuild time on the fluid path (see `rebuildIsmMap`), or by the CPU
   * `writeRingMeans` fallback at readback landing otherwise
   * (`recomputeIsmMapSeedingMeans`).
   */
  readonly ismMapSeedingView: IsmMapSeedingLanes;
  /**
   * Task 15's own consume-time renorm gate — `packFieldHeaderUniforms`'s
   * caller reads these to fill `FieldHeaderInput.armCloudRange`/
   * `spurCloudRange`. `null` means nothing reserved this rebuild, the SAME
   * meaning `armCloudReservation`/`spurCloudReservation` already carry
   * internally; the caller packs an empty (0,0) range in that case.
   */
  readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];
  /**
   * Debug-only pass-through to `readbacks.requestRingMeans` — see that
   * method's own doc. Exposed on the model, not just `readbacks` (which is
   * private to this closure), so `createGalaxyEngine.ts`'s handle can wrap
   * it in a `Promise` the same way every other public entry point does.
   */
  requestRingMeansReadback(
    onLand: (means: Float32Array) => void,
    onError?: (err: unknown) => void,
  ): void;
  /**
   * Debug-only: dispatches `placeDust.wesl` fresh into its own encoder and
   * maps the dust slot range straight back — the probe's own determinism/
   * survival-floor numeric exception (no production caller). `null` when
   * nothing is reserved this rebuild (`dustBudget` is null).
   * `forceGeneratorIsFluid`, when given, overrides the LIVE
   * `fieldTuning.ismMap.generator` for this ONE dispatch only — see
   * `dustDispatchInput`'s own doc for why the probe uses this instead of
   * actually flipping the tuning to exercise placeDust.wesl's mode-1
   * (smoothDisc) branch.
   */
  requestDustPlacementReadback(opts?: { readonly forceGeneratorIsFluid?: boolean }): Promise<{
    readonly count: number;
    readonly records: Float32Array;
    /** Task 9's survivor-sum input (`placeDust.wesl`'s massOut), read back from the SAME dispatch as `records` — see `IsmMapPlaceDust.dispatchAndReadbackDust`'s own doc. */
    readonly mass: Float32Array;
    /** Task 9's GPU-computed Larson renorm scale (`ringReduce.wesl`'s csSurvivorSum output), off a survivor-sum dispatch encoded against the SAME `mass`. */
    readonly renormScale: number;
  } | null>;
  /**
   * Debug-only: COPIES the dust tail's CURRENT slot range out of the LIVE
   * `fieldComps` buffer, without dispatching anything — the dust twin of
   * `requestArmSpurCloudBufferPeek` (own doc below); see `dustPeekBuffer`'s
   * own doc for why this is a distinct method from
   * `requestDustPlacementReadback` (that one's own fresh re-dispatch would
   * mask a stale `dustPlacementRebuild` the same way the spur-cloud one did
   * — Task 14's own fix-round dust twin). `null` when nothing is reserved.
   */
  requestDustBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  /**
   * Debug-only: dispatches `placeArmSpurCloud.wesl` fresh into its own
   * encoder and maps the reservation's slot range straight back — the
   * probe's own determinism/budget/liveness/flux-parity numeric exception
   * (no production caller). `flux` is the SAME `spurFlux` uniform the
   * dispatch used, returned alongside the records so a caller can check the
   * placed amplitudes actually encode that much flux (raw, pre-Task-15-
   * renorm — see `readback:placeArmSpurCloud`'s own probe step). `null`
   * when nothing is reserved this rebuild (`spurCloudReservation` is null —
   * central galaxy only today, see `centralFieldMixtureAndSpurReservation`'s
   * own doc).
   */
  requestArmSpurCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    /** Task 15's flux-weight-sum input (`placeArmSpurCloud.wesl`'s fluxWeightOut), read back from the SAME dispatch as `records`. */
    readonly fluxWeight: Float32Array;
    /** Task 15's GPU-computed reciprocal renorm scale (`ringReduce.wesl`'s csArmSpurFluxWeightSum output), off a flux-weight-sum dispatch encoded against the SAME `fluxWeight`. */
    readonly renormScale: number;
  } | null>;
  /**
   * Debug-only: COPIES the reservation's CURRENT slot range out of the LIVE
   * `fieldComps` buffer, without dispatching anything — see
   * `spurCloudPeekBuffer`'s own doc for why this is a distinct method from
   * `requestArmSpurCloudPlacementReadback` rather than a flag on it (that
   * one's own fresh re-dispatch would mask exactly the bug this one exists
   * to catch). `null` when nothing is reserved.
   */
  requestArmSpurCloudBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  /**
   * Debug-only: Task 13's own numeric-validation exception
   * (`placeArmCloud.wesl` has no non-GPU path to check its output against)
   * — dispatches fresh and maps the arm-cloud reservation's slot range
   * straight back, the arm-cloud twin of `requestArmSpurCloudPlacementReadback`.
   * `flux` is the SAME `cloudFlux` uniform the dispatch used. No production
   * caller. `null` when nothing is reserved this rebuild (central galaxy
   * only today — see `armCloudReservation`).
   */
  requestArmCloudPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly flux: number;
    readonly records: Float32Array;
    /** Task 15's flux-weight-sum input (`placeArmCloud.wesl`'s fluxWeightOut), read back from the SAME dispatch as `records`. */
    readonly fluxWeight: Float32Array;
    /** Task 15's GPU-computed reciprocal renorm scale (`ringReduce.wesl`'s csArmCloudFluxWeightSum output), off a flux-weight-sum dispatch encoded against the SAME `fluxWeight`. */
    readonly renormScale: number;
  } | null>;
  /**
   * Debug-only: the arm-cloud twin of `requestArmSpurCloudBufferPeek` — COPIES
   * the reservation's CURRENT slot range out of the LIVE `fieldComps` buffer,
   * without dispatching `placeArmCloud.wesl` first. `null` when nothing is
   * reserved.
   */
  requestArmCloudBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  /**
   * Debug-only: Task 8's own numeric-validation exception (`placeDigVeil.wesl`
   * has no non-GPU path to check its output against) — dispatches fresh and
   * maps the DIG veil reservation's slot range straight back, the DIG twin
   * of `requestArmCloudPlacementReadback`. No production caller. `null` when
   * nothing is reserved this rebuild (central galaxy only — see
   * `createGalaxyModel.ts`'s `digBudget`).
   */
  requestDigVeilPlacementReadback(): Promise<{
    readonly count: number;
    readonly offset: number;
    /** The SAME `amplitudeBase` uniform the dispatch used — see `requestArmCloudPlacementReadback`'s own `flux` field for the identical "independent expected side" precedent. */
    readonly amplitudeBase: number;
    readonly records: Float32Array;
  } | null>;
  /**
   * Debug-only: the DIG twin of `requestArmCloudBufferPeek` — COPIES the
   * reservation's CURRENT slot range out of the LIVE `hiiComps` buffer,
   * without dispatching `placeDigVeil.wesl` first. `null` when nothing is
   * reserved.
   */
  requestDigVeilBufferPeek(): Promise<{
    readonly count: number;
    readonly offset: number;
    readonly records: Float32Array;
  } | null>;
  /**
   * Central galaxy then every extra. Rebuilt per call rather than cached: every
   * buffer in them is reallocated by `setParams`/`setExtras`, so a captured
   * list is a destroyed buffer.
   */
  starInstances(): InstanceDraw[];
  dustInstances(): InstanceDraw[];
  destroy(): void;
};

export function createGalaxyModel(deps: GalaxyModelDeps): GalaxyModel {
  const {
    device,
    ismMapGenerator,
    orientation,
    ringReduce,
    dustCdfScan,
    placeDust,
    placeArmSpurCloud,
    placeArmCloud,
    digCdfScan,
    placeDigVeil,
    render,
  } = deps;

  // One debug view's live weight, through `DEBUG_VIEWS` rather than a named
  // settings key — what the rebuild gates' `wanted` predicates read.
  const viewIntensity = (kind: DebugViewKind): number => render[DEBUG_VIEWS[kind].intensityKey];

  // One `genUbo` for the CENTRAL galaxy only: `setParams` rewrites it in place
  // on every regeneration. Each extra gets its own per-extra UBO in
  // `setExtras` — packing N extras into one submit needs N distinct UBO
  // contents live at once, which one shared buffer cannot give.
  const genPipelines = createGenerationPipelines(device);
  const genUbo = device.createBuffer({
    label: 'galaxy:genUbo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // `comps` (io.wesl binding 1): every mixture's Gaussians, already
  // world-transformed — a read-only STORAGE array, not a uniform, specifically
  // so N background extras can push the total past a uniform's ~1000-component
  // cap. Starts at one galaxy's EMISSION ceiling; the trailing dust slice is a
  // particle cloud thousands of components deep, so the first `setParams` with
  // dust on regrows this regardless.
  const fieldComps = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:fieldComps',
    // COPY_SRC beyond STORAGE|COPY_DST's production need: Task 7's own
    // debug-only readback (`requestDustPlacementReadback`) copies the dust
    // slot range back to the CPU, same "debug readback rides the production
    // buffer's own COPY_SRC flag" precedent `ismMapGenerator.texture`/
    // `orientation.texture` already establish.
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    floatsPerRecord: FIELD_COMPONENT_FLOATS,
    initialCapacity: GALAXY_FIELD_MAX_COMPONENTS,
    onRegrow: deps.onFieldCompsRegrow,
  });
  // The HII tier's own storage buffer, byte-identical layout to `fieldComps`
  // but never concatenated into it — see `docs/research/milky-way/
  // hii-regions.md`: a shell sprite is small and bright by construction, so
  // sharing the smooth field's coarser target collapsed it into a bloom
  // firefly. Own buffer, own target, own divisor, own admission ceiling.
  const hiiComps = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:hiiComps',
    // COPY_SRC beyond STORAGE|COPY_DST's production need: Task 8's own
    // debug-only readback (`requestDigVeilPlacementReadback`/
    // `requestDigVeilBufferPeek`) copies the DIG slot range back to the
    // CPU, same precedent `fieldComps` already establishes for dust.
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    floatsPerRecord: FIELD_COMPONENT_FLOATS,
    // + DIG_MAX_COUNT: the DIG veil (`hiiRegions.ts`) rides this SAME
    // buffer as a bounded group pushed after `HII_MAX_COUNT`'s
    // admission, not a reservation carved out of it — so the common case
    // (dig.fraction on, its default) never regrows on first activation.
    // + YOUNG_CHAIN_MAX_COMPONENTS: the young-stars chain (`youngStarChain.ts`)
    // rides this same buffer too, pushed last.
    initialCapacity: HII_MAX_COUNT + DIG_MAX_COUNT + YOUNG_CHAIN_MAX_COMPONENTS,
    onRegrow: deps.onHiiCompsRegrow,
  });
  // The bubble-view overlay's own instance buffer (bubblePresent.wesl): a plain
  // VERTEX buffer, not a storage array — there is no per-fragment lookup by
  // index, just one instance-stepped attribute pair per placement, so it binds
  // into no 'auto'-layout bind group and needs no `onRegrow`. Sized at both
  // placement builders' admission ceilings, so the first activation never
  // regrows.
  const bubbleComps = createGrowOnlyRecordBuffer({
    device,
    label: 'galaxy:bubbleComps',
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    floatsPerRecord: BUBBLE_RECORD_FLOATS,
    initialCapacity: BUBBLE_BUDGET + HII_CAVITY_BUDGET,
  });

  // ---- instance buffers (recreated on setParams) ----
  let starBuf: GPUBuffer | null = null;
  let starCount = 0;
  let dustBuf: GPUBuffer | null = null;
  let dustCount = 0;
  let extras: Extra[] = []; // background galaxies, each GPU-generated in world space
  // The analytic field's mixture for the CENTRAL galaxy — rebuilt from the same
  // derived geometry generation just ran with, so it tracks every preset/knob
  // change the sprites do. Empty until the first `setParams`: a field of zero
  // components draws nothing, which is not the same as stale.
  let fieldMixture: readonly GalaxyFieldComponent[] = [];
  // Cached alongside the mixture so `setFieldTuning` can rebuild without a
  // regenerate. A tuning change arriving before any `setParams` just updates
  // `fieldTuning`; that first `setParams` reads it, and there is nothing yet
  // to rebuild.
  let fieldGeometry: GalaxyDescription | null = null;
  let fieldTuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING;
  // What the ISM map was last rebuilt against — see `setFieldTuning`. Two
  // keys: `ismMap` is the shared switch, `ismMapFluid` the generator's own
  // param block.
  let ismMapKey: GalaxyIsmMapParams = fieldTuning.ismMap;
  let ismMapFluidKey: GalaxyIsmMapFluidParams = fieldTuning.ismMapFluid;
  // The CENTRAL galaxy's HII tier, cached like `fieldMixture` but never
  // concatenated into it (see `hiiComps`).
  let hiiMixture: readonly GalaxyFieldComponent[] = [];
  // The central galaxy's own tier boundaries within `hiiMixture` — captured
  // alongside it at every rebuild site, never recomputed separately (see
  // `centralHiiMixtureAndSegments`). `repackHiiComponents` extends this with
  // the extras span to get the buffer-wide `hiiSegments` the model exposes.
  let hiiTierSegments: readonly HiiSegment[] = [];
  // `hiiComps`' buffer-wide segmentation — `hiiTierSegments` plus the
  // trailing extras span, kept in step with `hiiComps.write` since both are
  // written by `repackHiiComponents` alone.
  let hiiSegments: readonly HiiSegment[] = [];
  // The shell tier's own flux total and the recent-event population —
  // DIG's own two inputs (`computeDigVeilBudget`), captured alongside
  // `hiiMixture`/`hiiTierSegments` at every central rebuild site (Task 8's
  // own cut of the "capture alongside the mixture" pattern
  // `spurCloudReservation`/`armCloudReservation` already use) since both
  // are a byproduct of `buildHiiShellsAndYoungWithSegments`, not a value
  // this file recomputes on its own.
  let shellFluxSum = 0;
  let recentEventCount = 0;
  // The DIG veil's RESERVATION, CENTRAL galaxy only — same cut dust/spur/
  // arm-cloud reservations already take (extras get it in a follow-up).
  // `null` means no DIG reserved this rebuild (`computeDigVeilBudget`'s own
  // early-exit gates). `digOffset` is this reservation's absolute index
  // into `hiiComps` (set by `repackHiiComponents`, the one place that
  // decides where the DIG span lands between shells and young).
  let digBudget: DigVeilBudget | null = null;
  let digOffset = 0;
  // The analytic dust lane's RESERVATION, CENTRAL galaxy only — extras get
  // dust in a follow-up with zero rework, since the packed layout already
  // carries per-galaxy dustOffset/dustCount. `null` means no dust reserved
  // this rebuild (`computePlaceDustBudget`'s own early-exit gates). The CPU
  // only ever sees this budget/uniform shape now — `placeDust.wesl` decides
  // slot CONTENT on the GPU (`dustPlacementRebuild` below); there is no CPU
  // particle array to cache any more.
  let dustBudget: PlaceDustBudget | null = null;
  // The arm spur-cloud tier's RESERVATION, CENTRAL galaxy only — same cut
  // dust took above (extras get it in a follow-up). Captured alongside
  // `fieldMixture` at every central rebuild site
  // (`centralFieldMixtureAndSpurReservation`) since the reservation's
  // `offset` is this galaxy's own local index into THAT mixture, valid as
  // an absolute `fieldComps` index only because the central galaxy's own
  // mixture always sits first in `repackFieldComponents`' emission
  // concatenation. `null` means nothing reserved this rebuild (pill off, or
  // the ridge chain's own excess debit left this tier nothing to spend —
  // `GalaxyFieldMixtureResult`'s own doc).
  let spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'] = null;
  // The arm-cloud tier's RESERVATION, CENTRAL galaxy only — same cut dust
  // and the spur reservation above both took (extras get it in a follow-up).
  // Captured alongside `fieldMixture`/`spurCloudReservation` at every central
  // rebuild site (`centralFieldMixtureAndReservations`), same asymmetry, same
  // `null` meaning (pill off, or the ridge chain's own excess debit left
  // nothing to spend).
  let armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'] = null;
  // What `setParams` was last handed — only `seed` still comes off it; dust
  // and starFormation moved onto `fieldTuning` (scene-wide, not per-galaxy).
  let lastParams: GalaxyParams | null = null;
  const currentDust = (): GalaxyDustParams => fieldTuning.dust;
  const currentStarFormation = (): GalaxyStarFormationParams => fieldTuning.starFormation;
  const currentSeed = (): number => normalizeGenerationSeed(lastParams?.shared.seed);
  // Cached, not recomputed per frame: the field header reads all three every
  // frame, but they only change when `rebuildDustMixture` runs. Seeded at the
  // no-galaxy answer, which is what the first frames draw.
  let dustHeaderLanes = deriveDustHeaderLanes(null, DEFAULT_GALAXY_FIELD_TUNING.dust, false);
  // How the last `repackFieldComponents` concatenation sliced `fieldComps`.
  let fieldCounts: FieldSliceCounts = { emission: 0, primary: 0, dust: 0 };
  // The seeding debug view's own global mean, cached at the ismMap readback
  // landing (recomputeIsmMapSeedingMeans below) — never per frame, and never
  // reset back to 0 on a grid move: the `ismMapSeedingView` getter gates on
  // `readbacks.ismMapData` being non-null instead, so a stale value sitting
  // here between a drop and the next landing is simply never read.
  // `ismMapGlobalMeanDust` is `arrayMean` of the per-ring means array — the
  // array itself rides the GPU only (`ismMapGenerator.writeRingMeans`),
  // nothing on the CPU side needs it back, since `buildDustParticleCloud`
  // computes its own copy straight off `ismMap` each rebuild.
  let ismMapGlobalMeanDust = 0;
  // §5's `invMeanNorm` cache — keyed on (map identity, gamma) rather than
  // recomputed at readback landing like `ismMapGlobalMeanDust` above: gamma
  // is a live tuning knob (`fieldTuning.hii.youngStars.contrast`) that can
  // move on its own between readbacks, so the `youngStars` getter below
  // recomputes lazily instead, same `cachedCdf` idiom `hiiRegions.ts` uses.
  let youngStarsMeanCache: {
    readonly map: GalaxyIsmMap | null;
    readonly gamma: number;
    readonly invMeanNorm: number;
  } | null = null;
  // What the orientation chain was last dispatched at — see `noteRenderChanged`.
  let orientationSigmaDerivKey = render.orientationSigmaDerivTexels;
  let orientationSigmaIntegKey = render.orientationSigmaIntegTexels;

  // The SSPSF chain's two CPU-side copies and the single queue that fills
  // them — see `createIsmMapReadbacks`.
  const readbacks = createIsmMapReadbacks({ device, ismMapGenerator, orientation });
  const orientationDiagnostics = createOrientationDiagnostics();

  /**
   * The seeding debug view's placement density means — per-ring AND global,
   * off the SAME extractor (`ismMapRingMeans(map, texel => texel.dust)`)
   * `buildDustParticleCloud` normalises its own CDF term by — load-bearing:
   * computing this any other way would let the view drift from what
   * placement actually consumes. No ambient subtraction: the pedestal is
   * seeded `ambient * gasProfile(r)` and advected by the generator, so it is
   * itself structure the CDF places into, not a floor to clear first. The
   * per-ring array rides the GPU only: on the fluid path `rebuildIsmMap`
   * already dispatched `ringReduce` straight off `ismMapTex`, so this landing
   * no longer re-derives or re-uploads it — only the scalar (`arrayMean`) is
   * cheap enough off the already-necessary CPU readback to keep computing
   * here (Task 10 may move it onto the GPU too). Non-fluid generators never
   * get a `ringReduce` dispatch (`rebuildIsmMap`'s own gate), so this keeps
   * the CPU `writeRingMeans` fallback for THAT path only — otherwise a
   * disabled-generator's cleared map would leave `ringMeansBuffer` holding a
   * stale array from whenever the fluid generator last ran.
   */
  function recomputeIsmMapSeedingMeans(map: GalaxyIsmMap): void {
    const ringMeans = ismMapRingMeans(map, (texel) => texel.dust);
    ismMapGlobalMeanDust = arrayMean(ringMeans);
    if (fieldTuning.ismMap.generator !== 'fluid') {
      ismMapGenerator.writeRingMeans(ringMeans);
    }
  }

  /**
   * invMeanNormFor — §5's `1 / (area-weighted mean of pow(stars, gamma))`,
   * memoized against `youngStarsMeanCache` (its own doc above). No map yet,
   * or a map whose shaped mean is 0 (quiet disc, cleared tracer), returns 1:
   * the identity multiplier, not a divide-by-zero — hiiSplat/youngFragment.wesl's
   * fs (and extrasFragment.wesl's young branch) only ever reaches this lane
   * behind a component's own `starsWeight > 0` gate, so an inert 1 here
   * costs nothing on the frames it's never read.
   */
  function invMeanNormFor(map: GalaxyIsmMap | null, gamma: number): number {
    if (
      youngStarsMeanCache &&
      Object.is(youngStarsMeanCache.map, map) &&
      youngStarsMeanCache.gamma === gamma
    ) {
      return youngStarsMeanCache.invMeanNorm;
    }
    const shapedMean = map
      ? areaWeightedMeanIsmMapChannel(map, (texel) => Math.pow(Math.max(texel.stars, 0), gamma))
      : 0;
    const invMeanNorm = shapedMean > 0 ? 1 / shapedMean : 1;
    youngStarsMeanCache = { map, gamma, invMeanNorm };
    return invMeanNorm;
  }

  /**
   * rebuildHiiIfSeeded — the HII tier's own "map landed late" rebuild,
   * shared by `scheduleIsmMapReadback` and `scheduleOrientationReadback`:
   * originally the same "map landed after the synchronous build that asked
   * for it" determinism problem `rebuildDustMixture` solves for dust. Since
   * Task 8, neither `buildHiiShellsAndYoungWithSegments` (shells/young —
   * the fluid-event candidate window recomputes its OWN event list off
   * `(geometry, tuning, seed)`, never `readbacks.ismMapData`) nor
   * `rebuildDigVeilBudget` (DIG's budget math, or `placeDigVeil.wesl`'s own
   * GPU-resident CDF) read the CPU `ismMap` copy at all any more — this
   * function's own two call sites (below) now recompute BYTE-IDENTICAL
   * output to what `setParams`/`setFieldTuning` already produced, wasted
   * but harmless CPU work. Left AS A STANDING CALL rather than removed
   * (out of this task's minimal-restructure scope — see Task 8's report for
   * the explicit ruling); a future pass could drop both call sites entirely.
   * File-local — closes over `fieldGeometry`/`fieldTuning`/`hiiMixture`/
   * `hiiTierSegments`, none of which are pure inputs, so this isn't a
   * `utils/` candidate.
   */
  function rebuildHiiIfSeeded(): void {
    if (
      fieldGeometry &&
      (fieldTuning.hii.ismMapSeeding > 0 ||
        (fieldTuning.hii.dig?.fraction ?? 0) > 0 ||
        (fieldTuning.hii.youngStars?.brightness ?? 0) > 0)
    ) {
      ({ mixture: hiiMixture, segments: hiiTierSegments, shellFluxSum, recentEventCount } =
        centralHiiMixtureAndSegments(fieldGeometry, currentStarFormation()));
      rebuildDigVeilBudget();
      repackHiiComponents();
    }
  }

  /**
   * scheduleIsmMapReadback — what happens WHEN the one-per-generation copy of
   * `ismMapTex` lands. Called from `rebuildIsmMap`'s own two exits with the grid
   * it just wrote, so `GalaxyIsmMap.rMin/rMax` always matches the CONTENT being
   * copied.
   *
   * Dust placement no longer reads this landing at all — `placeDust.wesl`
   * runs entirely off GPU-resident buffers (`dustPlacementRebuild`,
   * invalidated directly from `rebuildIsmMap`, not from here). What remains
   * on this path is diagnostics (`recomputeIsmMapSeedingMeans`'s "seeding"
   * debug-view means) and the HII tier, which still builds CPU-side
   * (`rebuildHiiIfSeeded` — Task 8's own move).
   */
  function scheduleIsmMapReadback(grid: GalaxyIsmMapGridRadius): void {
    readbacks.requestIsmMap(grid, (map) => {
      recomputeIsmMapSeedingMeans(map);
      rebuildHiiIfSeeded();
    });
  }

  /**
   * The same, for the CPU copy of `orientationTex` — diagnostics-only now
   * (`reportOrientationDiagnostics`'s coherence stat); dust placement reads
   * `orientationTex` on the GPU directly (`dustPlacementRebuild`), not this
   * CPU copy. HII stays CPU-side, so its own re-run still belongs here.
   */
  function scheduleOrientationReadback(grid: GalaxyIsmMapGridRadius): void {
    readbacks.requestOrientation(grid, ({ data }) => {
      // Folded in once here, at the one point a fresh grid exists — not per
      // frame or per dust build.
      orientationDiagnostics.noteCoherence(data);
      reportOrientationDiagnostics();
      rebuildHiiIfSeeded();
    });
  }

  /**
   * Event-driven off two independent producers, not a per-frame poll: a
   * readback landing (coherence, `hasData`/`generation`) and a dust rebuild
   * (the delta pair).
   */
  function reportOrientationDiagnostics(): void {
    deps.onOrientationDiagnostics?.(
      orientationDiagnostics.report({
        hasData: readbacks.orientationData !== null,
        generation: readbacks.orientationGeneration,
      }),
    );
  }

  /**
   * The CPU copy of the orientation field — diagnostics-only now (the
   * coherence-stat report `scheduleOrientationReadback` feeds); dust
   * placement reads `orientationTex` on the GPU directly
   * (`dustPlacementRebuild`). Still gated on the generator being active:
   * a disabled generator has nothing coherent to report either.
   */
  const orientationDataRebuild = createKeyedRebuild({
    wanted: () => fieldTuning.ismMap.generator !== 'none',
    build: () => scheduleOrientationReadback(ismMapGridRadiusOrDefault(fieldGeometry)),
  });

  /**
   * The GPU structure-tensor chain over the CURRENT `ismMapTex`. Two independent
   * consumers — the debug overlay reads the texture on the GPU, the dust
   * placement the CPU copy above — either enough to justify the six dispatches.
   * Needs no readback to run FROM: ismMapTex is a GPU texture WebGPU
   * zero-initialises, so dispatching before `rebuildIsmMap` has ever populated it
   * is safe. Invalidated by `rebuildIsmMap` and by a sigma move.
   */
  const orientationTexRebuild = createKeyedRebuild({
    wanted: () => viewIntensity('orientation') > 0 || fieldTuning.ismMap.generator !== 'none',
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
      orientation.dispatch({
        grid: ismMapGridRadiusOrDefault(fieldGeometry),
        sigmaDerivTexels: render.orientationSigmaDerivTexels,
        sigmaIntegTexels: render.orientationSigmaIntegTexels,
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
   * `rebuildIsmMap` (a fluid step/regenerate), but the SCAN's cap input can
   * also move on its own via a bare dust-tuning drag (`rebuildDustMixture`,
   * no map regenerate involved) — missing either trigger leaves
   * `dustPlacementCap` (or a stepped map) stale in `prefixBuf` until some
   * unrelated later rebuild happens to re-scan it. No-op off the fluid
   * generator or with no geometry yet — same gate `recomputeIsmMapSeedingMeans`
   * and the readback landings' `!== 'none'` checks already use.
   */
  function dispatchDustCdfScan(): void {
    if (!fieldGeometry || fieldTuning.ismMap.generator !== 'fluid') return;
    const grid = ismMapGridRadiusOrDefault(fieldGeometry);
    const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDustCdfScanRebuild' });
    // `ringCap` reproduces dustParticleCloud.ts's density() ring-mean-
    // normalised, capped placement density (ismMapDustCdfScan.wesl's own
    // doc) — the knob `cloud.dustPlacementCap` controls, live again for GPU
    // placement.
    dustCdfScan.dispatchScan(enc, {
      ismMapTexture: ismMapGenerator.texture,
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      weights: {
        kind: 'channel',
        channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
        ringCap: currentDust().cloud.dustPlacementCap ?? 0,
      },
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
    });
    device.queue.submit([enc.finish()]);
    dustPlacementRebuild.invalidate();
  }

  /**
   * dispatchDigCdfScan — the DIG veil's own arm-biased counterpart to
   * `dispatchDustCdfScan`, own encoder/submit, own `digCdfScan`
   * buffer/instance (see `GalaxyModelDeps.digCdfScan`'s own doc for why a
   * SEPARATE instance from dust's — the two tiers' placement dispatches are
   * each deferred independently to `ensureFresh()`, so sharing one
   * `prefixBuffer` would make whichever dispatch runs second silently
   * clobber the first's input). Two independent triggers, same shape as
   * dust's: the map's own content (`rebuildIsmMap`) and DIG's own tuning
   * (`rebuildDigVeilBudget`, whenever `armBias`/`arms.widthScale` or
   * anything else `buildDigArmEnvelopeTable` reads moves without a map
   * regenerate). `armBias` is CLAMPED here, at the packing call site — the
   * parked concern from Task 6's own review (`buildDigVeil`'s CPU original
   * clamps `dig.armBias` to `[0, 1]` before ever building the envelope;
   * `evalWeight`'s `armBias > 1` branch has no clamp of its own, since the
   * scan shader trusts whatever `params.armBias` the caller packed).
   * No-op off the fluid generator or with no geometry yet — same gate
   * `dispatchDustCdfScan` uses.
   */
  function dispatchDigCdfScan(): void {
    if (!fieldGeometry || fieldTuning.ismMap.generator !== 'fluid') return;
    const grid = ismMapGridRadiusOrDefault(fieldGeometry);
    const armBias = Math.min(1, Math.max(0, fieldTuning.hii.dig?.armBias ?? 0));
    const armCount = fieldGeometry.arms.length;
    const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDigCdfScanRebuild' });
    digCdfScan.dispatchScan(enc, {
      ismMapTexture: ismMapGenerator.texture,
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      weights: {
        kind: 'armBiased',
        // DIG's own CDF weights the map's `activity` channel alone —
        // hiiRegions.ts's `buildIsmMapDustCdf(ismMap, (texel) => armBiasedDensity(texel.activity, ...))`.
        channelWeights: { gas: 0, stars: 0, activity: 1, dust: 0 },
        armBias,
        armCount,
        entries: buildDigArmEnvelopeTable(fieldGeometry, fieldTuning, {
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
   * rebuildDustMixture — recomputes the central galaxy's dust RESERVATION
   * (`computePlaceDustBudget`'s pure budget math off the CACHED geometry +
   * dust params), re-scans the CDF for the CURRENT `cloud.dustPlacementCap`
   * (`dispatchDustCdfScan` — the map itself may already be fresh from an
   * earlier `rebuildIsmMap`, but the cap value is this function's own to
   * apply). Gated on `fieldTuning.dust.enabled` the same way
   * `disc.enabled`/`arms.enabled` gate their shader loops (an off pill skips
   * the work entirely, not just zeroes tau).
   *
   * Does NOT invalidate `dustPlacementRebuild` itself any more —
   * `repackFieldComponents` owns that (its own doc explains why: a new
   * `dustBudget.count` has no effect on the GPU buffer until a repack
   * applies it, and every call site of THIS function is unconditionally
   * followed by one in the same synchronous invocation, so the pairing was
   * never optional). `dispatchDustCdfScan`'s own invalidate call still fires
   * as a side effect of the call below — harmless, pre-existing redundancy
   * this fix leaves alone (Task 14's own dust-twin fix scope is the
   * repack-without-invalidate gap, not a general redundant-invalidate sweep).
   *
   * This no longer PLACES anything — `placeDust.wesl` decides slot content
   * on the GPU, off whatever `ismMapTex`/`orientationTex`/the CDF prefix
   * buffer hold at `dustPlacementRebuild`'s own build time, not off any CPU
   * readback. `currentSeed()` still flows through so placement stays
   * reproducible from `setParams`'s params alone. No per-particle
   * `OrientationDeltaStats` any more (that was the CPU sampler's own
   * out-param) — the diagnostics report keeps firing off a zeroed delta, the
   * same honest "no CPU placement ran" default the old `else` branch used.
   */
  function rebuildDustMixture(): void {
    const dust = currentDust();
    dustHeaderLanes = deriveDustHeaderLanes(fieldGeometry, dust, fieldTuning.dust.enabled);
    dustBudget =
      fieldGeometry && fieldTuning.dust.enabled
        ? computePlaceDustBudget(fieldGeometry, dust)
        : null;
    dispatchDustCdfScan();
    orientationDiagnostics.noteDelta({ count: 0, sumAbsDeltaDeg: 0, maxAbsDeltaDeg: 0 });
    reportOrientationDiagnostics();
  }

  /**
   * rebuildDigVeilBudget — the DIG twin of `rebuildDustMixture`: recomputes
   * `digBudget` (pure function of geometry + `fieldTuning.hii.dig` +
   * `shellFluxSum`/`recentEventCount`, the two values the shell/young build
   * this rebuild's own callers ALWAYS run first — see `computeDigVeilBudget`'s
   * own doc), then re-scans the arm-biased CDF for the CURRENT `armBias`
   * (`dispatchDigCdfScan`). Does NOT invalidate `digPlacementRebuild` itself
   * — `repackHiiComponents` owns that (same "whoever zeroes the slots owns
   * the invalidation" rule `repackFieldComponents` documents for dust/spur/
   * arm-cloud), and every call site of this function is unconditionally
   * followed by one in the same synchronous invocation.
   */
  function rebuildDigVeilBudget(): void {
    digBudget = fieldGeometry
      ? computeDigVeilBudget(fieldGeometry, fieldTuning, shellFluxSum, recentEventCount)
      : null;
    dispatchDigCdfScan();
  }

  /**
   * rebuildBubblePlacements — the SF-event catalog's own bubble/cavity
   * placements, packed into `bubbleComps` for the debug overlay. A SECOND,
   * independent star-formation model: both builders read the SAME
   * `sfEventCatalog.ts` events the ISM-map generator never sees, which is what
   * makes the two comparable side by side. Central galaxy only, off the same
   * cached inputs `rebuildDustMixture` reads.
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
   * rebuildIsmMap — reruns the fluid ISM-map generator when
   * `fieldTuning.ismMap.generator` says to, from scratch, off the CACHED
   * geometry. NEVER per frame, per the params contract. `createIsmMapGenerator`
   * owns the dispatch (and the none/fluid gate, its ONLY branch point); what
   * stays here is the pair of things that follow it either way — and the
   * readback runs on BOTH of its exits, the disabled one too, so `ismMapData`
   * reflects the cleared texture it just wrote rather than an earlier
   * galaxy's map.
   *
   * Fluid-only, own encoder/submit: `ismMapGenerator.rebuild` above already
   * finished writing `ismMapTex` by the time it returns, so `ringReduce` runs
   * straight off that content — no need to wait for the async CPU readback
   * `scheduleIsmMapReadback` schedules below. Gated the same as the OTHER
   * `fieldTuning.ismMap.generator` branch points (`recomputeIsmMapSeedingMeans`,
   * the readback landings' `!== 'none'` checks): a disabled/no-geometry
   * rebuild has nothing worth reducing.
   */
  function rebuildIsmMap(): void {
    const grid = ismMapGenerator.rebuild({
      geometry: fieldGeometry,
      tuning: fieldTuning,
      seed: currentSeed(),
    });
    if (fieldTuning.ismMap.generator === 'fluid') {
      const enc = device.createCommandEncoder({ label: 'galaxy:ismMapRingReduceRebuild' });
      // ringMeansBuffer written HERE; dispatchDustCdfScan's own LATER submit
      // reads it — WebGPU's cross-SUBMIT ordering on one queue (not just
      // cross-pass within one encoder) is what makes that safe with no
      // barrier of our own (createIsmMapFluidRunner.ts's own doc covers the
      // cross-pass case this extends to cross-submit).
      ringReduce.dispatchRingMeans(enc);
      device.queue.submit([enc.finish()]);
      // Dust-weight prefix sum over the FRESH ismMapTex/ringMeansBuffer —
      // see dispatchDustCdfScan's own doc for why this ALSO has an
      // independent trigger (a bare cap drag) besides this one.
      dispatchDustCdfScan();
      // DIG's own arm-biased prefix sum, same "map itself changed" trigger
      // — see dispatchDigCdfScan's own doc for its independent armBias-drag
      // trigger besides this one.
      dispatchDigCdfScan();
    }
    scheduleIsmMapReadback(grid);
    orientationTexRebuild.invalidate();
    // The map itself just changed (or was cleared) — placement must
    // re-dispatch even when `dustBudget`'s OWN inputs (geometry/dust params)
    // didn't move, e.g. a bare ismMapFluid tuning drag.
    dustPlacementRebuild.invalidate();
    // DIG's own twin of the line above — same reasoning, covers the
    // 'none'-generator branch too (dispatchDigCdfScan's own invalidate only
    // fires on the fluid path above).
    digPlacementRebuild.invalidate();
  }

  /**
   * dustPlacementRebuild — encodes `placeDust.wesl` into its own encoder,
   * off the CURRENT `dustBudget` reservation. Consumed from
   * `GalaxyModel.ensureFresh()` AFTER `orientationTexRebuild`, never
   * synchronously from `rebuildDustMixture`/`rebuildIsmMap` themselves: this
   * dispatch needs `orientationTex` already fresh for whatever `ismMapTex`
   * this rebuild wrote, and `orientationTexRebuild`'s own lazy per-frame gate
   * is what guarantees that ordering (see `ensureFresh`'s sequencing below).
   * A one-frame-late fill is the honest cost of that guarantee — strictly
   * cheaper than the CPU path's async mapAsync round trip it replaces, and
   * still zero readbacks on the path from a rebuild to a drawn frame.
   */
  const dustPlacementRebuild = createKeyedRebuild({
    wanted: () => dustBudget !== null,
    build: () => {
      const budget = dustBudget;
      if (!fieldGeometry || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDust' });
      placeDust.dispatchPlaceDust(enc, dustDispatchInput(fieldGeometry, budget));
      // Task 9 — survivor-sum + Larson renorm, encoded into the SAME
      // encoder/submit right after the dispatch above: cross-pass ordering
      // within one submit is what lets this read `placeDust.massBuffer`
      // fresh with no readback of its own, tying the renorm's freshness to
      // THIS placement rebuild rather than a parallel invalidation flag.
      ringReduce.dispatchSurvivorSum(enc, {
        massBuffer: placeDust.massBuffer,
        count: budget.count,
        totalMass: budget.totalMass,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `dustPlacementRebuild` and the debug readback below — one input shape, one place that assembles it. */
  function dustDispatchInput(
    geometry: GalaxyDescription,
    budget: PlaceDustBudget,
    /**
     * Debug-only override for `requestDustPlacementReadback`'s own
     * numeric-validation exception: forcing this to `false` exercises
     * placeDust.wesl's mode-1 (smoothDisc) branch directly, WITHOUT
     * actually flipping `fieldTuning.ismMap.generator` through
     * `setFieldTuning`/`rebuildIsmMap` — the real 'none' transition hits an
     * unrelated, pre-existing bug in `ismMapGenerator.rebuild`'s own
     * disabled-generator clear path (its `writeTexture` calls target
     * textures missing `COPY_DST`, out of this task's scope to fix). The
     * production path (`dustPlacementRebuild`) never passes this — it
     * always reads the LIVE tuning.
     */
    forceGeneratorIsFluid?: boolean,
  ): PlaceDustDispatchInput {
    const grid = ismMapGridRadiusOrDefault(geometry);
    return {
      seed: currentSeed(),
      budget,
      dustOffset: fieldCounts.emission,
      generatorIsFluid: forceGeneratorIsFluid ?? fieldTuning.ismMap.generator === 'fluid',
      grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
      warp: {
        warpStrength: geometry.warpStrength,
        warpTwist: geometry.warpTwist,
        warpStartRadius: geometry.warpStartRadius,
        outerRadius: geometry.outerRadius,
      },
      prefixBuffer: dustCdfScan.prefixBuffer,
      ringMeansBuffer: ismMapGenerator.ringMeansBuffer,
      ismMapTexture: ismMapGenerator.texture,
      orientationTexture: orientation.texture,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * spurCloudPlacementRebuild — encodes `placeArmSpurCloud.wesl` into its
   * own encoder, off the CURRENT `spurCloudReservation`. Consumed from
   * `GalaxyModel.ensureFresh()`, the same deferred-dispatch shape
   * `dustPlacementRebuild` uses (Task 7's landed pattern; the orchestrator
   * ruling for this tier reuses it rather than giving `setFieldTuning` its
   * own encoder). Unlike dust, this tier reads no ISM-map/orientation
   * texture at all — `armRidge.wesl`'s ridge math is self-contained off the
   * per-spur record table — so there is no ordering dependency on
   * `orientationTexRebuild`; it is placed after it anyway, for one
   * discipline rather than two.
   */
  const spurCloudPlacementRebuild = createKeyedRebuild({
    wanted: () => spurCloudReservation !== null,
    build: () => {
      const reservation = spurCloudReservation;
      if (!fieldGeometry || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloud' });
      placeArmSpurCloud.dispatchPlaceArmSpurCloud(
        enc,
        spurCloudDispatchInput(fieldGeometry, reservation),
      );
      // Task 15 — flux-weight-sum + reciprocal renorm, encoded into the SAME
      // encoder/submit right after the dispatch above: cross-pass ordering
      // within one submit is what lets this read
      // `placeArmSpurCloud.fluxWeightBuffer` fresh with no readback of its
      // own — `dustPlacementRebuild`'s own Task 9 precedent.
      ringReduce.dispatchArmSpurFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmSpurCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `spurCloudPlacementRebuild` and the debug readback below — one input shape, one place that assembles it. */
  function spurCloudDispatchInput(
    geometry: GalaxyDescription,
    reservation: NonNullable<GalaxyFieldMixtureResult['spurCloudReservation']>,
  ): PlaceArmSpurCloudDispatchInput {
    return {
      seed: currentSeed(),
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      spurArms: reservation.spurArms,
      geometry,
      tuning: fieldTuning,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * armCloudPlacementRebuild — encodes `placeArmCloud.wesl` into its own
   * encoder, off the CURRENT `armCloudReservation`. Consumed from
   * `GalaxyModel.ensureFresh()`, the SAME deferred-dispatch shape
   * `dustPlacementRebuild`/`spurCloudPlacementRebuild` use (Task 13's own
   * cut of Task 7's landed pattern — the dispatcher ruling this brief itself
   * flagged as needing an explicit decision: this tier reuses the keyed-
   * rebuild shape rather than giving `setFieldTuning` its own encoder). Like
   * the spur tier, this reads no ISM-map/orientation texture meaningfully
   * (its own `orientationTexture` bind is a dead pass-through — see
   * `placeArmCloud.wesl`'s own doc) so there is no real ordering dependency
   * on `orientationTexRebuild` either; placed after it anyway, one
   * discipline rather than three.
   */
  const armCloudPlacementRebuild = createKeyedRebuild({
    wanted: () => armCloudReservation !== null,
    build: () => {
      const reservation = armCloudReservation;
      if (!fieldGeometry || !reservation) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmCloud' });
      placeArmCloud.dispatchPlaceArmCloud(enc, armCloudDispatchInput(fieldGeometry, reservation));
      // Task 15 — the same encoder/submit ordering `spurCloudPlacementRebuild` uses.
      ringReduce.dispatchArmCloudFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `armCloudPlacementRebuild` and the debug readback below — one input shape, one place that assembles it. */
  function armCloudDispatchInput(
    geometry: GalaxyDescription,
    reservation: NonNullable<GalaxyFieldMixtureResult['armCloudReservation']>,
  ): PlaceArmCloudDispatchInput {
    return {
      seed: currentSeed(),
      offset: reservation.offset,
      count: reservation.count,
      flux: reservation.flux,
      geometry,
      tuning: fieldTuning,
      orientationTexture: orientation.texture,
      fieldCompsBuffer: fieldComps.buffer,
    };
  }

  /**
   * digPlacementRebuild — encodes `placeDigVeil.wesl` into its own encoder,
   * off the CURRENT `digBudget` reservation. Consumed from
   * `GalaxyModel.ensureFresh()`, the SAME deferred-dispatch shape
   * `dustPlacementRebuild`/`spurCloudPlacementRebuild`/`armCloudPlacementRebuild`
   * use. Reads no `orientationTex` at all (this tier has no coherence-blend
   * mode — `scatterAxesForCoherence` rotates toward a random direction, not
   * a measured one), so there is no real ordering dependency on
   * `orientationTexRebuild` either; placed after it anyway, one discipline
   * rather than four.
   */
  const digPlacementRebuild = createKeyedRebuild({
    wanted: () => digBudget !== null,
    build: () => {
      const budget = digBudget;
      if (!fieldGeometry || !budget) return;
      const enc = device.createCommandEncoder({ label: 'galaxy:placeDigVeil' });
      placeDigVeil.dispatchPlaceDigVeil(enc, digDispatchInput(fieldGeometry, budget));
      device.queue.submit([enc.finish()]);
    },
  });

  /** Shared by `digPlacementRebuild` and the debug readback below — one input shape, one place that assembles it. */
  function digDispatchInput(
    geometry: GalaxyDescription,
    budget: DigVeilBudget,
  ): PlaceDigVeilDispatchInput {
    const grid = ismMapGridRadiusOrDefault(geometry);
    return {
      seed: currentSeed(),
      budget,
      reservationOffset: digOffset,
      generatorIsFluid: fieldTuning.ismMap.generator === 'fluid',
      cdfRings: ISM_MAP_RINGS,
      cdfAz: ISM_MAP_AZ,
      cdfRMin: grid.rMin,
      cdfRMax: grid.rMax,
      warp: {
        warpStrength: geometry.warpStrength,
        warpTwist: geometry.warpTwist,
        warpStartRadius: geometry.warpStartRadius,
        outerRadius: geometry.outerRadius,
      },
      prefixBuffer: digCdfScan.prefixBuffer,
      hiiCompsBuffer: hiiComps.buffer,
    };
  }

  /**
   * armCloudPeekBuffer — the arm-cloud twin of `spurCloudPeekBuffer` (own doc
   * below): `requestArmCloudPlacementReadback` always re-dispatches
   * `placeArmCloud.wesl` fresh, so it cannot see whether `ensureFresh()`'s own
   * `armCloudPlacementRebuild` kept the buffer filled — `requestArmCloudBufferPeek`
   * only ever COPIES the CURRENT `fieldComps` reservation range.
   */
  const armCloudPeekBuffer = device.createBuffer({
    label: 'galaxy:armCloudPeek',
    size: ARM_CLOUD_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  /**
   * digVeilPeekBuffer — the DIG twin of `armCloudPeekBuffer`: a plain
   * COPY_DST|MAP_READ target for `requestDigVeilBufferPeek`, reading
   * whatever is CURRENTLY sitting in `hiiComps` without dispatching
   * `placeDigVeil.wesl` first.
   */
  const digVeilPeekBuffer = device.createBuffer({
    label: 'galaxy:digVeilPeek',
    size: DIG_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  /**
   * spurCloudPeekBuffer — a plain COPY_DST|MAP_READ target for
   * `requestArmSpurCloudBufferPeek` (below): unlike
   * `requestArmSpurCloudPlacementReadback`, which re-DISPATCHES
   * `placeArmSpurCloud.wesl` fresh every call (masking whether the
   * PRODUCTION `ensureFresh()`/`spurCloudPlacementRebuild` path actually
   * kept the buffer filled), this one only ever COPIES whatever is
   * currently sitting in `fieldComps` — the probe's own regression check
   * for the vanish-on-dust-only-change bug needs exactly that: a read that
   * cannot itself paper over a stale keyed rebuild.
   */
  const spurCloudPeekBuffer = device.createBuffer({
    label: 'galaxy:spurCloudPeek',
    size: SPUR_CLOUD_MAX_COUNT * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  /**
   * dustPeekBuffer — the dust twin of `spurCloudPeekBuffer` (own doc above):
   * `requestDustPlacementReadback` always re-dispatches `placeDust.wesl`
   * fresh, so it cannot see whether `ensureFresh()`'s own
   * `dustPlacementRebuild` kept the buffer filled — `requestDustBufferPeek`
   * (below) only ever COPIES the CURRENT `fieldComps` dust range, the same
   * "cannot paper over a stale keyed rebuild" property the spur-cloud peek
   * needs, now needed here too for the dust twin of Task 14's vanish bug
   * (an arms/disc-only `setFieldTuning` patch repacks — and re-zeroes — the
   * dust tail without dust's own inputs having moved at all).
   */
  const dustPeekBuffer = device.createBuffer({
    label: 'galaxy:dustPeek',
    size: MAX_PARTICLE_COUNT * FIELD_COMPONENT_FLOATS * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  /**
   * repackFieldComponents — central galaxy's emission mixture, then every
   * extra's (already in world space), then the central galaxy's dust
   * RESERVATION last, into one `fieldComps` write. Runs whenever a mixture
   * changes, never per frame, unlike the header (see `packFieldUniforms`'s
   * header for the split).
   *
   * The dust range is written ZERO here (amplitude 0 draws nothing) —
   * `dustPlacementRebuild` fills it in a LATER, separate GPU pass (see that
   * rebuild's own doc for why it can't run synchronously in this call). This
   * write's only job is sizing/growing `fieldComps` so that pass has
   * somewhere to write into; `createGrowOnlyRecordBuffer`'s regrow (and the
   * `onFieldCompsRegrow` bind-group rebuild it triggers) still happens HERE,
   * synchronously, same as every other tier.
   *
   * Dust trails every emission component (never interleaved) so
   * `dustOffset == fieldCounts.emission` always holds without a separate
   * bookkeeping pass — see io.wesl's layout comment.
   *
   * `fieldMixture`'s own spur-cloud slice is ALSO reserved-but-zero here
   * (unlike dust's separately-appended tail, it rides inline inside
   * `emission` — see `GalaxyFieldMixtureResult`'s own doc): every call to
   * this function overwrites the WHOLE buffer from the CPU-held arrays, so
   * any caller that reaches this — including one whose own trigger has
   * nothing to do with the spur tier, e.g. a dust-only `setFieldTuning`
   * patch — clobbers whatever `spurCloudPlacementRebuild` last GPU-filled
   * back to zero. Invalidating it HERE, unconditionally, is what makes that
   * true regardless of which caller reached this function — the alternative
   * (each caller invalidating for itself) is exactly the gap Task 14's
   * review caught: `setFieldTuning`'s dust-only branch called this without
   * ever re-invalidating the spur rebuild, so the vanish stuck until an
   * unrelated arms/disc change happened to fire it again.
   *
   * `armCloudPlacementRebuild` joins both invalidations here too, for the
   * identical reason — Task 13's own cut of the same fix: its reservation
   * rides inline inside `emission` exactly like the spur tier's, so any
   * repack (including one whose own trigger has nothing to do with the arm
   * cloud) clobbers it back to zero the same way.
   *
   * `dustPlacementRebuild` gets the SAME unconditional invalidate here, for
   * the same reason and the same shape of bug: the mirror-image gap
   * (`setFieldTuning`'s `fieldMoved`-only branch repacks — and so re-zeroes
   * the dust tail — without touching dust at all) was flagged during Task
   * 14's review as pre-existing from Task 7, out of that task's scope; fixed
   * here as this task's own dust twin. `rebuildDustMixture`'s own
   * `dustPlacementRebuild.invalidate()` call is gone (below) — every one of
   * its 3 call sites is unconditionally followed by a `repackFieldComponents()`
   * call in the same synchronous invocation (a new `dustBudget.count` has no
   * effect until this function's own regrow/repack applies it, so the pairing
   * isn't incidental — a future caller of `rebuildDustMixture` alone, with no
   * repack, would already be shipping a wrongly-sized buffer, not just a
   * stale rebuild flag). `rebuildIsmMap`'s own invalidate call stays: a bare
   * `ismMapFluid` params drag (`fluidParamsMoved`, `fieldMoved`/`dustMoved`
   * both false) reaches `rebuildIsmMap` WITHOUT ever calling this function —
   * that path has no repack to own the invalidation, so it must keep its own.
   */
  function repackFieldComponents(): void {
    const emission: GalaxyFieldComponent[] = [...fieldMixture];
    for (const e of extras) emission.push(...e.fieldMixture);
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
   * attachments, which WebGPU has no way to do. Runs right after
   * `repackFieldComponents`; the readback landings rebuild dust alone and leave
   * this tier untouched.
   *
   * `hiiMixture` is shells+young ONLY since Task 8 (`buildHiiShellsAndYoungWithSegments`'s
   * own shape) — DIG's span is a RESERVATION written zero here, exactly
   * `repackFieldComponents`'s own dust-tail discipline, except EMBEDDED
   * between shells and young (matching the tier's original ordering) rather
   * than appended at the buffer's end: `digPlacementRebuild` fills it in a
   * LATER, separate GPU pass. `digPlacementRebuild.invalidate()` is
   * unconditional here for the same "whoever zeroes the slots owns the
   * invalidation" reason `repackFieldComponents` documents for dust/spur/
   * arm-cloud — every call to this function overwrites the WHOLE buffer
   * from CPU-held arrays plus the current `digBudget.count`, including calls
   * whose own trigger has nothing to do with DIG (e.g. `setExtras`).
   */
  function repackHiiComponents(): void {
    const shellsSegment = hiiTierSegments.find((s) => s.label === 'hii:shells');
    const shellsCount = shellsSegment?.count ?? 0;
    const digCount = digBudget?.count ?? 0;
    const packedShells = packFieldComponents(hiiMixture.slice(0, shellsCount));
    const packedYoung = packFieldComponents(hiiMixture.slice(shellsCount));
    const extrasComponents: GalaxyFieldComponent[] = [];
    for (const e of extras) extrasComponents.push(...e.hiiMixture);
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

  /**
   * Into world space when a `transform` is given (an extra); the central galaxy
   * passes none and stays in its own frame.
   */
  function place(
    components: readonly GalaxyFieldComponent[],
    transform?: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return transform
      ? components.map((c) => transformGalaxyFieldComponent(c, transform))
      : components;
  }

  /**
   * The two analytic tiers are built SEPARATELY rather than as one pair: they
   * answer to different tuning sections, so `setFieldTuning` rebuilds only the
   * one whose inputs moved.
   */
  function fieldMixtureOf(
    geometry: GalaxyDescription,
    transform?: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return place(buildGalaxyFieldMixture(geometry, fieldTuning).components, transform);
  }

  /**
   * Central-galaxy counterpart to `fieldMixtureOf` that also captures the
   * spur-cloud AND arm-cloud tiers' own reservations
   * (`centralHiiMixtureAndSegments`'s own precedent for a central-only
   * metadata capture) — extras never take either (only the central galaxy's
   * own mixture is ever GPU-filled today, see `spurCloudReservation`'s own
   * doc), so only the central call sites pay for it; extras still go through
   * the plain `fieldMixtureOf`. No `transform`: the central galaxy never
   * takes one.
   */
  function centralFieldMixtureAndReservations(geometry: GalaxyDescription): {
    readonly mixture: readonly GalaxyFieldComponent[];
    readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];
    readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  } {
    const result = buildGalaxyFieldMixture(geometry, fieldTuning);
    return {
      mixture: result.components,
      spurCloudReservation: result.spurCloudReservation,
      armCloudReservation: result.armCloudReservation,
    };
  }

  /**
   * `geometry.seed` is what `buildHiiRegions` was called with when it still
   * lived inside `buildGalaxyFieldMixture` — the field's own generated seed,
   * not a re-derivation. `ismMap` is null for every extra (same asymmetry as
   * `rebuildDustMixture`'s central-only readback below) — extras have no
   * ISM-map generator of their own.
   */
  function hiiMixtureOf(
    geometry: GalaxyDescription,
    starFormation: GalaxyStarFormationParams,
    ismMap: GalaxyIsmMap | null,
    transform?: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return place(
      buildHiiRegions(geometry, fieldTuning, starFormation, geometry.seed, ismMap),
      transform,
    );
  }

  /**
   * Central-galaxy counterpart to `hiiMixtureOf` that also captures the
   * tier's own segmentation (`hiiTierSegments`) plus the two values DIG's
   * own budget (`rebuildDigVeilBudget`, called by every one of THIS
   * function's own call sites right after) needs — `shellFluxSum`/
   * `recentEventCount` — extras never need any of this (see `hiiSegments`'
   * own declaration; extras have no DIG at all, `ismMap` is always null for
   * them), so only the central call sites pay for
   * `buildHiiShellsAndYoungWithSegments`' bookkeeping; extras still go
   * through the plain `hiiMixtureOf`/`buildHiiRegions`. No `transform`: the
   * central galaxy never takes one (every call site below omits it). No
   * `ismMap` parameter any more either — Task 8 moved DIG (this function's
   * only consumer of the CPU ismMap copy) GPU-side, and shells/young never
   * read it (see `rebuildHiiIfSeeded`'s own updated doc).
   */
  function centralHiiMixtureAndSegments(
    geometry: GalaxyDescription,
    starFormation: GalaxyStarFormationParams,
  ): {
    readonly mixture: readonly GalaxyFieldComponent[];
    readonly segments: readonly HiiSegment[];
    readonly shellFluxSum: number;
    readonly recentEventCount: number;
  } {
    const {
      components,
      segments,
      shellFluxSum: shellFluxSumResult,
      recentEventCount: recentEventCountResult,
    } = buildHiiShellsAndYoungWithSegments(geometry, fieldTuning, starFormation, geometry.seed);
    return {
      mixture: components,
      segments,
      shellFluxSum: shellFluxSumResult,
      recentEventCount: recentEventCountResult,
    };
  }

  /**
   * setParams — regenerate the central galaxy, then rebuild everything derived
   * from its geometry (both analytic tiers, the dust cloud, the SSPISM map).
   *
   * Exactly one `writeBuffer`, one encoder and one `submit`, for a buffer
   * nothing else touches concurrently — so queue submission order alone makes
   * this safe, and is also why the promise can resolve at `submit` with no
   * `mapAsync` wait. NOT the standing writeBuffer-vs-submit trap (the engine's
   * `makeCloudUniformBuffer`), which needs several such pairs racing over ONE
   * shared buffer read by draws recorded at different times.
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
    starBuf = generated.starBuf;
    starCount = generated.starCount;
    dustBuf = generated.dustBuf;
    dustCount = generated.dustCount;

    fieldGeometry = generated.geometry;
    // `ismMapGridRadius` depends on `fieldGeometry` alone, so most params —
    // dust `share`, cloud counts, colours — leave the grid untouched and the
    // cached readbacks usable; see `dropIfGridMoved`.
    readbacks.dropIfGridMoved(ismMapGridRadius(fieldGeometry));
    // `spurCloudPlacementRebuild`/`armCloudPlacementRebuild` are invalidated
    // inside `repackFieldComponents` below, not here — see that function's
    // own doc for why ownership lives there (whoever zeroes the slots owns
    // the invalidation).
    ({ mixture: fieldMixture, spurCloudReservation, armCloudReservation } =
      centralFieldMixtureAndReservations(fieldGeometry));
    ({ mixture: hiiMixture, segments: hiiTierSegments, shellFluxSum, recentEventCount } =
      centralHiiMixtureAndSegments(fieldGeometry, currentStarFormation()));
    rebuildDustMixture();
    rebuildDigVeilBudget();
    bubblePlacements.invalidate();
    repackFieldComponents();
    repackHiiComponents();
    // Always — a new galaxy means new geometry/arms, so the active ISM-map
    // generator and the ridge it forces/biases against are both stale otherwise.
    rebuildIsmMap();

    device.queue.submit([enc.finish()]);
    deps.onStats?.({ stars: generated.plannedStars, dust: generated.dustCount });
  }

  // Rebuilds from CACHED geometry rather than dispatching a regenerate: every
  // mixture is a pure function of geometry + tuning, so a slider drag is
  // CPU-only work the next frame's header pack picks up. No cached geometry yet
  // (before the first `setParams`) just leaves the merged `fieldTuning` for that
  // first `setParams` to read. Extras follow the central galaxy's flags — a
  // tuning change is a global look knob — then land back in world space.
  //
  // Reference identity per SECTION is the change signal: sections are replaced
  // wholesale (`GalaxyFieldTuning`'s contract) and the merge below is shallow,
  // so an untouched section arrives as the same object. What each one feeds:
  //
  //   disc          -> field mixture
  //   arms          -> field mixture, HII tier, bubble overlay
  //   hii           -> HII tier, bubble overlay
  //   starFormation -> HII tier, bubble overlay (same path as hii, above)
  //   dust          -> dust mixture + the header's dust lanes
  //   ismMap         -> the shared enabled/generator switch
  //   ismMapFluid     -> the fluid generator's own params
  function setFieldTuning(patch: Partial<GalaxyFieldTuning>): void {
    const prev = fieldTuning;
    fieldTuning = { ...fieldTuning, ...patch };

    // `arms.widthScale` reaches further than the arms: `armCrossSigma` sizes
    // the cross-arm scatter `buildSfEventCatalog` draws every SF event from, so
    // both consumers of that catalog move with it. `arms.cloud` shares this
    // flag by construction — the UI cannot replace the cloud without replacing
    // the `arms` object around it, and both feed the field mixture anyway.
    const armsMoved = prev.arms !== fieldTuning.arms;
    const fieldMoved = armsMoved || prev.disc !== fieldTuning.disc;
    // HII/the bubble overlay read `tuning.arms` ONLY through `armCrossSigma`'s
    // `widthScale` (via `buildSfEventCatalog`/`buildArmProximityEnvelope`) —
    // `contrast`/`excessScaleRatio`/`blobSharpness`/`cloud.*` feed ONLY the
    // ridge chain above (`fieldMoved`), so a whole-section identity check here
    // would rebuild HII's ~O(rings x az x arms) CDF sweep on an arm-cloud drag
    // that cannot change its output.
    const armsWidthMoved = prev.arms.widthScale !== fieldTuning.arms.widthScale;
    // `starFormation` feeds `hiiMixtureOf` alone (dust reads no starFormation
    // at all — `buildDustParticleCloud` takes no such argument), so it joins
    // `hiiMoved` rather than getting its own flag.
    const starFormationMoved = prev.starFormation !== fieldTuning.starFormation;
    const hiiMoved = armsWidthMoved || starFormationMoved || prev.hii !== fieldTuning.hii;
    const dustMoved = prev.dust !== fieldTuning.dust;

    if (fieldMoved || hiiMoved) {
      if (fieldGeometry) {
        if (fieldMoved) {
          // Invalidation lives in `repackFieldComponents` (below, whichever
          // branch of this function reaches it), not here.
          ({ mixture: fieldMixture, spurCloudReservation, armCloudReservation } =
            centralFieldMixtureAndReservations(fieldGeometry));
        }
        if (hiiMoved) {
          ({ mixture: hiiMixture, segments: hiiTierSegments, shellFluxSum, recentEventCount } =
            centralHiiMixtureAndSegments(fieldGeometry, currentStarFormation()));
          rebuildDigVeilBudget();
        }
      }
      extras = extras.map((e) => ({
        ...e,
        fieldMixture: fieldMoved ? fieldMixtureOf(e.fieldGeometry, e.transform) : e.fieldMixture,
        hiiMixture: hiiMoved
          ? hiiMixtureOf(e.fieldGeometry, currentStarFormation(), null, e.transform)
          : e.hiiMixture,
      }));
    }
    if (dustMoved) rebuildDustMixture();
    if (hiiMoved) bubblePlacements.invalidate();
    // The dust mixture is the trailing slice of the SAME buffer the emission
    // mixtures pack into, so either moving needs the one repack.
    if (fieldMoved || dustMoved) repackFieldComponents();
    if (hiiMoved) repackHiiComponents();
    // A generator rebuild is N compute dispatches, far more expensive than
    // the CPU mixture rebuilds above. `arms.widthScale` feeds the ridge its
    // forcing field bakes, but re-triggering on it would make an arm-width drag
    // pay this cost per frame — deliberately left stale until `ismMap` moves.
    const generatorMoved = ismMapKey !== fieldTuning.ismMap;
    const fluidParamsMoved = ismMapFluidKey !== fieldTuning.ismMapFluid;
    if (generatorMoved || fluidParamsMoved) {
      ismMapKey = fieldTuning.ismMap;
      ismMapFluidKey = fieldTuning.ismMapFluid;
      rebuildIsmMap(); // also re-dispatches the S4 blur, which now reads no dust tuning of its own
    }
    // No `else if (dustMoved)` branch any more: the S4 blur (ismMapDustBlur.wesl)
    // is a pure function of `texture` since `sweptMix` was deleted, so a
    // dust-only drag has nothing left for it to re-dispatch over.

    // `generator` gates `placeDust.wesl`'s own in-shader placement mode
    // (map-seeded vs `smoothDisc`) directly, from the `ismMap` section rather
    // than `dust` — so a generator flip is invisible to `dustMoved` and needs
    // its own `rebuildDustMixture` call, or the previous generator's
    // reservation/CDF-scan state keeps drawing as live until an unrelated
    // dust/geometry change rebuilds it. `rebuildDustMixture` reads no CPU
    // readback here — it recomputes `dustBudget` (pure function of geometry
    // + dust params, unaffected by `generator`) and calls
    // `dispatchDustCdfScan` (GPU-resident `ismMapTex`/`ringMeansBuf` only),
    // then invalidates `dustPlacementRebuild`; the actual placement dispatch
    // runs off whatever the NOW-CURRENT `generator` value produces, deferred
    // to the next `ensureFresh()` (see `dustPlacementRebuild`'s own doc).
    if (generatorMoved && !dustMoved) {
      rebuildDustMixture();
      repackFieldComponents();
    }
  }

  /** Torn down from two places — `setExtras` replacing the list, and `destroy`. */
  function destroyExtras(list: readonly Extra[]): void {
    for (const e of list) {
      e.starBuf.destroy();
      e.dustBuf?.destroy();
      e.ubo.destroy();
    }
  }

  // Replace the set of background galaxies. Each runs the same `generateGalaxy`
  // the central one does, differing only in the `spec` it passes: the transform
  // + size scale ride that spec into the UBO's extra lanes, so the compute
  // passes emit records already placed in the scene. ONE shared encoder,
  // submitted once.
  //
  // The whole body is synchronous up to that submit — no `await` splits the
  // destroy-old / build-new sequence, so replacing the extras is atomic per call
  // and needs no interleaving guard. The `async` signature is kept only because
  // `GalaxyEngineHandle` declares it; nothing is awaited.
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
      extras.push({
        starBuf: generated.starBuf,
        starCount: generated.starCount,
        dustBuf: generated.dustBuf,
        dustCount: generated.dustCount,
        ubo,
        fieldGeometry: generated.geometry,
        transform,
        fieldMixture: fieldMixtureOf(generated.geometry, transform),
        hiiMixture: hiiMixtureOf(generated.geometry, currentStarFormation(), null, transform),
      });
    }
    device.queue.submit([enc.finish()]);
    repackFieldComponents();
    repackHiiComponents();
  }

  return {
    setParams,
    setFieldTuning,
    setExtras,

    noteRenderChanged(): void {
      // The two sigmas are the only lanes of the render bag the orientation
      // chain reads, and the bridge re-pushes the WHOLE bag on any knob — so an
      // unconditional invalidate here would redispatch the six stages, and with
      // a generator active (the default) the readback and dust rebuild behind
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
    },

    ensureFresh(): { readonly bubblesLive: boolean } {
      // Texture before CPU copy — the first invalidates the second.
      const bubblesLive = bubblePlacements.ensureFresh();
      orientationTexRebuild.ensureFresh();
      orientationDataRebuild.ensureFresh();
      // AFTER orientationTexRebuild, never before: placeDust.wesl reads
      // orientationTex on the GPU directly, so it needs THIS rebuild's own
      // dispatch (if any) to have already run this same call — see
      // `dustPlacementRebuild`'s own doc.
      dustPlacementRebuild.ensureFresh();
      spurCloudPlacementRebuild.ensureFresh();
      armCloudPlacementRebuild.ensureFresh();
      digPlacementRebuild.ensureFresh();
      return { bubblesLive };
    },

    get starCount(): number {
      return starCount;
    },
    get fieldCounts(): FieldSliceCounts {
      return fieldCounts;
    },
    get dustHeaderLanes(): DustHeaderLanes {
      return dustHeaderLanes;
    },
    get hiiTexture(): HiiTextureLanes {
      // `?? 0`/`?? 1`: same stale-stored-tuning guard `hiiRegions.ts` applies
      // at its own per-group `texture` reads — a preset saved before this
      // knob (or, since board 19, `hii.shells` itself) existed carries no
      // `shells.textureScale`/`shells.textureContrast` keys.
      return {
        scale: fieldTuning.hii.shells.textureScale ?? 0,
        contrast: fieldTuning.hii.shells.textureContrast ?? 1,
      };
    },
    get youngStars(): YoungStarsLanes {
      // `?? 1`: same stale-stored-tuning guard as `hiiTexture` above — a
      // preset saved before `youngStars.contrast` existed carries no such
      // key, and 1 (gamma identity) is that field's own neutral default.
      const gamma = fieldTuning.hii.youngStars?.contrast ?? 1;
      return { contrastGamma: gamma, invMeanNorm: invMeanNormFor(readbacks.ismMapData, gamma) };
    },
    fieldComps,
    hiiComps,
    get hiiSegments(): readonly HiiSegment[] {
      return hiiSegments;
    },
    bubbleComps,
    get ismMapData(): GalaxyIsmMap | null {
      return readbacks.ismMapData;
    },
    get ismMapSeedingView(): IsmMapSeedingLanes {
      // Gated on the LIVE readback, not the cached mean: a grid move can null
      // `ismMapData` while the mean above still holds the previous grid's
      // number, and reading it here would flash a stale view for one frame
      // instead of going dark.
      if (!readbacks.ismMapData || ismMapGlobalMeanDust <= 0) {
        return { weight: 0, cap: 0, globalMean: 0 };
      }
      return {
        weight: render.ismMapSeedingViewWeight,
        globalMean: ismMapGlobalMeanDust,
        // `?? 0`: same preset-gap guard `buildDustParticleCloud` applies to
        // this exact field — a preset saved before `dustPlacementCap`
        // existed loads it `undefined`, and 0 ("uncapped") is that field's
        // own inert default, not a value this getter invents.
        cap: currentDust().cloud.dustPlacementCap ?? 0,
      };
    },

    get armCloudReservation(): GalaxyFieldMixtureResult['armCloudReservation'] {
      return armCloudReservation;
    },
    get spurCloudReservation(): GalaxyFieldMixtureResult['spurCloudReservation'] {
      return spurCloudReservation;
    },

    requestRingMeansReadback(onLand, onError): void {
      readbacks.requestRingMeans(onLand, onError);
    },

    async requestDustPlacementReadback(opts): Promise<{
      readonly count: number;
      readonly records: Float32Array;
      readonly mass: Float32Array;
      readonly renormScale: number;
    } | null> {
      const budget = dustBudget;
      if (!fieldGeometry || !budget) return null;
      const { records, mass } = await placeDust.dispatchAndReadbackDust(
        dustDispatchInput(fieldGeometry, budget, opts?.forceGeneratorIsFluid),
      );
      // Own encoder/submit, AFTER the placement dispatch above's submit has
      // already retired (dispatchAndReadbackDust awaited its own mapAsync) —
      // placeDust.massBuffer holds THIS dispatch's fresh values with nothing
      // else writing to it in between, so this reduction is over the same
      // records the caller just read back.
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

    async requestDustBufferPeek(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly records: Float32Array;
    } | null> {
      const budget = dustBudget;
      if (!budget || budget.count <= 0) return null;
      const offset = fieldCounts.emission;
      const byteSize = budget.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = offset * FIELD_COMPONENT_FLOATS * 4;
      const enc = device.createCommandEncoder({ label: 'galaxy:dustPeek' });
      enc.copyBufferToBuffer(fieldComps.buffer, byteOffset, dustPeekBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);
      await dustPeekBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        const records = new Float32Array(dustPeekBuffer.getMappedRange(0, byteSize).slice(0));
        return { count: budget.count, offset, records };
      } finally {
        dustPeekBuffer.unmap();
      }
    },

    async requestArmSpurCloudPlacementReadback(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly flux: number;
      readonly records: Float32Array;
      readonly fluxWeight: Float32Array;
      readonly renormScale: number;
    } | null> {
      const reservation = spurCloudReservation;
      if (!fieldGeometry || !reservation) return null;
      const { records, fluxWeight } = await placeArmSpurCloud.dispatchAndReadbackArmSpurCloud(
        spurCloudDispatchInput(fieldGeometry, reservation),
      );
      // Own encoder/submit, AFTER the placement dispatch above's submit has
      // already retired — `placeArmSpurCloud.fluxWeightBuffer` holds THIS
      // dispatch's fresh values with nothing else writing to it in between,
      // so this reduction is over the same records the caller just read back
      // (`requestDustPlacementReadback`'s own precedent).
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmSpurCloudDebugFluxWeightSum' });
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

    async requestArmSpurCloudBufferPeek(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly records: Float32Array;
    } | null> {
      const reservation = spurCloudReservation;
      if (!reservation || reservation.count <= 0) return null;
      const byteSize = reservation.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = reservation.offset * FIELD_COMPONENT_FLOATS * 4;
      const enc = device.createCommandEncoder({ label: 'galaxy:spurCloudPeek' });
      enc.copyBufferToBuffer(fieldComps.buffer, byteOffset, spurCloudPeekBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);
      await spurCloudPeekBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        const records = new Float32Array(
          spurCloudPeekBuffer.getMappedRange(0, byteSize).slice(0),
        );
        return { count: reservation.count, offset: reservation.offset, records };
      } finally {
        spurCloudPeekBuffer.unmap();
      }
    },

    async requestArmCloudPlacementReadback(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly flux: number;
      readonly records: Float32Array;
      readonly fluxWeight: Float32Array;
      readonly renormScale: number;
    } | null> {
      const reservation = armCloudReservation;
      if (!fieldGeometry || !reservation) return null;
      const { records, fluxWeight } = await placeArmCloud.dispatchAndReadbackArmCloud(
        armCloudDispatchInput(fieldGeometry, reservation),
      );
      // Own encoder/submit — `requestArmSpurCloudPlacementReadback`'s own precedent.
      const enc = device.createCommandEncoder({ label: 'galaxy:placeArmCloudDebugFluxWeightSum' });
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

    async requestArmCloudBufferPeek(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly records: Float32Array;
    } | null> {
      const reservation = armCloudReservation;
      if (!reservation || reservation.count <= 0) return null;
      const byteSize = reservation.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = reservation.offset * FIELD_COMPONENT_FLOATS * 4;
      const enc = device.createCommandEncoder({ label: 'galaxy:armCloudPeek' });
      enc.copyBufferToBuffer(fieldComps.buffer, byteOffset, armCloudPeekBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);
      await armCloudPeekBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        const records = new Float32Array(armCloudPeekBuffer.getMappedRange(0, byteSize).slice(0));
        return { count: reservation.count, offset: reservation.offset, records };
      } finally {
        armCloudPeekBuffer.unmap();
      }
    },

    async requestDigVeilPlacementReadback(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly amplitudeBase: number;
      readonly records: Float32Array;
    } | null> {
      const budget = digBudget;
      if (!fieldGeometry || !budget) return null;
      const records = await placeDigVeil.dispatchAndReadbackDigVeil(
        digDispatchInput(fieldGeometry, budget),
      );
      return { count: budget.count, offset: digOffset, amplitudeBase: budget.amplitudeBase, records };
    },

    async requestDigVeilBufferPeek(): Promise<{
      readonly count: number;
      readonly offset: number;
      readonly records: Float32Array;
    } | null> {
      const budget = digBudget;
      if (!budget || budget.count <= 0) return null;
      const byteSize = budget.count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = digOffset * FIELD_COMPONENT_FLOATS * 4;
      const enc = device.createCommandEncoder({ label: 'galaxy:digVeilPeek' });
      enc.copyBufferToBuffer(hiiComps.buffer, byteOffset, digVeilPeekBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);
      await digVeilPeekBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        const records = new Float32Array(digVeilPeekBuffer.getMappedRange(0, byteSize).slice(0));
        return { count: budget.count, offset: digOffset, records };
      } finally {
        digVeilPeekBuffer.unmap();
      }
    },

    starInstances(): InstanceDraw[] {
      const list: InstanceDraw[] = [];
      if (starBuf) list.push({ buf: starBuf, count: starCount });
      for (const e of extras) list.push({ buf: e.starBuf, count: e.starCount });
      return list;
    },

    dustInstances(): InstanceDraw[] {
      const list: InstanceDraw[] = [];
      if (dustBuf) list.push({ buf: dustBuf, count: dustCount });
      for (const e of extras) {
        if (e.dustBuf) list.push({ buf: e.dustBuf, count: e.dustCount });
      }
      return list;
    },

    destroy(): void {
      // `starBuf`/`dustBuf` are read HERE rather than captured at allocation:
      // `setParams` replaces both on every regeneration, so a captured
      // reference is one the reassignment already destroyed.
      destroyExtras(extras);
      starBuf?.destroy();
      dustBuf?.destroy();
      fieldComps.destroy();
      hiiComps.destroy();
      bubbleComps.destroy();
      spurCloudPeekBuffer.destroy();
      armCloudPeekBuffer.destroy();
      dustPeekBuffer.destroy();
      digVeilPeekBuffer.destroy();
      genUbo.destroy();
    },
  };
}
