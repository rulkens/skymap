/**
 * createGalaxyModel — what a galaxy IS, as opposed to how a frame draws it:
 * the central galaxy's sprite buffers, the background extras, the bubble
 * overlay's placements, and the CPU readbacks of the ISM-map chain. The
 * analytic mixtures, the ISM map itself and every GPU record buffer they pack
 * into belong to `createGalaxyFieldRenderer`; this file feeds it
 * (`setMixture`) and reads its lanes back out.
 *
 * `setParams` / `setFieldTuning` / `setExtras` are the only writers; a tuning
 * slider is a CPU rebuild rather than a regenerate.
 */

import type { DebugViewKind } from '../../../../../src/@types/galaxy/DebugViewKind';
import type { DustHeaderLanes } from '../../../../../src/@types/galaxy/DustHeaderLanes';
import type { EngineStats } from '../../../@types/engine/EngineStats';
import type { FieldSliceCounts } from '../../../../../src/@types/galaxy/FieldSliceCounts';
import type { HiiSegment } from '../../../../../src/@types/galaxy/HiiSegment';
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';
import type { LodSettings } from '../../../@types/engine/LodSettings';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { IsmMapSeedingLanes } from '../../../../../src/@types/galaxy/IsmMapSeedingLanes';
import type { YoungStarsLanes } from '../../../../../src/@types/galaxy/YoungStarsLanes';
import type { GalaxyProbeApi } from '../../../@types/engine/GalaxyProbeApi';

import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldMixtureResult } from '../../../../../src/@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';

import { createGenerationPipelines } from '../../../../../src/services/engine/galaxyGenerator/v1/createGenerationPipelines';
import { GENERATION_UBO } from '../../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import {
  buildDustBubblePlacements,
  buildHiiCavityPlacements,
  BUBBLE_BUDGET,
  HII_CAVITY_BUDGET,
} from '../../../../../src/services/engine/galaxyGenerator/v2/dustBubblePlacements';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { ismMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { normalizeGenerationSeed } from '../../../../../src/utils/galaxy/normalizeGenerationSeed';
import { areaWeightedMeanIsmMapChannel } from '../../../../../src/utils/galaxy/areaWeightedMeanIsmMapChannel';
import { ismMapRingMeans } from '../../../../../src/utils/galaxy/ismMapRingMeans';
import { arrayMean } from '../../../../../src/utils/math/arrayMean';

import { DEBUG_VIEWS } from '../../data/debugViews';
import { createKeyedRebuild } from '../../../../../src/services/gpu/lib/createKeyedRebuild';
import { createGrowOnlyRecordBuffer } from '../../../../../src/services/gpu/renderers/galaxyField/gpu/createGrowOnlyRecordBuffer';
import type { GrowOnlyRecordBuffer } from '../../../../../src/services/gpu/renderers/galaxyField/gpu/createGrowOnlyRecordBuffer';
import { generateGalaxy } from '../sprites/generateGalaxy';
import { createOrientationDiagnostics } from '../ismMap/createOrientationDiagnostics';
import { createIsmMapReadbacks } from '../ismMap/createIsmMapReadbacks';
import {
  BUBBLE_RECORD_FLOATS,
  packBubbleInstances,
} from '../../../../../src/services/gpu/renderers/galaxyField/field/packBubbleInstances';
import type {
  GalaxyFieldExtra,
  GalaxyFieldMixtureInput,
  GalaxyFieldRenderer,
} from '../../../../../src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer';

/**
 * A single generated extra galaxy. The UBO is retained rather than destroyed
 * right after the generation submit, so its lifetime brackets the vertex
 * buffers it produced; the whole triple is torn down together on the next
 * `setExtras`. `fieldGeometry`/`transform` are what the field renderer
 * rebuilds this extra's world-space mixtures from, with no regenerate.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
  fieldGeometry: GalaxyDescription;
  transform: Pick<ExtraGalaxySpec, 'pos' | 'scale' | 'rotY' | 'tiltX'>;
};

export type GalaxyModelDeps = {
  readonly device: GPUDevice;
  /** Owns the analytic mixtures, the ISM-map chain and both comps buffers — see its own header. */
  readonly field: GalaxyFieldRenderer;
  /** The engine's live bag, merged in place by `setRender`. Read for two debug-view weights and the orientation chain's two sigmas. */
  readonly render: Readonly<RenderSettings & LodSettings>;
  readonly onStats?: (stats: EngineStats) => void;
  readonly onOrientationDiagnostics?: (diagnostics: OrientationDiagnostics) => void;
};

export type GalaxyModel = {
  setParams(params: GalaxyParams): Promise<void>;
  setFieldTuning(patch: Partial<GalaxyFieldTuning>): void;
  setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void>;
  /** Re-push the render-derived mixture inputs the engine just merged into its bag. */
  noteRenderChanged(): void;
  /**
   * Run the per-frame rebuild gates, in their own dependency order. The caller
   * must do this BEFORE the frame's encoder exists: a rebuild can replace
   * `bubbleComps`'s buffer, which a recorded draw would already hold, and the
   * orientation chain submits an encoder that must precede the frame's.
   */
  ensureFresh(): { readonly bubblesLive: boolean };

  /** `createGalaxyFieldRenderer`'s three host hooks — the CPU readback path it deliberately does not own. */
  noteIsmMapRebuilt(grid: GalaxyIsmMapGridRadius): void;
  noteOrientationRebuilt(grid: GalaxyIsmMapGridRadius): void;
  noteDustBudgetRebuilt(): void;

  readonly starCount: number;
  readonly fieldCounts: FieldSliceCounts;
  /** The header reads these every frame; they change only when dust does. */
  readonly dustHeaderLanes: DustHeaderLanes;
  /**
   * §5's shader-side young-stars stars-map read (`hiiSplat/youngFragment.wesl`'s
   * `g3.w` branch) — `contrastGamma` reads `fieldTuning.hii.youngStars.contrast`
   * live, `invMeanNorm` is `areaWeightedMeanIsmMapChannel`'s texel-area-
   * weighted `pow(stars, contrastGamma)` mean, inverted and memoized per
   * (map identity, gamma) since gamma can move between readback landings.
   */
  readonly youngStars: YoungStarsLanes;
  /** `hiiComps`' buffer-wide segmentation — the per-tier passes' own draw bounds AND the scene composite's gate. */
  readonly hiiSegments: readonly HiiSegment[];
  readonly bubbleComps: GrowOnlyRecordBuffer;
  /** Null until the first SSPSF readback lands. */
  readonly ismMapData: GalaxyIsmMap | null;
  /**
   * The ISM-map "seeding" debug view's three scalar lanes. `globalMean` is
   * cached at the readback landing, not recomputed per frame; `weight` and
   * `cap` are read live, so a cap-slider drag updates the view without waiting
   * on a rebuild.
   */
  readonly ismMapSeedingView: IsmMapSeedingLanes;
  readonly armCloudReservation: GalaxyFieldMixtureResult['armCloudReservation'];
  readonly spurCloudReservation: GalaxyFieldMixtureResult['spurCloudReservation'];
  /**
   * Debug-only (member docs live on `GalaxyProbeApi.d.ts`). The four placement
   * readbacks and `peekRecords` delegate to the field renderer, which owns
   * their reservations and buffers; `requestRingMeansReadback` stays
   * callback-style here because the engine wraps it in a `Promise` on the way
   * out.
   */
  readonly probe: Pick<
    GalaxyProbeApi,
    | 'peekRecords'
    | 'requestDustPlacementReadback'
    | 'requestArmSpurCloudPlacementReadback'
    | 'requestArmCloudPlacementReadback'
    | 'requestDigVeilPlacementReadback'
  > & {
    requestRingMeansReadback(
      onLand: (means: Float32Array) => void,
      onError?: (err: unknown) => void,
    ): void;
  };
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
  const { device, field, render } = deps;

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
  // What the field renderer is handed for those extras — a new array identity
  // per `setExtras`, which is how its own idempotence check sees the move.
  let fieldExtras: readonly GalaxyFieldExtra[] = [];
  // Cached alongside the sprite buffers so a tuning change rebuilds without a
  // regenerate. A tuning change arriving before any `setParams` just updates
  // `fieldTuning`; that first `setParams` reads it.
  let fieldGeometry: GalaxyDescription | null = null;
  let fieldTuning: GalaxyFieldTuning = DEFAULT_GALAXY_FIELD_TUNING;
  // What `setParams` was last handed — only `seed` still comes off it; dust
  // and starFormation moved onto `fieldTuning` (scene-wide, not per-galaxy).
  let lastParams: GalaxyParams | null = null;
  const currentSeed = (): number => normalizeGenerationSeed(lastParams?.shared.seed);
  // The seeding debug view's own global mean, cached at the ismMap readback
  // landing — never per frame, and never reset back to 0 on a grid move: the
  // `ismMapSeedingView` getter gates on `readbacks.ismMapData` being non-null
  // instead, so a stale value sitting here between a drop and the next landing
  // is simply never read.
  let ismMapGlobalMeanDust = 0;
  // §5's `invMeanNorm` cache — keyed on (map identity, gamma) rather than
  // recomputed at readback landing like `ismMapGlobalMeanDust` above: gamma is
  // a live tuning knob that can move on its own between readbacks, so the
  // `youngStars` getter recomputes lazily instead.
  let youngStarsMeanCache: {
    readonly map: GalaxyIsmMap | null;
    readonly gamma: number;
    readonly invMeanNorm: number;
  } | null = null;

  // The SSPSF chain's two CPU-side copies and the single queue that fills
  // them — see `createIsmMapReadbacks`.
  const readbacks = createIsmMapReadbacks({
    device,
    ismMapGenerator: field.ismMapGenerator,
    orientation: field.ismMapOrientation,
  });
  const orientationDiagnostics = createOrientationDiagnostics();

  /** Every input the field renderer's rebuild is a function of, from this file's cached state plus the live render bag. */
  function mixtureInput(): GalaxyFieldMixtureInput {
    return {
      geometry: fieldGeometry,
      fieldTuning,
      seed: currentSeed(),
      extras: fieldExtras,
      sigmaDerivTexels: render.orientationSigmaDerivTexels,
      sigmaIntegTexels: render.orientationSigmaIntegTexels,
      orientationViewWanted: viewIntensity('orientation') > 0,
    };
  }

  /**
   * The seeding debug view's density means, off the SAME extractor
   * (`ismMapRingMeans(map, texel => texel.dust)`) placement's own GPU CDF
   * shapes by, so the view can't drift from what the shader reads. No ambient
   * subtraction: the pedestal is seeded `ambient * gasProfile(r)` and advected
   * by the generator, so it is itself structure the CDF places into. The CPU
   * `writeRingMeans` fallback is for the NON-fluid path only — the fluid one
   * already dispatched `ringReduce` straight off `ismMapTex`, and without the
   * gate a disabled generator's cleared map would leave `ringMeansBuffer`
   * holding a stale array from whenever the fluid generator last ran.
   */
  function recomputeIsmMapSeedingMeans(map: GalaxyIsmMap): void {
    const ringMeans = ismMapRingMeans(map, (texel) => texel.dust);
    ismMapGlobalMeanDust = arrayMean(ringMeans);
    if (fieldTuning.ismMap.generator !== 'fluid') {
      field.ismMapGenerator.writeRingMeans(ringMeans);
    }
  }

  /**
   * invMeanNormFor — §5's `1 / (area-weighted mean of pow(stars, gamma))`,
   * memoized against `youngStarsMeanCache`. No map yet, or a map whose shaped
   * mean is 0 (quiet disc, cleared tracer), returns 1: the identity
   * multiplier, not a divide-by-zero — hiiSplat/youngFragment.wesl only ever
   * reaches this lane behind a component's own `starsWeight > 0` gate.
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
   * rebuildBubblePlacements — the SF-event catalog's own bubble/cavity
   * placements, packed into `bubbleComps` for the debug overlay. A SECOND,
   * independent star-formation model: both builders read the SAME
   * `sfEventCatalog.ts` events the ISM-map generator never sees, which is what
   * makes the two comparable side by side. Central galaxy only.
   *
   * Ungated: `bubblePlacements` owns whether this is worth running.
   */
  function rebuildBubblePlacements(): void {
    const relics = fieldGeometry
      ? buildDustBubblePlacements(
          fieldGeometry,
          fieldTuning.dust,
          fieldTuning.starFormation,
          fieldTuning,
          currentSeed(),
        )
      : [];
    const cavities = fieldGeometry
      ? buildHiiCavityPlacements(
          fieldGeometry,
          fieldTuning.dust,
          fieldTuning.starFormation,
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
   * setParams — regenerate the central galaxy, then hand the field renderer
   * the new geometry so it rebuilds everything derived from it.
   *
   * Exactly one `writeBuffer`, one encoder and one `submit`, for a buffer
   * nothing else touches concurrently — so queue submission order alone makes
   * this safe, and is also why the promise can resolve at `submit` with no
   * `mapAsync` wait.
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
    bubblePlacements.invalidate();
    field.setMixture(mixtureInput());

    device.queue.submit([enc.finish()]);
    deps.onStats?.({ stars: generated.plannedStars, dust: generated.dustCount });
  }

  // Rebuilds from CACHED geometry rather than dispatching a regenerate: every
  // mixture is a pure function of geometry + tuning, so a slider drag is
  // CPU-only work the next frame's header pack picks up.
  //
  // Only the bubble overlay's own gate is decided here — the field renderer
  // owns the per-section identity checks for everything IT rebuilds. The three
  // sections tested below are the ones `buildSfEventCatalog` reads, and `arms`
  // enters through `widthScale` alone (`armCrossSigma`), never the ridge/cloud
  // knobs, so a whole-section check would rebuild the overlay on an arm-cloud
  // drag that cannot change its output.
  function setFieldTuning(patch: Partial<GalaxyFieldTuning>): void {
    const prev = fieldTuning;
    fieldTuning = { ...fieldTuning, ...patch };
    if (
      prev.arms.widthScale !== fieldTuning.arms.widthScale ||
      prev.starFormation !== fieldTuning.starFormation ||
      prev.hii !== fieldTuning.hii
    ) {
      bubblePlacements.invalidate();
    }
    field.setMixture(mixtureInput());
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
  // submitted once, and the whole body is synchronous up to that submit — so
  // replacing the extras is atomic per call and needs no interleaving guard.
  // The `async` signature is kept only because `GalaxyEngineHandle` declares it.
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
      });
    }
    device.queue.submit([enc.finish()]);
    fieldExtras = extras.map((e) => ({ geometry: e.fieldGeometry, transform: e.transform }));
    field.setMixture(mixtureInput());
  }

  return {
    setParams,
    setFieldTuning,
    setExtras,

    noteRenderChanged(): void {
      field.setMixture(mixtureInput());
    },

    ensureFresh(): { readonly bubblesLive: boolean } {
      // Bubbles first, then the field renderer's own chain — the order the
      // single `ensureFresh` this replaced ran them in.
      const bubblesLive = bubblePlacements.ensureFresh();
      field.stepIsmMap();
      return { bubblesLive };
    },

    /**
     * What happens WHEN the one-per-generation copy of `ismMapTex` lands.
     * Fired from the field renderer's own two rebuild exits with the grid it
     * just wrote, so `GalaxyIsmMap.rMin/rMax` always matches the CONTENT being
     * copied. Diagnostics-only: neither dust nor the HII tier reads this
     * landing to place anything; what remains is the "seeding" view's means.
     */
    noteIsmMapRebuilt(grid: GalaxyIsmMapGridRadius): void {
      readbacks.requestIsmMap(grid, (map) => {
        recomputeIsmMapSeedingMeans(map);
      });
    },

    /**
     * The same, for the CPU copy of `orientationTex` — diagnostics-only (the
     * coherence stat); dust placement reads `orientationTex` on the GPU
     * directly.
     */
    noteOrientationRebuilt(grid: GalaxyIsmMapGridRadius): void {
      readbacks.requestOrientation(grid, ({ data }) => {
        // Folded in once here, at the one point a fresh grid exists — not per
        // frame or per dust build.
        orientationDiagnostics.noteCoherence(data);
        reportOrientationDiagnostics();
      });
    },

    /**
     * A dust rebuild ran. No per-particle `OrientationDeltaStats` exists any
     * more (that was the deleted CPU sampler's out-param), so the report fires
     * off a zeroed delta — the same honest "no CPU placement ran" default.
     */
    noteDustBudgetRebuilt(): void {
      orientationDiagnostics.noteDelta({ count: 0, sumAbsDeltaDeg: 0, maxAbsDeltaDeg: 0 });
      reportOrientationDiagnostics();
    },

    get starCount(): number {
      return starCount;
    },
    get fieldCounts(): FieldSliceCounts {
      return field.fieldCounts;
    },
    get dustHeaderLanes(): DustHeaderLanes {
      return field.dustHeaderLanes;
    },
    get youngStars(): YoungStarsLanes {
      // `?? 1`: the stale-stored-tuning guard a preset saved before
      // `youngStars.contrast` existed needs — 1 (gamma identity) is that
      // field's own neutral default.
      const gamma = fieldTuning.hii.youngStars?.contrast ?? 1;
      return { contrastGamma: gamma, invMeanNorm: invMeanNormFor(readbacks.ismMapData, gamma) };
    },
    get hiiSegments(): readonly HiiSegment[] {
      return field.hiiSegments;
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
        // `?? 0`: the same preset-gap guard the CDF rescan's own `ringCap`
        // read applies to this exact field — 0 ("uncapped") is that field's
        // own inert default, not a value this getter invents.
        cap: fieldTuning.dust.cloud.dustPlacementCap ?? 0,
      };
    },

    get armCloudReservation(): GalaxyFieldMixtureResult['armCloudReservation'] {
      return field.armCloudReservation;
    },
    get spurCloudReservation(): GalaxyFieldMixtureResult['spurCloudReservation'] {
      return field.spurCloudReservation;
    },

    probe: {
      requestRingMeansReadback(onLand, onError): void {
        readbacks.requestRingMeans(onLand, onError);
      },
      peekRecords: field.probe.peekRecords,
      requestDustPlacementReadback: field.probe.requestDustPlacementReadback,
      requestArmSpurCloudPlacementReadback: field.probe.requestArmSpurCloudPlacementReadback,
      requestArmCloudPlacementReadback: field.probe.requestArmCloudPlacementReadback,
      requestDigVeilPlacementReadback: field.probe.requestDigVeilPlacementReadback,
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
      bubbleComps.destroy();
      genUbo.destroy();
    },
  };
}
