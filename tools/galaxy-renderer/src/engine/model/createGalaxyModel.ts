/**
 * createGalaxyModel — what a galaxy IS, as opposed to how a frame draws it: the
 * central galaxy's generated sprite buffers and its background extras, the two
 * analytic mixtures (emission + HII), the dust cloud, the SSPSF map, and the
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
import type { SfMapSeedingLanes } from '../../../@types/engine/SfMapSeedingLanes';

import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldComponent } from '../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxySfMap } from '../../../../../src/@types/galaxy/GalaxySfMap';
import type { GalaxySfMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxySfMapAutomatonParams';
import type { GalaxySfMapFluidParams } from '../../../../../src/@types/galaxy/GalaxySfMapFluidParams';
import type { GalaxySfMapParams } from '../../../../../src/@types/galaxy/GalaxySfMapParams';
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
  sfMapGridRadius,
  sfMapGridRadiusOrDefault,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import {
  ASSOCIATIONS_MAX_COUNT,
  buildHiiRegions,
  DIG_MAX_COUNT,
  HII_MAX_COUNT,
} from '../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';
import { meanSfMapChannel } from '../../../../../src/utils/galaxy/meanSfMapChannel';
import { normalizeGenerationSeed } from '../../../../../src/utils/galaxy/normalizeGenerationSeed';
import { sweptDustOvershoot } from '../../../../../src/utils/galaxy/sweptDustOvershoot';
import { transformGalaxyFieldComponent } from '../../../../../src/utils/galaxy/transformGalaxyFieldComponent';

import { DEBUG_VIEWS } from '../../data/debugViews';
import { createKeyedRebuild } from '../createKeyedRebuild';
import { deriveDustHeaderLanes } from '../field/deriveDustHeaderLanes';
import { createGrowOnlyRecordBuffer } from '../gpu/createGrowOnlyRecordBuffer';
import type { GrowOnlyRecordBuffer } from '../gpu/createGrowOnlyRecordBuffer';
import { generateGalaxy } from '../sprites/generateGalaxy';
import { createOrientationDiagnostics } from '../sfMap/createOrientationDiagnostics';
import type { SfMapGenerator } from '../sfMap/createSfMapGenerator';
import type { SfMapOrientation } from '../sfMap/createSfMapOrientation';
import { createSfMapReadbacks } from '../sfMap/createSfMapReadbacks';
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
  readonly sfMapGenerator: SfMapGenerator;
  readonly orientation: SfMapOrientation;
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
  readonly sfMapData: GalaxySfMap | null;
  /**
   * The SF-map "seeding" debug view's two lanes — `weight` reads
   * `render.sfMapSeedingViewWeight` live (forced to 0 while `sfMapData` is
   * null or the mean is 0), `meanOvershoot` is cached at the sfMap readback
   * landing, not recomputed per frame — same cadence as `dustHeaderLanes`.
   */
  readonly sfMapSeedingView: SfMapSeedingLanes;
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
  const { device, sfMapGenerator, orientation, render } = deps;

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
  // What the SF map was last rebuilt against — see `setFieldTuning`. Three
  // keys, not one: `sfMap` is the shared switch, but only the ACTIVE
  // generator's own param block needs to move the identity check — an
  // inactive generator's slider drag would otherwise pay a rebuild for a
  // change nothing on screen reflects.
  let sfMapKey: GalaxySfMapParams = fieldTuning.sfMap;
  let sfMapAutomatonKey: GalaxySfMapAutomatonParams = fieldTuning.sfMapAutomaton;
  let sfMapFluidKey: GalaxySfMapFluidParams = fieldTuning.sfMapFluid;
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
  // The seeding debug view's own mean, cached at the sfMap readback landing
  // (recomputeSfMapSeedingMeans below) — never per frame, and never reset
  // back to 0 on a grid move: the `sfMapSeedingView` getter gates on
  // `readbacks.sfMapData` being non-null instead, so a stale value sitting
  // here between a drop and the next landing is simply never read.
  let sfMapMeanOvershoot = 0;
  // What the orientation chain was last dispatched at — see `noteRenderChanged`.
  let orientationSigmaDerivKey = render.orientationSigmaDerivTexels;
  let orientationSigmaIntegKey = render.orientationSigmaIntegTexels;

  // The SSPSF chain's two CPU-side copies and the single queue that fills
  // them — see `createSfMapReadbacks`.
  const readbacks = createSfMapReadbacks({ device, sfMapGenerator, orientation });
  const orientationDiagnostics = createOrientationDiagnostics();

  /**
   * The seeding debug view's placement density mean, off the SAME function
   * (`sweptDustOvershoot`) `buildDustParticleCloud` normalises its own CDF
   * term by — load-bearing: computing this any other way would let the view
   * drift from what placement actually consumes.
   */
  function recomputeSfMapSeedingMeans(map: GalaxySfMap): void {
    sfMapMeanOvershoot = meanSfMapChannel(map, sweptDustOvershoot);
  }

  /**
   * scheduleSfMapReadback — what happens WHEN the one-per-generation copy of
   * `sfMapTex` lands. Called from `rebuildSfMap`'s own two exits with the grid
   * it just wrote, so `GalaxySfMap.rMin/rMax` always matches the CONTENT being
   * copied.
   *
   * DETERMINISM: the copy lands asynchronously, so the dust mixture built
   * synchronously inside `setParams`/`setFieldTuning` never sees the map from
   * the rebuild that triggered it. Rather than defer the dust build until a map
   * is ready (a blank tool on first load), this REBUILDS it a second time once
   * the map lands. Either choice reaches the same final state for a given
   * (params, tuning, seed); this one keeps the tool always showing something.
   */
  function scheduleSfMapReadback(grid: GalaxySfMapGridRadius): void {
    readbacks.requestSfMap(grid, (map) => {
      recomputeSfMapSeedingMeans(map);
      if (fieldTuning.sfMap.generator !== 'none') {
        rebuildDustMixture();
        repackFieldComponents();
      }
      // Same "map landed after the synchronous build that asked for it"
      // determinism problem `rebuildDustMixture` above solves, for the HII
      // tier's own map-seeded positions AND its DIG veil (also map-seeded).
      if (
        fieldGeometry &&
        (fieldTuning.hii.sfMapSeeding > 0 ||
          (fieldTuning.hii.dig?.fraction ?? 0) > 0 ||
          (fieldTuning.hii.associations?.brightness ?? 0) > 0)
      ) {
        hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.sfMapData);
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
   * `scheduleSfMapReadback`'s already took, not a second independent one.
   */
  function scheduleOrientationReadback(grid: GalaxySfMapGridRadius): void {
    readbacks.requestOrientation(grid, ({ data }) => {
      // Folded in once here, at the one point a fresh grid exists — not per
      // frame or per dust build.
      orientationDiagnostics.noteCoherence(data);
      if (fieldTuning.sfMap.generator !== 'none') {
        rebuildDustMixture(); // also reports — see its own doc
        repackFieldComponents();
      } else {
        reportOrientationDiagnostics();
      }
      if (
        fieldGeometry &&
        (fieldTuning.hii.sfMapSeeding > 0 ||
          (fieldTuning.hii.dig?.fraction ?? 0) > 0 ||
          (fieldTuning.hii.associations?.brightness ?? 0) > 0)
      ) {
        hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.sfMapData);
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
    wanted: () => fieldTuning.sfMap.generator !== 'none',
    build: () => scheduleOrientationReadback(sfMapGridRadiusOrDefault(fieldGeometry)),
  });

  /**
   * The GPU structure-tensor chain over the CURRENT `sfMapTex`. Two independent
   * consumers — the debug overlay reads the texture on the GPU, the dust
   * placement the CPU copy above — either enough to justify the six dispatches.
   * Needs no readback to run FROM: sfMapTex is a GPU texture WebGPU
   * zero-initialises, so dispatching before `rebuildSfMap` has ever populated it
   * is safe. Invalidated by `rebuildSfMap` and by a sigma move.
   */
  const orientationTexRebuild = createKeyedRebuild({
    wanted: () => viewIntensity('orientation') > 0 || fieldTuning.sfMap.generator !== 'none',
    build: () => {
      orientation.dispatch({
        grid: sfMapGridRadiusOrDefault(fieldGeometry),
        sigmaDerivTexels: render.orientationSigmaDerivTexels,
        sigmaIntegTexels: render.orientationSigmaIntegTexels,
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
   * rebuildSfMap — reruns whichever SF-map generator `fieldTuning.sfMap.generator`
   * names, from scratch, off the CACHED geometry. NEVER per frame, per the
   * params contract. `createSfMapGenerator` owns the dispatch (and the
   * automaton/fluid branch, its ONLY branch point); what stays here is the
   * pair of things that follow it either way — and the readback runs on BOTH
   * of its exits, the disabled one too, so `sfMapData` reflects the cleared
   * texture it just wrote rather than an earlier galaxy's map.
   */
  function rebuildSfMap(): void {
    const grid = sfMapGenerator.rebuild({
      geometry: fieldGeometry,
      tuning: fieldTuning,
      seed: currentSeed(),
    });
    scheduleSfMapReadback(grid);
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
   * not a re-derivation. `sfMap` is null for every extra (same asymmetry as
   * `rebuildDustMixture`'s central-only readback below) — extras have no
   * SF-map generator of their own, automaton or fluid.
   */
  function hiiMixtureOf(
    geometry: GalaxyDescription,
    starFormation: GalaxyStarFormationParams,
    sfMap: GalaxySfMap | null,
    transform?: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>,
  ): readonly GalaxyFieldComponent[] {
    return place(
      buildHiiRegions(geometry, fieldTuning, starFormation, geometry.seed, sfMap),
      transform,
    );
  }

  /**
   * setParams — regenerate the central galaxy, then rebuild everything derived
   * from its geometry (both analytic tiers, the dust cloud, the SSPSF map).
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
    // `sfMapGridRadius` depends on `fieldGeometry` alone, so most params —
    // dust `share`, cloud counts, colours — leave the grid untouched and the
    // cached readbacks usable; see `dropIfGridMoved`.
    readbacks.dropIfGridMoved(sfMapGridRadius(fieldGeometry));
    fieldMixture = fieldMixtureOf(fieldGeometry);
    hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.sfMapData);
    rebuildDustMixture();
    bubblePlacements.invalidate();
    repackFieldComponents();
    repackHiiComponents();
    // Always — a new galaxy means new geometry/arms, so the active SF-map
    // generator and the ridge it forces/biases against are both stale otherwise.
    rebuildSfMap();

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
  //   sfMap         -> the shared enabled/generator switch
  //   sfMapAutomaton -> the automaton, only while it is the active generator
  //   sfMapFluid     -> the fluid generator, only while it is the active one
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
          hiiMixture = hiiMixtureOf(fieldGeometry, currentStarFormation(), readbacks.sfMapData);
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
    // pay this cost per frame — deliberately left stale until `sfMap` moves.
    // Only the ACTIVE generator's own block gates the rebuild (see the key
    // declarations' own comment) — `sfMapGenerator.rebuild` always reads the
    // CURRENT full tuning regardless, so switching `generator` itself (which
    // moves `sfMap`) always picks up whatever the inactive block drifted to
    // meanwhile.
    const generatorMoved = sfMapKey !== fieldTuning.sfMap;
    const activeGeneratorParamsMoved =
      fieldTuning.sfMap.generator === 'fluid'
        ? sfMapFluidKey !== fieldTuning.sfMapFluid
        : sfMapAutomatonKey !== fieldTuning.sfMapAutomaton;
    if (generatorMoved || activeGeneratorParamsMoved) {
      sfMapKey = fieldTuning.sfMap;
      sfMapAutomatonKey = fieldTuning.sfMapAutomaton;
      sfMapFluidKey = fieldTuning.sfMapFluid;
      rebuildSfMap(); // also re-dispatches the S4 blur, which now reads no dust tuning of its own
    }
    // No `else if (dustMoved)` branch any more: the S4 blur (sfMapDustBlur.wesl)
    // is a pure function of `texture` since `sweptMix` was deleted, so a
    // dust-only drag has nothing left for it to re-dispatch over.

    // `generator` gates `buildDustParticleCloud`'s own placement mode (map-seeded
    // vs `smoothDisc`) directly — before the three-state dropdown, that switch
    // lived AS `dust.sfMapSeeding`, inside the `dust` section, so `dustMoved`
    // caught it for free. Now that it lives in `sfMap`, a generator flip needs
    // its own synchronous dust rebuild or the previous generator's map-seeded
    // placement (and its `OrientationDeltaStats` coupling readout) keeps
    // drawing/reporting as live until an unrelated dust/geometry change happens
    // to rebuild it. Uses whatever `readbacks.sfMapData`/`orientationData` are
    // cached right now — the same determinism tradeoff `scheduleSfMapReadback`
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
    get sfMapData(): GalaxySfMap | null {
      return readbacks.sfMapData;
    },
    get sfMapSeedingView(): SfMapSeedingLanes {
      // Gated on the LIVE readback, not the cached mean: a grid move can null
      // `sfMapData` while the mean above still holds the previous grid's
      // number, and reading it here would flash a stale view for one frame
      // instead of going dark.
      if (!readbacks.sfMapData || sfMapMeanOvershoot <= 0) {
        return { weight: 0, meanOvershoot: 0 };
      }
      return {
        weight: render.sfMapSeedingViewWeight,
        meanOvershoot: sfMapMeanOvershoot,
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
