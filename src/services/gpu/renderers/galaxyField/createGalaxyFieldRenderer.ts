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
import type { FieldSliceCounts } from '../../../../@types/galaxy/FieldSliceCounts';
import type { GalaxyFieldFrame } from '../../../../@types/galaxy/GalaxyFieldFrame';
import type { GalaxyFieldMixtureInput } from '../../../../@types/galaxy/GalaxyFieldMixtureInput';
import type { GalaxyFieldMixtureResult } from '../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldOverlays } from '../../../../@types/galaxy/GalaxyFieldOverlays';
import type { GalaxyFieldRenderer } from '../../../../@types/galaxy/GalaxyFieldRenderer';
import type { GalaxyFieldRendererDeps } from '../../../../@types/galaxy/GalaxyFieldRendererDeps';
import type { GalaxyFieldRenderTargets } from '../../../../@types/galaxy/GalaxyFieldRenderTargets';
import type { GalaxyFieldStageContext } from '../../../../@types/galaxy/GalaxyFieldStageContext';
import type { GalaxyFieldStageName } from '../../../../@types/galaxy/GalaxyFieldStageName';
import type { HiiSegment } from '../../../../@types/galaxy/HiiSegment';
import type { HiiTextureLanes } from '../../../../@types/galaxy/HiiTextureLanes';
import type { HiiTier } from '../../../../@types/galaxy/HiiTier';
import type { StageGraph } from '../../../../@types/gpu/StageGraph';
import type { Vec2 } from '../../../../@types/math/Vec2';
import {
  DEFAULT_GALAXY_FIELD_TUNING,
  GALAXY_FIELD_MAX_COMPONENTS,
} from '../../../engine/galaxyGenerator/v2/galaxyFieldMixture';
import { DIG_MAX_COUNT, HII_MAX_COUNT } from '../../../engine/galaxyGenerator/v2/hiiRegions';
import { MAX_PARTICLE_COUNT } from '../../../engine/galaxyGenerator/v2/dustParticleCloud';
import { YOUNG_CHAIN_MAX_COMPONENTS } from '../../../engine/galaxyGenerator/v2/youngStarChain';

import { HII_TIER_KINDS, mapHiiTiers } from '../../../../data/hiiTiers';

import { createStageGraph } from '../../lib/createStageGraph';

import { buildFieldHeaderInputs } from './field/buildFieldHeaderInputs';
import { createBubblePresentPipeline } from './field/createBubblePresentPipeline';
import { createFieldPipelines } from './field/createFieldPipelines';
import type { FieldBindGroups } from './field/createFieldPipelines';
import { encodeDustMapPass } from './field/encodeDustMapPass';
import { encodeDustPresentPass } from './field/encodeDustPresentPass';
import { encodeSplatPass } from './field/encodeSplatPass';
import { findHiiSegment } from './field/findHiiSegment';
import {
  FIELD_COMPONENT_FLOATS,
  FIELD_HEADER_BUFFER_SIZE,
  FIELD_HEADER_FLOATS,
  packFieldHeaderUniforms,
} from './field/packFieldUniforms';
import { bakeVolumeTexture } from './gpu/bakeVolumeTexture';
import type { BakeVolumeTextureSpec } from './gpu/bakeVolumeTexture';
import { createGrowOnlyRecordBuffer } from './gpu/createGrowOnlyRecordBuffer';
import { createIsmMapChain } from './ismMap/createIsmMapChain';
import { createGalaxyFieldModel } from './model/createGalaxyFieldModel';
import { createGalaxyFieldProbe } from './probe/createGalaxyFieldProbe';
import { GALAXY_FIELD_STAGES } from './stages/galaxyFieldStages';

import dustNoiseBakeWgsl from '../../shaders/milkyWay/field/dustNoiseBake.wesl?static';
import warpNoiseBakeWgsl from '../../shaders/milkyWay/field/warpNoiseBake.wesl?static';
import starGrainBakeWgsl from '../../shaders/milkyWay/field/starGrainBake.wesl?static';

/** Baked ONCE at construction — fixed octave bands, no camera/galaxy input, never re-baked per frame. Each `workgroupSize` matches its shader's own `@workgroup_size`. */
const BAKED_VOLUMES = {
  dustNoise: { code: dustNoiseBakeWgsl, size: 128, workgroupSize: 4 },
  // 64, not 128: low-frequency value noise (three octaves over an 8-cell base lattice) resolves fine at this size.
  warpNoise: { code: warpNoiseBakeWgsl, size: 64, workgroupSize: 4 },
  starGrain: { code: starGrainBakeWgsl, size: 128, workgroupSize: 4 },
} as const satisfies Record<string, Omit<BakeVolumeTextureSpec, 'label' | 'makeShader'>>;

const EMPTY_INPUT: GalaxyFieldMixtureInput = {
  geometry: null,
  fieldTuning: DEFAULT_GALAXY_FIELD_TUNING,
  seed: 0,
  extras: [],
  sigmaDerivTexels: 0,
  sigmaIntegTexels: 0,
  orientationViewWanted: false,
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
  const bake = (name: keyof typeof BAKED_VOLUMES) => {
    const { texture, sampler } = bakeVolumeTexture(device, {
      ...BAKED_VOLUMES[name],
      label: `galaxy:${name}`,
      makeShader,
    });
    return { texture: own(texture), sampler };
  };
  const baked = {
    dustNoise: bake('dustNoise'),
    warpNoise: bake('warpNoise'),
    starGrain: bake('starGrain'),
  };

  // dustAttenuation.wesl's own sampler for `dustMapTex` (io.wesl binding 6) —
  // a plain filtering sampler, no address-mode wrap needed since the UV it is
  // fed is always clamped to the [0,1] the field pass's own fragment coords
  // cover. `rgba16float` is filterable in WebGPU core.
  const dustMapSampler = device.createSampler({
    label: 'galaxy:dustMapSampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // The ISM-map generator and every stage hanging off it, as one owned bundle
  // — the stages and the probe reach it through their context, not from here.
  const chain = own(createIsmMapChain(device, { makeShader, hdrFormat, fieldUbo }));

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
    ismMapGenerator: chain.generator,
    dustNoiseTex: baked.dustNoise.texture,
    dustNoiseSampler: baked.dustNoise.sampler,
    warpNoiseTex: baked.warpNoise.texture,
    warpNoiseSampler: baked.warpNoise.sampler,
    starGrainTex: baked.starGrain.texture,
    starGrainSampler: baked.starGrain.sampler,
    dustMapSampler,
    dustRenormBuffer: chain.ringReduce.dustRenormBuffer,
    armRenormBuffer: chain.ringReduce.armCloudRenormBuffer,
    spurRenormBuffer: chain.ringReduce.spurCloudRenormBuffer,
  });

  const bubblePresent = createBubblePresentPipeline({ device, makeShader, hdrFormat, fieldUbo });

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
   * can tell "the `place:*` rows refilled the slots the last upload zeroed"
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
  let current: GalaxyFieldMixtureInput = EMPTY_INPUT;
  const model = createGalaxyFieldModel({ input: () => current });
  const { centralField, dustHeaderLanes, dustBudget, digBudget, fieldPack, hiiPack } = model;

  const graph: StageGraph<GalaxyFieldStageName, GalaxyFieldStageContext> =
    createStageGraph(GALAXY_FIELD_STAGES);

  // Rebuilt per run rather than held: `setMixture` REASSIGNS `current`, so a
  // context captured once would key every stage on the galaxy it was built for.
  const stageContext = (): GalaxyFieldStageContext => ({
    device,
    input: current,
    chain,
    fieldComps,
    hiiComps,
    model,
    hooks: {
      onIsmMapRebuilt: deps.onIsmMapRebuilt,
      onOrientationRebuilt: deps.onOrientationRebuilt,
    },
  });

  function setMixture(input: GalaxyFieldMixtureInput): void {
    current = input;
    graph.run('sync', stageContext());
  }

  function stepIsmMap(): { readonly done: boolean } {
    graph.run('step', stageContext());
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

    if (!frame.render.analyticField) return;
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
      pass.setPipeline(chain.generator.presentPipeline);
      pass.setBindGroup(0, chain.generator.presentBindGroup);
      pass.draw(3);
    }
    if (overlays.orientation) {
      pass.setPipeline(chain.orientation.presentPipeline);
      pass.setBindGroup(0, chain.orientation.presentBindGroup);
      pass.draw(3);
    }
    // Instanced rather than a covering triangle (one camera-facing quad per
    // placement) and independent of the other two: the SF-event catalog is a
    // second, unrelated star-formation model, not another lens on the same
    // generator.
    if (overlays.bubbles) {
      pass.setPipeline(bubblePresent.pipeline);
      pass.setBindGroup(0, bubblePresent.bindGroup);
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
    ismMapGenerator: chain.generator,
    ismMapOrientation: chain.orientation,

    probe: createGalaxyFieldProbe({
      ctx: stageContext,
      peekScratchBuffer,
      fieldSplatPipe: fieldPipelines.fieldSplatPipe,
      bindGroups: () => bindGroups,
    }),

    dispose(): void {
      for (let i = owned.length - 1; i >= 0; i--) {
        const resource = owned[i]!;
        if ('destroy' in resource) resource.destroy();
        else resource.dispose();
      }
    },
  };
}
