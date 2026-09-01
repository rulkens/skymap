/**
 * createFieldPipelines — the analytic field's six render pipelines (field
 * splat, three HII splats, dust-column map, dust-map presentation) and every
 * `layout: 'auto'` bind group built against them, constructed before
 * `model`/`targets` exist via callbacks (`getDustMapTex`, `rebuild*`).
 * `layout: 'auto'` derives a bind-group layout from a pipeline's OWN
 * vertex+fragment pair, so a binding two pipelines' modules disagree on
 * (stage visibility) forces separate module pairs per pipeline — a mismatched
 * entry list is a validation error, not a no-op.
 */
import type { HiiTier } from '../../../../../@types/galaxy/HiiTier';
import type { IsmMapGenerator } from '../ismMap/createIsmMapGenerator';

import { mapHiiTiers } from '../../../../../data/hiiTiers';
import { ADDITIVE_BLEND } from '../../../lib/blendStates';

import fieldSplatVsWgsl from '../../../shaders/milkyWay/field/fieldSplat/vertex.wesl?static';
import fieldSplatFsWgsl from '../../../shaders/milkyWay/field/fieldSplat/fragment.wesl?static';
import hiiSplatVsWgsl from '../../../shaders/milkyWay/field/hiiSplat/vertex.wesl?static';
import hiiYoungFsWgsl from '../../../shaders/milkyWay/field/hiiSplat/youngFragment.wesl?static';
import hiiErosionFsWgsl from '../../../shaders/milkyWay/field/hiiSplat/erosionFragment.wesl?static';
import hiiExtrasFsWgsl from '../../../shaders/milkyWay/field/hiiSplat/extrasFragment.wesl?static';
import dustMapVsWgsl from '../../../shaders/milkyWay/field/dustMap/vertex.wesl?static';
import dustMapFsWgsl from '../../../shaders/milkyWay/field/dustMap/fragment.wesl?static';
import dustPresentVsWgsl from '../../../shaders/milkyWay/field/dustPresent/vertex.wesl?static';
import dustPresentFsWgsl from '../../../shaders/milkyWay/field/dustPresent/fragment.wesl?static';

export type FieldPipelineDeps = {
  readonly device: GPUDevice;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  readonly fieldUbo: GPUBuffer;
  readonly hiiUbo: GPUBuffer;
  readonly tierUbo: Readonly<Record<HiiTier, GPUBuffer>>;
  readonly ismMapGenerator: IsmMapGenerator;
  readonly dustNoiseTex: GPUTexture;
  readonly dustNoiseSampler: GPUSampler;
  readonly warpNoiseTex: GPUTexture;
  readonly warpNoiseSampler: GPUSampler;
  readonly starGrainTex: GPUTexture;
  readonly starGrainSampler: GPUSampler;
  readonly dustMapSampler: GPUSampler;
  /** dustMap/fragment.wesl binding 14 — Task 9's Larson renorm scale, GPU-written by `ringReduce.dispatchSurvivorSum`. Fixed-lifetime, never regrows (see `createIsmMapRingReduce.ts`'s own `dustRenormBuffer`), so it rides here like `fieldUbo`/`hiiUbo`, not the `rebuild*` regrow callbacks below. */
  readonly dustRenormBuffer: GPUBuffer;
  /** fieldSplat/fragment.wesl bindings 15/16 — Task 15's arm-cloud/spur-cloud reciprocal-weightSum scales, GPU-written by `ringReduce.dispatchArmCloudFluxWeightSum`/`dispatchArmSpurFluxWeightSum`. Same fixed-lifetime shape as `dustRenormBuffer` above. */
  readonly armRenormBuffer: GPUBuffer;
  readonly spurRenormBuffer: GPUBuffer;
  /**
   * `targets` doesn't exist yet at construction — its own dust-map-recreated
   * callback IS `rebuildDustMapDependents` below. Read live, per the "reassigned
   * whenever its storage buffer regrows" contract `encodeSplatPass` documents.
   */
  readonly getDustMapTex: () => GPUTexture;
};

export type FieldPipelines = {
  readonly fieldSplatPipe: GPURenderPipeline;
  readonly hiiYoungPipe: GPURenderPipeline;
  readonly hiiErosionPipe: GPURenderPipeline;
  readonly hiiExtrasPipe: GPURenderPipeline;
  readonly dustMapPipe: GPURenderPipeline;
  readonly dustPresentPipe: GPURenderPipeline;
  /** Which pipeline draws a given `HII_TIERS` row — see its own doc below. */
  hiiTierPipeline(kind: HiiTier): GPURenderPipeline;

  /** Read fresh at the call site every frame — see `encodeSplatPass`'s own contract. */
  readonly dustMapBG: GPUBindGroup;
  readonly fieldSplatBG: GPUBindGroup;
  readonly dustPresentBG: GPUBindGroup;
  readonly hiiBG: GPUBindGroup;
  tierBG(kind: HiiTier): GPUBindGroup;

  /** `fieldComps`' initial build (before `targets` exists) — see `BIND_GROUP_DEPS`. */
  rebuildDustMapBindGroup(fieldCompsBuffer: GPUBuffer): void;
  /** `fieldComps`' `onRegrow` — see `BIND_GROUP_DEPS`. */
  rebuildFieldCompsBindGroups(fieldCompsBuffer: GPUBuffer): void;
  /** `hiiComps`' `onRegrow` — see `BIND_GROUP_DEPS`. */
  rebuildTierBindGroups(hiiCompsBuffer: GPUBuffer): void;
  /** `onDustMapReallocated` — see `BIND_GROUP_DEPS`. */
  rebuildDustMapDependents(fieldCompsBuffer: GPUBuffer, hiiCompsBuffer: GPUBuffer): void;
};

type BindGroupRole = 'dustMapBG' | 'fieldSplatBG' | 'hiiBG' | 'tierBGMap' | 'dustPresentBG';
type BindGroupResourceKey = 'fieldComps' | 'hiiComps' | 'dustMap';

/**
 * Which identity-bearing resources a role is built against — the "which
 * bind group does regrowing X touch" answer as one table instead of four
 * hand-picked call sites. `dustMap` is `getDustMapTex()`'s live return,
 * `null` before the host allocates a target — see the walker's readiness
 * gate below.
 */
const BIND_GROUP_DEPS: Record<BindGroupRole, readonly BindGroupResourceKey[]> = {
  dustMapBG: ['fieldComps'],
  fieldSplatBG: ['fieldComps', 'dustMap'],
  hiiBG: ['hiiComps', 'dustMap'],
  tierBGMap: ['hiiComps', 'dustMap'],
  dustPresentBG: ['dustMap'],
};

export function createFieldPipelines(deps: FieldPipelineDeps): FieldPipelines {
  const {
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
    dustRenormBuffer,
    armRenormBuffer,
    spurRenormBuffer,
    getDustMapTex,
  } = deps;

  // ---- field/HII splat pipelines: one instanced quad per component ----
  // fieldSplatPipe's own binding set — {0 u, 1 comps, 2 dustMapTex, 6
  // dustMapSmp} — has no HII texture machinery at all, since fieldSplat's own
  // fragment never imports it. See the module header for what that buys.
  const fieldSplatVsMod = makeShader(fieldSplatVsWgsl, 'galaxy:fieldSplat.vertex');
  const fieldSplatFsMod = makeShader(fieldSplatFsWgsl, 'galaxy:fieldSplat.fragment');
  const fieldSplatPipe = device.createRenderPipeline({
    label: 'galaxy:fieldSplatPipe',
    layout: 'auto',
    vertex: { module: fieldSplatVsMod, entryPoint: 'vs' },
    fragment: {
      module: fieldSplatFsMod,
      entryPoint: 'fs',
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // One vertex stage shared by every HII draw (young/shells/dig/extras).
  const hiiSplatVsMod = makeShader(hiiSplatVsWgsl, 'galaxy:hiiSplat.vertex');
  const hiiYoungFsMod = makeShader(hiiYoungFsWgsl, 'galaxy:hiiSplat.youngFragment');
  const hiiErosionFsMod = makeShader(hiiErosionFsWgsl, 'galaxy:hiiSplat.erosionFragment');
  const hiiExtrasFsMod = makeShader(hiiExtrasFsWgsl, 'galaxy:hiiSplat.extrasFragment');
  const hiiPipeDescriptor = (
    fsMod: GPUShaderModule,
    label: string,
  ): GPURenderPipelineDescriptor => ({
    label,
    layout: 'auto',
    vertex: { module: hiiSplatVsMod, entryPoint: 'vs' },
    fragment: {
      module: fsMod,
      entryPoint: 'fs',
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // HII_TIERS' 'young' tier — youngFragment.wesl keeps the starGrainTerm
  // branch only, {0,1,2,3,6,7,8,10,11,12,13}: no 4/5 (dustNoiseTex/Smp) —
  // starGrain.wesl's own warp tap rides warpNoiseTex (12/13), not dustNoiseTex.
  const hiiYoungPipe = device.createRenderPipeline(
    hiiPipeDescriptor(hiiYoungFsMod, 'galaxy:hiiYoungPipe'),
  );
  // HII_TIERS' 'shells' AND 'dig' both route here (hiiTierPipeline below) —
  // erosionFragment.wesl serves both with its ridged-noise-only term,
  // {0,1,2,4,5,6}: no star-grain, warp-noise or ISM-cartesian bindings.
  const hiiErosionPipe = device.createRenderPipeline(
    hiiPipeDescriptor(hiiErosionFsMod, 'galaxy:hiiErosionPipe'),
  );
  // The `hii:extras` pass — background extras' concatenated shells/DIG/young
  // mixture, the full {0,1,2,3,4,5,6,7,8,10,11,12,13}: imports BOTH
  // hiiNoiseTerm (dustNoiseTex/Smp) and starGrainTerm (star-grain + warp-noise
  // + ISM-cartesian).
  const hiiExtrasPipe = device.createRenderPipeline(
    hiiPipeDescriptor(hiiExtrasFsMod, 'galaxy:hiiExtrasPipe'),
  );

  // ---- dust-column map pipeline (screen-space dust splat) ----
  // `milkyWay/field/dustMap/`: one instanced quad per PRIMARY dust component
  // (dustMap/vertex.wesl's own silhouette math via `lib/splatSilhouette`),
  // additively accumulating four depth-sliced optical depths into
  // `dustMapTex` — see dustAttenuation.wesl's header for how the shader
  // consumes it.
  const dustMapVsMod = makeShader(dustMapVsWgsl, 'galaxy:dustMap.vertex');
  const dustMapFsMod = makeShader(dustMapFsWgsl, 'galaxy:dustMap.fragment');
  const dustMapPipe = device.createRenderPipeline({
    label: 'galaxy:dustMapPipe',
    layout: 'auto',
    vertex: { module: dustMapVsMod, entryPoint: 'vs' },
    fragment: {
      module: dustMapFsMod,
      entryPoint: 'fs',
      targets: [{ format: dustMapFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // ---- dust-map presentation pipeline ("JWST" view) ----
  // `milkyWay/field/dustPresent/`: a fullscreen triangle over `dustMapTex`,
  // mapping its column to a hot palette. Drawn ALONGSIDE fieldSplatPipe's
  // emission draw, gated on `render.dustViewIntensity > 0` (`drawFrame`'s own
  // gate) — the four debug views crossfade independently. No blend: it is the
  // pass's only draw into a freshly cleared `dustViewTex`.
  const dustPresentVsMod = makeShader(dustPresentVsWgsl, 'galaxy:dustPresent.vertex');
  const dustPresentFsMod = makeShader(dustPresentFsWgsl, 'galaxy:dustPresent.fragment');
  const dustPresentPipe = device.createRenderPipeline({
    label: 'galaxy:dustPresentPipe',
    layout: 'auto',
    vertex: { module: dustPresentVsMod, entryPoint: 'vs' },
    fragment: { module: dustPresentFsMod, entryPoint: 'fs', targets: [{ format: hdrFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  function hiiTierPipeline(kind: HiiTier): GPURenderPipeline {
    return kind === 'young' ? hiiYoungPipe : hiiErosionPipe;
  }

  // ---- bind groups ----
  // A group holds the EXACT GPUBuffer/GPUTexture objects it names, so each
  // resource that can regrow/recreate must trigger a rebuild rather than a
  // cached group living forever — `BIND_GROUP_DEPS` above plus `syncBindGroups`
  // below are the one table/one walker doing that. None of the five `let`s
  // here builds during construction: `fieldCompsBuffer`/`hiiCompsBuffer` come
  // from `model`, `getDustMapTex()` from `targets`, and neither exists yet
  // when this module is constructed (see the module header).
  let dustMapBG: GPUBindGroup;
  let fieldSplatBG: GPUBindGroup;
  let dustPresentBG: GPUBindGroup;
  let hiiBG: GPUBindGroup;
  let tierBGMap: Record<HiiTier, GPUBindGroup>;

  function buildDustMapBindGroup(fieldCompsBuffer: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:dustMapBG',
      layout: dustMapPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 1, resource: { buffer: fieldCompsBuffer } },
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
        // S4's ISM-map detail term (dustDetail.wesl) rides the accumulation
        // pass, applied per dust splat — reads the cartesian bake (stage 2),
        // not the packed log-polar map.
        { binding: 3, resource: { buffer: ismMapGenerator.gridBuffer } },
        { binding: 7, resource: dustMapSampler },
        { binding: 8, resource: ismMapGenerator.cartesianTexture.createView() },
        // Task 9's Larson renorm scale — only dustMap/fragment.wesl imports
        // it, so 'layout: auto' adds this entry to dustMapPipe's bind group
        // alone (io.wesl's own doc for the same "only the shader that
        // imports a binding gains it" contract).
        { binding: 14, resource: { buffer: dustRenormBuffer } },
      ],
    });
  }

  function buildFieldSplatBindGroup(fieldCompsBuffer: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:fieldSplatBG',
      layout: fieldSplatPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 1, resource: { buffer: fieldCompsBuffer } },
        // dustAttenuation.wesl's own two bindings — fieldSplat/fragment.wesl
        // is the only reader of dustMapTex through a FILTERED sample
        // (dustPresent.wesl gets away with a 1:1 texel load below).
        { binding: 2, resource: getDustMapTex().createView() },
        { binding: 6, resource: dustMapSampler },
        // Task 15's own two renorm scales — only fieldSplat/fragment.wesl
        // imports these, so 'layout: auto' adds these entries to
        // fieldSplatPipe's bind group alone (dustMapBG's own binding-14
        // precedent above).
        { binding: 15, resource: { buffer: armRenormBuffer } },
        { binding: 16, resource: { buffer: spurRenormBuffer } },
      ],
    });
  }

  function buildDustPresentBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'galaxy:dustPresentBG',
      layout: dustPresentPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldUbo } },
        { binding: 2, resource: getDustMapTex().createView() },
        // No 3/7/8/9: S4's detail term applies at accumulation (dustMap.wesl);
        // this pass just presents the already-modulated column.
      ],
    });
  }

  // Every HII-buffer pass (the `hii:extras` draw AND each generalized
  // sub-tier) shares its dust-attenuated emission math (dustAttenuation.wesl's
  // `componentEmission`) against its own header and the shared `hiiComps`
  // storage buffer, differing ONLY in which uniform buffer binding 0 names.
  // `hiiExtrasPipe` alone also references 4/5 (extrasFragment.wesl imports
  // hiiNoiseTerm alongside starGrainTerm) — see the module header for why
  // handing this entry list to `hiiYoungPipe`'s layout would be a validation
  // error, not a no-op.
  function buildHiiFullBindGroup(
    ubo: GPUBuffer,
    label: string,
    pipe: GPURenderPipeline,
    hiiCompsBuffer: GPUBuffer,
  ): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: ubo } },
      { binding: 1, resource: { buffer: hiiCompsBuffer } },
      { binding: 2, resource: getDustMapTex().createView() },
      { binding: 3, resource: { buffer: ismMapGenerator.gridBuffer } },
      { binding: 7, resource: dustMapSampler },
      { binding: 8, resource: ismMapGenerator.cartesianTexture.createView() },
    ];
    if (pipe === hiiExtrasPipe) {
      entries.push(
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
      );
    }
    entries.push(
      { binding: 6, resource: dustMapSampler },
      // Star-grain volume — starGrain.wesl's YOUNG STARS branch, imported by
      // both youngFragment.wesl and extrasFragment.wesl's sign test;
      // erosionFragment.wesl does not (see `buildHiiErosionBindGroup`).
      { binding: 10, resource: starGrainTex.createView() },
      { binding: 11, resource: starGrainSampler },
      // Warp-noise volume — starGrain.wesl's own domain-warp displacement,
      // imported by the same file as starGrainTex above, so it rides the same
      // two pipelines and no others.
      { binding: 12, resource: warpNoiseTex.createView() },
      { binding: 13, resource: warpNoiseSampler },
    );
    return device.createBindGroup({ label, layout: pipe.getBindGroupLayout(0), entries });
  }

  // hiiErosionPipe (shells+dig): no starGrainTex/Smp (10/11) —
  // erosionFragment.wesl only ever imports hiiNoise.wesl's own
  // dustNoiseTex/Smp for its ridged-noise term, never the star-grain volume.
  function buildHiiErosionBindGroup(
    ubo: GPUBuffer,
    label: string,
    hiiCompsBuffer: GPUBuffer,
  ): GPUBindGroup {
    return device.createBindGroup({
      label,
      layout: hiiErosionPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ubo } },
        { binding: 1, resource: { buffer: hiiCompsBuffer } },
        { binding: 2, resource: getDustMapTex().createView() },
        { binding: 4, resource: dustNoiseTex.createView() },
        { binding: 5, resource: dustNoiseSampler },
        { binding: 6, resource: dustMapSampler },
      ],
    });
  }

  // `getDustMapTex`'s declared type lies (see `FieldPipelineDeps`): the host's
  // real thunk is `() => dustMapTex!` over a `GPUTexture | null` that starts
  // `null`, so this cast just names the runtime truth the walker depends on.
  const currentDustMapTex = (): GPUTexture | null => getDustMapTex() as GPUTexture | null;

  const lastIdentity: { fieldComps?: GPUBuffer; hiiComps?: GPUBuffer; dustMap: GPUTexture | null } =
    { dustMap: null };

  /**
   * Rebuilds every role whose `BIND_GROUP_DEPS` names a resource that moved
   * identity since the last call (`Object.is` against `lastIdentity`) — an
   * unchanged buffer/texture is a no-op. `resources` carries only what THIS
   * call knows fresh; `dustMap` is always re-read live, which is safe even
   * before allocation (it comes back `null`, which the readiness gate below
   * excludes from building).
   */
  function syncBindGroups(resources: { fieldComps?: GPUBuffer; hiiComps?: GPUBuffer }): void {
    const { fieldComps: fieldCompsBuffer, hiiComps: hiiCompsBuffer } = resources;
    const dustMapTex = currentDustMapTex();

    const changed = new Set<BindGroupResourceKey>();
    if (fieldCompsBuffer !== undefined && !Object.is(lastIdentity.fieldComps, fieldCompsBuffer)) {
      lastIdentity.fieldComps = fieldCompsBuffer;
      changed.add('fieldComps');
    }
    if (hiiCompsBuffer !== undefined && !Object.is(lastIdentity.hiiComps, hiiCompsBuffer)) {
      lastIdentity.hiiComps = hiiCompsBuffer;
      changed.add('hiiComps');
    }
    if (!Object.is(lastIdentity.dustMap, dustMapTex)) {
      lastIdentity.dustMap = dustMapTex;
      changed.add('dustMap');
    }

    const ready = (key: BindGroupResourceKey): boolean => key !== 'dustMap' || dustMapTex !== null;
    const dirty = (role: BindGroupRole): boolean =>
      BIND_GROUP_DEPS[role].some((key) => changed.has(key)) && BIND_GROUP_DEPS[role].every(ready);

    if (dirty('dustMapBG') && fieldCompsBuffer !== undefined) {
      dustMapBG = buildDustMapBindGroup(fieldCompsBuffer);
    }
    if (dirty('fieldSplatBG') && fieldCompsBuffer !== undefined) {
      fieldSplatBG = buildFieldSplatBindGroup(fieldCompsBuffer);
    }
    if (dirty('hiiBG') && hiiCompsBuffer !== undefined) {
      hiiBG = buildHiiFullBindGroup(hiiUbo, 'galaxy:hiiBG', hiiExtrasPipe, hiiCompsBuffer);
    }
    if (dirty('tierBGMap') && hiiCompsBuffer !== undefined) {
      tierBGMap = mapHiiTiers((kind) =>
        kind === 'young'
          ? buildHiiFullBindGroup(
              tierUbo[kind],
              `galaxy:hiiBG:${kind}`,
              hiiYoungPipe,
              hiiCompsBuffer,
            )
          : buildHiiErosionBindGroup(tierUbo[kind], `galaxy:hiiBG:${kind}`, hiiCompsBuffer),
      );
    }
    if (dirty('dustPresentBG')) {
      dustPresentBG = buildDustPresentBindGroup();
    }
  }

  /** `fieldComps`' initial build (before `targets` exists) — see `BIND_GROUP_DEPS`. */
  function rebuildDustMapBindGroup(fieldCompsBuffer: GPUBuffer): void {
    syncBindGroups({ fieldComps: fieldCompsBuffer });
  }

  /** `fieldComps`' `onRegrow` — see `BIND_GROUP_DEPS`. */
  function rebuildFieldCompsBindGroups(fieldCompsBuffer: GPUBuffer): void {
    syncBindGroups({ fieldComps: fieldCompsBuffer });
  }

  /** `hiiComps`' `onRegrow` — see `BIND_GROUP_DEPS`. */
  function rebuildTierBindGroups(hiiCompsBuffer: GPUBuffer): void {
    syncBindGroups({ hiiComps: hiiCompsBuffer });
  }

  /** `onDustMapReallocated` — see `BIND_GROUP_DEPS`. */
  function rebuildDustMapDependents(fieldCompsBuffer: GPUBuffer, hiiCompsBuffer: GPUBuffer): void {
    syncBindGroups({ fieldComps: fieldCompsBuffer, hiiComps: hiiCompsBuffer });
  }

  return {
    fieldSplatPipe,
    hiiYoungPipe,
    hiiErosionPipe,
    hiiExtrasPipe,
    dustMapPipe,
    dustPresentPipe,
    hiiTierPipeline,

    get dustMapBG(): GPUBindGroup {
      return dustMapBG;
    },
    get fieldSplatBG(): GPUBindGroup {
      return fieldSplatBG;
    },
    get dustPresentBG(): GPUBindGroup {
      return dustPresentBG;
    },
    get hiiBG(): GPUBindGroup {
      return hiiBG;
    },
    tierBG(kind: HiiTier): GPUBindGroup {
      return tierBGMap[kind];
    },

    rebuildDustMapBindGroup,
    rebuildFieldCompsBindGroups,
    rebuildTierBindGroups,
    rebuildDustMapDependents,
  };
}
