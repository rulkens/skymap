/**
 * GPU_HANDLE_ROWS — the declarative table `constructGpuHandles` /
 * `destroyGpuHandles` walk, and the table `initGpu.ts`/`wireInput.ts` call
 * live. One row per `GpuHandleKey`, in today's `initGpu.ts` order
 * (`focusUniform` first), except `galaxyPickRenderer`/`pickProgram` — marked
 * `constructPhase: 'wireInput'` — declared LAST so reverse-order teardown
 * destroys them first. `rebuildOnSwapFormat: true` marks the 8 rows
 * `buildSwapRenderers.ts` rebuilds on a format change.
 */

import { createGalaxyPointRenderer } from '../../gpu/renderers/galaxyCatalog/galaxyPointRenderer';
import { createGalaxyPickRenderer } from '../../gpu/renderers/galaxyCatalog/galaxyPickRenderer';
import { createCompositor } from '../../gpu/passes/compositor';
import { createRenderTargets } from '../../gpu/renderTargets';
import { createTexturedDiskRenderer } from '../../gpu/renderers/galaxyCatalog/texturedDiskRenderer';
import { createProceduralDiskRenderer } from '../../gpu/renderers/galaxyCatalog/proceduralDiskRenderer';
import { createMilkyWayCloud } from '../galaxyGenerator/v1/milkyWayCloud';
import { MILKY_WAY_TUNING_DEFAULTS } from '../galaxyGenerator/v1/milkyWayCalibration';
import { createMilkyWayCloudRenderer } from '../../gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { createHorizonShellRenderer } from '../../gpu/renderers/horizonShell/horizonShellRenderer';
import { createZoneOfAvoidanceRenderer } from '../../gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer';
import { createFilamentRenderer } from '../../gpu/renderers/filaments/filamentRenderer';
import { createConstellationRenderer } from '../../gpu/renderers/constellations/constellationRenderer';
import { createStructureMarkerRenderer } from '../../gpu/renderers/structureMarker/structureMarkerRenderer';
import { createMilkyWayPickRenderer } from '../../gpu/renderers/milkyWay/milkyWayPickRenderer';
import { createVolumeFieldRenderer } from '../../gpu/renderers/volumeField/volumeFieldRenderer';
import { createFlowFieldRenderer } from '../../gpu/renderers/flowField/flowFieldRenderer';
import { createAdditiveUpsample } from '../../gpu/passes/additiveUpsample';
import { createStarAggregateUpsample } from '../../gpu/passes/starAggregateUpsample';
import { createBloomPyramid } from '../../gpu/passes/bloomPyramid';
import { createEarthRenderer } from '../../gpu/renderers/bodies/earthRenderer';
import { createTexturedBodyRenderer } from '../../gpu/renderers/bodies/texturedBodyRenderer';
import { createRingRenderer } from '../../gpu/renderers/bodies/ringRenderer';
import { createCloudShellRenderer } from '../../gpu/renderers/bodies/cloudShellRenderer';
import { createAtmosphereShellRenderer } from '../../gpu/renderers/atmosphere/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { createStarRenderer } from '../../gpu/renderers/bodies/starRenderer';
import { createPlanetRenderer } from '../../gpu/renderers/bodies/planetRenderer';
import { createStarPointRenderer } from '../../gpu/renderers/bodies/starPointRenderer';
import { createBodyGlintRenderer } from '../../gpu/renderers/bodies/bodyGlintRenderer';
import { createStarCatalogRenderer } from '../../gpu/renderers/starCatalog/starCatalogRenderer';
import { createStarCatalogPickRenderer } from '../../gpu/renderers/starCatalog/starCatalogPickRenderer';
import { createBodyPickRenderer } from '../../gpu/renderers/bodies/bodyPickRenderer';
import { createOrbitTrailRenderer } from '../../gpu/renderers/bodies/orbitTrailRenderer';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { CONST_J2000 } from '../../../data/time/constJ2000';
import { SLAB_REVERSED_Z, NEAR0, COSMO } from '../frame/slabs';
import { createFocusUniformBuffer } from '../../gpu/resources/createFocusUniformBuffer';
import { createLabelRenderer } from '../../gpu/renderers/labels/labelRenderer';
import { createLabel3DRenderer } from '../../gpu/renderers/labels3d/label3DRenderer';
import { createMarkerLineRenderer } from '../../gpu/renderers/labels/markerLineRenderer';
import { createDebugLineRenderer } from '../../gpu/renderers/devTools/debugLineRenderer';
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRing/selectionRingRenderer';
import { createPickDebugOverlay } from '../../gpu/passes/pickDebugOverlay';
import { createDiskRadiusRing } from '../../gpu/renderers/devTools/diskRadiusRing';
import { FOREGROUND_LABEL_CAPACITY } from '../presentation/sceneBodyLabels';
import { createPickProgram } from '../frame/pickProgram';
import { CONTENT_LAYERS } from '../frame/passes';
import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../../data/renderTargetFormats';

import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { EngineState } from '../../../@types/engine/state/EngineState';

// `as const satisfies`, not a plain `: readonly GpuHandleRow[]` annotation:
// `satisfies` checks every row against its `GpuHandleRow` union member;
// `as const` keeps each row's `key` a literal in GPU_HANDLE_ROWS's own
// inferred type, which the totality check below depends on (an ordinary
// annotation widens `key` back to `GpuHandleKey`, making that check
// vacuously true). `as const` gives `construct` no contextual type, so
// every row spells out its `state`/`deps` parameter types.
export const GPU_HANDLE_ROWS = [
  // focusUniform first: reversing the array for teardown destroys it LAST,
  // matching its real early construction position (initGpu.ts) and the one
  // proven destroy-order constraint (galaxyPickRenderer captures its bind
  // group at construction — see the plan's teardown-order finding).
  {
    key: 'focusUniform',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createFocusUniformBuffer(deps.ctx.device, deps.focusBgl),
  },
  {
    key: 'compositor',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createCompositor({ device: deps.ctx.device }),
  },
  {
    // `state`, not a defaults constant: the `mw-aggregate` row's `scale` is a
    // function of `settings.milkyWay.aggregateDivisor`, and every reconcile
    // re-reads it off this same live state. Not a second path to the same
    // answer — the scale function IS the reconcile path, seeded here.
    key: 'renderTargets',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createRenderTargets(
        deps.ctx.device,
        deps.ctx.format,
        { width: deps.ctx.canvas.width, height: deps.ctx.canvas.height },
        state,
      ),
  },
  {
    key: 'galaxyPointRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createGalaxyPointRenderer({
        device: deps.ctx.device,
        targetFormat: HDR_TARGET_FORMAT,
        fadeBgl: deps.fadeBgl,
        sourceBgl: deps.sourceBgl,
        focusBgl: deps.focusBgl,
      }),
  },

  // ── The 8 swap-chain-format rows (buildSwapRenderers.ts order) ──────────
  {
    key: 'labelRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(deps.ctx, deps.ctx.format, deps.fontAtlases, undefined, undefined, {
        occludeAgainstDepth: 'coverage',
      }),
  },
  {
    key: 'markerLineRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMarkerLineRenderer(deps.ctx, deps.ctx.format, undefined, {
        occludeAgainstDepth: 'coverage',
      }),
  },
  {
    key: 'debugLineRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createDebugLineRenderer(deps.ctx, deps.ctx.format, 8192),
  },
  {
    key: 'selectionRingRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createSelectionRingRenderer(deps.ctx, deps.ctx.format, {
        occludeAgainstDepth: 'coverage',
      }),
  },
  {
    key: 'pickDebugOverlay',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickDebugOverlay(deps.ctx.device, deps.ctx.format),
  },
  {
    key: 'diskRadiusRing',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createDiskRadiusRing(deps.ctx.device, deps.ctx.format),
  },
  {
    key: 'foregroundLabelRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(
        deps.ctx,
        deps.ctx.format,
        deps.fontAtlases,
        FOREGROUND_LABEL_CAPACITY,
        undefined,
        { occludeAgainstDepth: 'compare' },
      ),
  },
  {
    key: 'foregroundMarkerLineRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMarkerLineRenderer(deps.ctx, deps.ctx.format, undefined, {
        occludeAgainstDepth: 'compare',
      }),
  },

  {
    key: 'structureMarkerRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStructureMarkerRenderer(
        deps.ctx,
        HDR_TARGET_FORMAT,
        deps.fadeBgl,
        SLAB_REVERSED_Z[COSMO]!,
      ),
  },
  {
    key: 'milkyWayPickRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayPickRenderer(deps.ctx, deps.fadeBgl, SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'texturedDiskRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createTexturedDiskRenderer(
        {
          device: deps.ctx.device,
          context: deps.ctx.context,
          targetFormat: HDR_TARGET_FORMAT,
          canvas: deps.ctx.canvas,
        },
        deps.focusBgl,
      ),
  },
  {
    key: 'proceduralDiskRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createProceduralDiskRenderer({
        device: deps.ctx.device,
        context: deps.ctx.context,
        targetFormat: HDR_TARGET_FORMAT,
        canvas: deps.ctx.canvas,
        focusBgl: deps.focusBgl,
        reversedZ: SLAB_REVERSED_Z[COSMO]!,
      }),
  },
  {
    key: 'horizonShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createHorizonShellRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
  },
  {
    key: 'zoneOfAvoidanceRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createZoneOfAvoidanceRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    // Draws into HDR (rgba16float), not the swap chain — no
    // rebuildOnSwapFormat (that's only the 8 swap-chain-format rows above).
    key: 'label3DRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabel3DRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fontAtlases),
  },
  {
    key: 'filamentRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createFilamentRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fadeBgl),
  },
  {
    key: 'constellationRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createConstellationRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fadeBgl),
  },
  {
    // `MILKY_WAY_TUNING_DEFAULTS.starCount`, not `state.settings.milkyWay`:
    // runFrame regenerates the cloud on divergence from the live setting, so
    // reading settings here would just add a second path to the same answer.
    key: 'milkyWayCloud',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayCloud(deps.ctx.device, MILKY_WAY_TUNING_DEFAULTS.starCount),
  },
  {
    key: 'milkyWayCloudRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayCloudRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
  },
  {
    key: 'volumeFieldRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createVolumeFieldRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fadeBgl),
  },
  {
    key: 'flowFieldRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createFlowFieldRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
  },
  {
    key: 'volumeUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    key: 'milkyWayAggregateUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    key: 'zoneOfAvoidanceUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    key: 'starAggregateUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarAggregateUpsample(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    key: 'bloomPyramid',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBloomPyramid(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  // ── Sphere-body renderers: draw into the `foreground:0` render-target row ──
  // (also earthRenderer through atmosphereShellRenderer further down). Their
  // pipeline formats share HDR_TARGET_FORMAT/FOREGROUND_DEPTH_FORMAT
  // (data/renderTargetFormats.ts) with that row's format/depth in
  // renderTargets.ts, so the two can't drift apart.
  {
    key: 'starRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'planetRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createPlanetRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    // The camera-free boot seed: the whole star list, positioned at the fixed
    // J2000 epoch (a star is a static anchor, so the epoch cannot move it).
    // Folded into `construct` per the plan's risk-register note — this is a
    // one-time boot seed with no other handle reading it in between.
    key: 'starPointRenderer',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) => {
      const bootBodyStates = deriveBodyStates(CONST_J2000);
      const starPointRenderer = createStarPointRenderer(deps.ctx.device, HDR_TARGET_FORMAT);
      starPointRenderer.setStars(
        state.data.bodies.stars.map((star) => ({
          ...star,
          positionMpc: bootBodyStates.get(star.id)!.positionMpc,
        })),
      );
      return starPointRenderer;
    },
  },
  {
    key: 'bodyGlintRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    key: 'starCatalogRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarCatalogRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    // Cross-handle read: borrows the visual renderer's exposed BGLs + records
    // bind group so its own pick pipeline stays bind-group compatible.
    // `starCatalogRenderer` must be (and is) an earlier row.
    key: 'starCatalogPickRenderer',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarCatalogPickRenderer(
        deps.ctx.device,
        state.gpu.starCatalogRenderer!.pickResources(),
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'bodyPickRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBodyPickRenderer(deps.ctx.device, SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'orbitTrailRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createOrbitTrailRenderer(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  // Foreground-target invariant continues here — see the starRenderer/
  // planetRenderer comment above.
  {
    key: 'earthRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createEarthRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'texturedBodyRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createTexturedBodyRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'ringRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createRingRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'cloudShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createCloudShellRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'atmosphereShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAtmosphereShellRenderer(
        deps.ctx.device,
        HDR_TARGET_FORMAT,
        FOREGROUND_DEPTH_FORMAT,
        SLAB_REVERSED_Z[NEAR0]!,
        ATMOSPHERE_PARAMS,
      ),
  },

  // ── wireInput.ts-phase rows, declared LAST ───────────────────────────────
  // Constructed once `focusUniform` exists (a later bootstrap phase), and
  // declared last so reverse-order teardown destroys them FIRST — before
  // `focusUniform`, whose bind group `galaxyPickRenderer` captures below.
  // `constructPhase: 'wireInput'` is what `initGpu.ts`/`wireInput.ts` filter
  // on — see GpuHandleRow.d.ts.
  {
    key: 'galaxyPickRenderer',
    constructPhase: 'wireInput',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createGalaxyPickRenderer(
        deps.ctx.device,
        deps.fadeBgl,
        deps.sourceBgl,
        deps.focusBgl,
        state.gpu.focusUniform!.bindGroup,
        SLAB_REVERSED_Z[COSMO]!,
      ),
  },
  {
    key: 'pickProgram',
    constructPhase: 'wireInput',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickProgram({
        device: deps.ctx.device,
        canvas: deps.ctx.canvas,
        state,
        layers: CONTENT_LAYERS,
      }),
  },
] as const satisfies readonly GpuHandleRow[];

// Compile-time totality: fails `tsc` if a `GpuHandleKey` has no row above —
// the enforcement Task 11's "add a row when you add a field" pointer needs.
// No `as` cast: `_totalityCheck`'s declared type IS the check result, so a
// missing key assigns literal `true` to a mismatched tuple type — a real
// assignability error. The plan's own `as _AssertEveryKeyCovered extends
// true ? true : never` phrasing does NOT fail here: `as` accepts either
// direction of assignability, and `never` is assignable to (from) anything,
// so `true as never` — and the reverse assignment into `: true` — both
// silently succeed regardless of whether a row is missing.
type _AssertEveryKeyCovered = GpuHandleKey extends (typeof GPU_HANDLE_ROWS)[number]['key']
  ? true
  : [
      'missing a GPU_HANDLE_ROWS row for',
      Exclude<GpuHandleKey, (typeof GPU_HANDLE_ROWS)[number]['key']>,
    ];
const _totalityCheck: _AssertEveryKeyCovered = true;
