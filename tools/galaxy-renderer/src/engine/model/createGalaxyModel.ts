/**
 * createGalaxyModel — what a galaxy IS, as opposed to how a frame draws it: the
 * central galaxy's generated sprite buffers and its background extras, the two
 * analytic mixtures (emission + HII), the dust cloud, the SSPISM map, and the
 * GPU record buffers all of that packs into.
 *
 * `setParams` / `setFieldTuning` / `setExtras` are the only writers; everything
 * else is derived from the geometry those three cache, which is what makes a
 * tuning slider a CPU rebuild rather than a regenerate. Nothing here encodes a
 * render pass or reads a camera: the engine owns the pipelines, the targets and
 * the per-frame headers, and binds the buffers this exposes.
 */

import type { DebugViewKind } from '../../../@types/data/DebugViewKind';
import type { DustHeaderLanes } from '../../../@types/engine/DustHeaderLanes';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import type { FieldSliceCounts } from '../../../@types/engine/FieldSliceCounts';
import type { HiiTextureLanes } from '../../../@types/engine/HiiTextureLanes';
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';
import type { LodSettings } from '../../../@types/engine/LodSettings';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { IsmMapSeedingLanes } from '../../../@types/engine/IsmMapSeedingLanes';

import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';
import type { GalaxyIsmMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';
import type { GalaxyIsmMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';
import type { GalaxyIsmMapParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapParams';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';

import { createGenerationPipelines } from '../../../../../src/services/engine/galaxyGenerator/v1/createGenerationPipelines';
import { GENERATION_UBO } from '../../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import type { OrientationDeltaStats } from '../../../../../src/services/engine/galaxyGenerator/v2/clusteredDiscPlacement';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import {
  buildDustBubblePlacements,
  buildHiiCavityPlacements,
  BUBBLE_BUDGET,
  HII_CAVITY_BUDGET,
} from '../../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';
import { buildDustParticleCloud } from '../../../../../src/services/engine/galaxyGenerator/v2/dustParticleCloud';
import {
  buildGalaxyFieldMixture,
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  ismMapGridRadius,
  ismMapGridRadiusOrDefault,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import {
  ASSOCIATIONS_MAX_COUNT,
  buildHiiRegions,
  DIG_MAX_COUNT,
  HII_MAX_COUNT,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { normalizeGenerationSeed } from '../../../../../src/utils/galaxy/normalizeGenerationSeed';
import { ismMapRingMeans } from '../../../../../src/utils/galaxy/ismMapRingMeans';
import { ISM_MAP_AMBIENT_DUST } from '../../../../../src/utils/galaxy/sweptDustOvershoot';
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
import { createIsmMapReadbacks } from '../ismMap/createIsmMapReadbacks';
import { BUBBLE_RECORD_FLOATS, packBubbleInstances } from '../field/packBubbleInstances';
import { FIELD_COMPONENT_FLOATS, packFieldComponents } from '../field/packFieldUniforms';

/**
 * A single generated extra galaxy. The UBO is retained rather than destroyed
 * right after the generation submit, so its lifetime brackets the vertex
 * buffers it produced; the whole triple is torn down together on the next
 * `setExtras`. `fieldGeometry`/`transform`/`starFormation` are cached for the
 * same reason the central galaxy's are — `setFieldTuning` rebuilds this
 * extra's world-space mixtures off them, with no regenerate.
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
  /** This extra's own HII tier — see `hiiComps` for why it rides a separate buffer from `fieldMixture`. */
  hiiMixture: readonly GalaxyFieldComponent[];
};

export type GalaxyModelDeps = {
  readonly device: GPUDevice;
  readonly ismMapGenerator: IsmMapGenerator;
  readonly orientation: IsmMapOrientation;
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
  readonly fieldComps: GrowOnlyRecordBuffer;
  readonly hiiComps: GrowOnlyRecordBuffer;
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
   * `ismMapGenerator.writeRingMeans`, a separate GPU buffer write at the same
   * readback-landing cadence (`recomputeIsmMapSeedingMeans`).
   */
  readonly ismMapSeedingView: IsmMapSeedingLanes;
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
  const { device, ismMapGenerator, orientation, render } = deps;

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
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    floatsPerRecord: FIELD_COMPONENT_FLOATS,
    // + DIG_MAX_COUNT: the DIG veil (`hiiRegions.ts`) rides this SAME
    // buffer as a bounded group pushed after `HII_MAX_COUNT`'s
    // admission, not a reservation carved out of it — so the common case
    // (dig.fraction on, its default) never regrows on first activation.
    initialCapacity: HII_MAX_COUNT + DIG_MAX_COUNT + ASSOCIATIONS_MAX_COUNT,
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
  // What the ISM map was last rebuilt against — see `setFieldTuning`. Three
  // keys, not one: `ismMap` is the shared switch, but only the ACTIVE
  // generator's own param block needs to move the identity check — an
  // inactive generator's slider drag would otherwise pay a rebuild for a
  // change nothing on screen reflects.
  let ismMapKey: GalaxyIsmMapParams = fieldTuning.ismMap;
  let ismMapAutomatonKey: GalaxyIsmMapAutomatonParams = fieldTuning.ismMapAutomaton;
  let ismMapFluidKey: GalaxyIsmMapFluidParams = fieldTuning.ismMapFluid;
  // The CENTRAL galaxy's HII tier, cached like `fieldMixture` but never
  // concatenated into it (see `hiiComps`).
  let hiiMixture: readonly GalaxyFieldComponent[] = [];
  // The analytic dust lane's mixture, CENTRAL galaxy only — extras get dust in
  // a follow-up with zero rework, since the packed layout already carries
  // per-galaxy dustOffset/dustCount.
  let dustMixture: readonly GalaxyFieldComponent[] = [];
  // What `setParams` was last handed. Every rebuild below reads it through the
  // accessors rather than caching a field of its own, so none can go stale
  // against this one.
  let lastParams: GalaxyParams | null = null;
  const currentDust = (): GalaxyDustParams => lastParams?.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
  const currentStarFormation = (): GalaxyStarFormationParams =>
    lastParams?.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;
  const currentSeed = (): number => normalizeGenerationSeed(lastParams?.seed);
  // Cached, not recomputed per frame: the field header reads all three every
  // frame, but they only change when `rebuildDustMixture` runs. Seeded at the
  // no-galaxy answer, which is what the first frames draw.
  let dustHeaderLanes = deriveDustHeaderLanes(null, DEFAULT_GALAXY_DUST_PARAMS, false);
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
   * seeded `ambient * gasProfile(r)` and advected by the automaton, so it is
   * itself structure the CDF places into, not a floor to clear first. The
   * per-ring array goes straight to the GPU (`writeRingMeans`) — the
   * shader's own radial-envelope divisor — while only its `arrayMean` is
   * cached here for the scalar uniform lane.
   */
  function recomputeIsmMapSeedingMeans(map: GalaxyIsmMap): void {
    const ringMeans = ismMapRingMeans(map, (texel) => texel.dust);
    ismMapGenerator.writeRingMeans(ringMeans);
    ismMapGlobalMeanDust = arrayMean(ringMeans);
  }

  /**
   * scheduleIsmMapReadback — what happens WHEN the one-per-generation copy of
   * `ismMapTex` lands. Called from `rebuildIsmMap`'s own two exits with the grid
   * it just wrote, so `GalaxyIsmMap.rMin/rMax` always matches the CONTENT being
   * copied.
   *
   * DETERMINISM: the copy lands asynchronously, so the dust mixture built
   * synchronously inside `setParams`/`setFieldTuning` never sees the map from
   * the rebuild that triggered it. Rather than defer the dust build until a map
   * is ready (a blank tool on first load), this REBUILDS it a second time once
   * the map lands. Either choice reaches the same final state for a given
   * (params, tuning, seed); this one keeps the tool always showing something.
   */
  function scheduleIsmMapReadback(grid: GalaxyIsmMapGridRadius): void {
    readbacks.requestIsmMap(grid, (map) => {
      recomputeIsmMapSeedingMeans(map);
      if (fieldTuning.ismMap.generator !== 'none') {
        rebuildDustMixture();
        repackFieldComponents();
      }
      // Same "map landed after the synchronous build that asked for it"
      // determinism problem `rebuildDustMixture` above solves, for the HII
      // tier's own map-seeded positions AND its DIG veil (also map-seeded).
      if (
        fieldGeometry &&
        (fieldTuning.hii.ismMapSeeding > 0 ||
          (fieldTuning.hii.dig?.fraction ?? 0) > 0 ||
          (fieldTuning.hii.associations?.brightness ?? 0) > 0)
      ) {
        hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.ismMapData);
        repackHiiComponents();
      }
    });
  }

  /**
   * The same, for the CPU copy of `orientationTex`. Dust-gated because the
   * dust placement is the only consumer of the CPU copy — the debug overlay
   * samples the texture on the GPU directly. Mirrors the HII re-run above:
   * `orientationDataRebuild` only runs while a generator is active (see its
   * own `wanted`), so this landing is the SAME opportunity
   * `scheduleIsmMapReadback`'s already took, not a second independent one.
   */
  function scheduleOrientationReadback(grid: GalaxyIsmMapGridRadius): void {
    readbacks.requestOrientation(grid, ({ data }) => {
      // Folded in once here, at the one point a fresh grid exists — not per
      // frame or per dust build.
      orientationDiagnostics.noteCoherence(data);
      if (fieldTuning.ismMap.generator !== 'none') {
        rebuildDustMixture(); // also reports — see its own doc
        repackFieldComponents();
      } else {
        reportOrientationDiagnostics();
      }
      if (
        fieldGeometry &&
        (fieldTuning.hii.ismMapSeeding > 0 ||
          (fieldTuning.hii.dig?.fraction ?? 0) > 0 ||
          (fieldTuning.hii.associations?.brightness ?? 0) > 0)
      ) {
        hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.ismMapData);
        repackHiiComponents();
      }
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
   * The CPU copy of the orientation field. Only the dust placement reads it,
   * so seeding alone decides whether a readback is worth scheduling.
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
      // gasFloor=1 (fluid params carry no such sentinel) is the automaton
      // case: ismMapOrientationField.wesl's IsmMapOrientationPedestal derives
      // its zero-gradient invariant from gasProfile(r) collapsing to a flat
      // 1.0 there — see that file's header. gasScaleLength must still be
      // finite even though it's then algebraically unused.
      const fluidPedestal =
        fieldTuning.ismMap.generator === 'fluid'
          ? fieldTuning.ismMapFluid
          : { gasFloor: 1, gasScaleLength: 1 };
      orientation.dispatch({
        grid: ismMapGridRadiusOrDefault(fieldGeometry),
        sigmaDerivTexels: render.orientationSigmaDerivTexels,
        sigmaIntegTexels: render.orientationSigmaIntegTexels,
        gasFloor: fluidPedestal.gasFloor,
        gasScaleLength: fluidPedestal.gasScaleLength,
        ambient: ISM_MAP_AMBIENT_DUST,
      });
      orientationDataRebuild.invalidate();
    },
  });

  /**
   * rebuildDustMixture — the central galaxy's dust mixture from the CACHED
   * geometry + dust params, gated on `fieldTuning.dust.enabled` the same way
   * `disc.enabled`/`arms.enabled` gate their shader loops (an off pill skips the
   * work entirely, not just zeroes tau). Called from the two repack triggers
   * `fieldMixture` uses, and again from each readback landing above — the only
   * way a map the placement seeds from can arrive after the build that asked
   * for it.
   *
   * `currentSeed()`, not a literal, so this galaxy's particle placement is
   * reproducible from `setParams`'s params alone. The `else` branch leaves the
   * `OrientationDeltaStats` out-param at its zeroed default, which is the honest
   * answer: no placement ran, so no delta was applied.
   */
  function rebuildDustMixture(): void {
    const dust = currentDust();
    dustHeaderLanes = deriveDustHeaderLanes(fieldGeometry, dust, fieldTuning.dust.enabled);
    const orientationDeltaStats: OrientationDeltaStats = {
      count: 0,
      sumAbsDeltaDeg: 0,
      maxAbsDeltaDeg: 0,
    };
    if (fieldGeometry && fieldTuning.dust.enabled) {
      const cloudMixture = buildDustParticleCloud(
        fieldGeometry,
        dust,
        fieldTuning,
        currentSeed(),
        readbacks.ismMapData,
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
   * placements, packed into `bubbleComps` for the debug overlay. A SECOND,
   * independent star-formation model: both builders read the SAME
   * `sfEventCatalog.ts` events the SSPSF automaton never sees, which is what
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
   * rebuildIsmMap — reruns whichever ISM-map generator `fieldTuning.ismMap.generator`
   * names, from scratch, off the CACHED geometry. NEVER per frame, per the
   * params contract. `createIsmMapGenerator` owns the dispatch (and the
   * automaton/fluid branch, its ONLY branch point); what stays here is the
   * pair of things that follow it either way — and the readback runs on BOTH
   * of its exits, the disabled one too, so `ismMapData` reflects the cleared
   * texture it just wrote rather than an earlier galaxy's map.
   */
  function rebuildIsmMap(): void {
    const grid = ismMapGenerator.rebuild({
      geometry: fieldGeometry,
      tuning: fieldTuning,
      seed: currentSeed(),
    });
    scheduleIsmMapReadback(grid);
    orientationTexRebuild.invalidate();
  }

  /**
   * repackFieldComponents — central galaxy's emission mixture, then every
   * extra's (already in world space), then the central galaxy's dust mixture
   * LAST, into one `fieldComps` write. Runs whenever a mixture changes, never
   * per frame, unlike the header (see `packFieldUniforms`'s header for the
   * split).
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
   * repackHiiComponents — `repackFieldComponents`'s counterpart for the HII
   * tier. A SEPARATE buffer rather than a further slice of `fieldComps`: see
   * `hiiComps` for why the tier cannot share the field's target, and a shared
   * BUFFER with a separate TARGET would still mean one draw painting into two
   * attachments, which WebGPU has no way to do. Runs right after
   * `repackFieldComponents`; the readback landings rebuild dust alone and leave
   * this tier untouched.
   */
  function repackHiiComponents(): void {
    const combined: GalaxyFieldComponent[] = [...hiiMixture];
    for (const e of extras) combined.push(...e.hiiMixture);
    hiiComps.write(packFieldComponents(combined));
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
    return place(buildGalaxyFieldMixture(geometry, fieldTuning), transform);
  }

  /**
   * `geometry.seed` is what `buildHiiRegions` was called with when it still
   * lived inside `buildGalaxyFieldMixture` — the field's own generated seed,
   * not a re-derivation. `ismMap` is null for every extra (same asymmetry as
   * `rebuildDustMixture`'s central-only readback below) — extras have no
   * ISM-map generator of their own, automaton or fluid.
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
    fieldMixture = fieldMixtureOf(fieldGeometry);
    hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.ismMapData);
    rebuildDustMixture();
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
  //   dust          -> dust mixture + the header's dust lanes
  //   ismMap         -> the shared enabled/generator switch
  //   ismMapAutomaton -> the automaton, only while it is the active generator
  //   ismMapFluid     -> the fluid generator, only while it is the active one
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
    const hiiMoved = armsWidthMoved || prev.hii !== fieldTuning.hii;
    const dustMoved = prev.dust !== fieldTuning.dust;

    if (fieldMoved || hiiMoved) {
      if (fieldGeometry) {
        if (fieldMoved) fieldMixture = fieldMixtureOf(fieldGeometry);
        if (hiiMoved) {
          hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.ismMapData);
        }
      }
      extras = extras.map((e) => ({
        ...e,
        fieldMixture: fieldMoved ? fieldMixtureOf(e.fieldGeometry, e.transform) : e.fieldMixture,
        hiiMixture: hiiMoved
          ? hiiMixtureOf(e.fieldGeometry, e.starFormation, null, e.transform)
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
    // Only the ACTIVE generator's own block gates the rebuild (see the key
    // declarations' own comment) — `ismMapGenerator.rebuild` always reads the
    // CURRENT full tuning regardless, so switching `generator` itself (which
    // moves `ismMap`) always picks up whatever the inactive block drifted to
    // meanwhile.
    const generatorMoved = ismMapKey !== fieldTuning.ismMap;
    const activeGeneratorParamsMoved =
      fieldTuning.ismMap.generator === 'fluid'
        ? ismMapFluidKey !== fieldTuning.ismMapFluid
        : ismMapAutomatonKey !== fieldTuning.ismMapAutomaton;
    if (generatorMoved || activeGeneratorParamsMoved) {
      ismMapKey = fieldTuning.ismMap;
      ismMapAutomatonKey = fieldTuning.ismMapAutomaton;
      ismMapFluidKey = fieldTuning.ismMapFluid;
      rebuildIsmMap(); // also re-dispatches the S4 blur, which now reads no dust tuning of its own
    }
    // No `else if (dustMoved)` branch any more: the S4 blur (ismMapDustBlur.wesl)
    // is a pure function of `texture` since `sweptMix` was deleted, so a
    // dust-only drag has nothing left for it to re-dispatch over.

    // `generator` gates `buildDustParticleCloud`'s own placement mode (map-seeded
    // vs `smoothDisc`) directly — before the three-state dropdown, that switch
    // lived AS `dust.ismMapSeeding`, inside the `dust` section, so `dustMoved`
    // caught it for free. Now that it lives in `ismMap`, a generator flip needs
    // its own synchronous dust rebuild or the previous generator's map-seeded
    // placement (and its `OrientationDeltaStats` coupling readout) keeps
    // drawing/reporting as live until an unrelated dust/geometry change happens
    // to rebuild it. Uses whatever `readbacks.ismMapData`/`orientationData` are
    // cached right now — the same determinism tradeoff `scheduleIsmMapReadback`
    // documents, corrected again once this rebuild's own readback lands.
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
      // This extra's OWN draw (`randomGalaxyParams` rolls `sfActivity` per
      // galaxy), never the shared default — the tier is what makes one
      // background galaxy read as more actively star-forming than the next.
      const starFormation = spec.params.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;

      extras.push({
        starBuf: generated.starBuf,
        starCount: generated.starCount,
        dustBuf: generated.dustBuf,
        dustCount: generated.dustCount,
        ubo,
        fieldGeometry: generated.geometry,
        transform,
        starFormation,
        fieldMixture: fieldMixtureOf(generated.geometry, transform),
        hiiMixture: hiiMixtureOf(generated.geometry, starFormation, null, transform),
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
      // knob existed carries an `hii` object with no `textureScale`/
      // `textureContrast` keys.
      return {
        scale: fieldTuning.hii.textureScale ?? 0,
        contrast: fieldTuning.hii.textureContrast ?? 1,
      };
    },
    fieldComps,
    hiiComps,
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
      genUbo.destroy();
    },
  };
}
