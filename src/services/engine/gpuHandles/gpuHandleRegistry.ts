/**
 * GPU_HANDLE_ROWS — the declarative table `constructGpuHandles` /
 * `destroyGpuHandles` walk. One row per `GpuHandleKey`, in today's
 * `initGpu.ts` order (`focusUniform` first), except `galaxyPickRenderer` /
 * `pickProgram` (the `wireInput.ts`-phase rows), declared LAST so
 * reverse-order teardown destroys them first. `rebuildOnSwapFormat: true`
 * marks the 8 rows `buildSwapRenderers.ts` rebuilds on a format change.
 * `initGpu.ts`/`wireInput.ts` still own the LIVE calls this table mirrors —
 * they switch to calling it in Tasks 6/7.
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
import { createMarkerLineRenderer } from '../../gpu/renderers/labels/markerLineRenderer';
import { createDebugLineRenderer } from '../../gpu/renderers/devTools/debugLineRenderer';
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRing/selectionRingRenderer';
import { createPickDebugOverlay } from '../../gpu/passes/pickDebugOverlay';
import { createDiskRadiusRing } from '../../gpu/renderers/devTools/diskRadiusRing';
import { FOREGROUND_LABEL_CAPACITY } from '../presentation/sceneBodyLabels';
import { createPickProgram } from '../frame/pickProgram';
import { CONTENT_LAYERS } from '../frame/passes';

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
      createFocusUniformBuffer(deps.device, deps.focusBgl),
  },
  {
    key: 'compositor',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createCompositor({ device: deps.device, swapFormat: deps.format, hdrFormat: 'rgba16float' }),
  },
  {
    key: 'renderTargets',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createRenderTargets(
        deps.device,
        deps.format,
        { width: deps.canvas.width, height: deps.canvas.height },
        MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor,
      ),
  },
  {
    key: 'galaxyPointRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createGalaxyPointRenderer({
        device: deps.device,
        targetFormat: 'rgba16float',
        fadeBgl: deps.fadeBgl,
        sourceBgl: deps.sourceBgl,
        focusBgl: deps.focusBgl,
      }),
  },

  // ── The 8 swap-chain-format rows (buildSwapRenderers.ts order) ──────────
  // `deps.uiCtx` omits `format` (it goes stale first on a swap-format
  // rebuild — see EngineGpuHandles.d.ts); each row composes the full
  // GpuContext locally rather than sharing one built object, per the
  // "construct closes over nothing but state/deps" contract.
  {
    key: 'labelRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(
        { ...deps.uiCtx, format: deps.format },
        deps.format,
        deps.fontAtlases,
        undefined,
        undefined,
        { occludeAgainstDepth: 'coverage' },
      ),
  },
  {
    key: 'markerLineRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMarkerLineRenderer({ ...deps.uiCtx, format: deps.format }, deps.format, undefined, {
        occludeAgainstDepth: 'coverage',
      }),
  },
  {
    key: 'debugLineRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createDebugLineRenderer({ ...deps.uiCtx, format: deps.format }, deps.format, 8192),
  },
  {
    key: 'selectionRingRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createSelectionRingRenderer({ ...deps.uiCtx, format: deps.format }, deps.format, {
        occludeAgainstDepth: 'coverage',
      }),
  },
  {
    key: 'pickDebugOverlay',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickDebugOverlay(deps.device, deps.format),
  },
  {
    key: 'diskRadiusRing',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createDiskRadiusRing(deps.device, deps.format),
  },
  {
    key: 'foregroundLabelRenderer',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(
        { ...deps.uiCtx, format: deps.format },
        deps.format,
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
      createMarkerLineRenderer({ ...deps.uiCtx, format: deps.format }, deps.format, undefined, {
        occludeAgainstDepth: 'compare',
      }),
  },

  {
    key: 'structureMarkerRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStructureMarkerRenderer(
        { ...deps.uiCtx, format: deps.format },
        'rgba16float',
        deps.fadeBgl,
        SLAB_REVERSED_Z[COSMO]!,
      ),
  },
  {
    key: 'milkyWayPickRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayPickRenderer(
        { ...deps.uiCtx, format: deps.format },
        deps.fadeBgl,
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'texturedDiskRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createTexturedDiskRenderer(
        {
          device: deps.device,
          context: deps.context,
          targetFormat: 'rgba16float',
          canvas: deps.canvas,
        },
        deps.focusBgl,
      ),
  },
  {
    key: 'proceduralDiskRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createProceduralDiskRenderer({
        device: deps.device,
        context: deps.context,
        targetFormat: 'rgba16float',
        canvas: deps.canvas,
        focusBgl: deps.focusBgl,
        reversedZ: SLAB_REVERSED_Z[COSMO]!,
      }),
  },
  {
    key: 'horizonShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createHorizonShellRenderer({ device: deps.device, targetFormat: 'rgba16float' }),
  },
  {
    key: 'zoneOfAvoidanceRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createZoneOfAvoidanceRenderer(deps.device, 'rgba16float', deps.fontAtlases),
  },
  {
    key: 'filamentRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createFilamentRenderer(deps.device, 'rgba16float', deps.fadeBgl),
  },
  {
    key: 'constellationRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createConstellationRenderer(deps.device, 'rgba16float', deps.fadeBgl),
  },
  {
    key: 'milkyWayCloud',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayCloud(deps.device, MILKY_WAY_TUNING_DEFAULTS.starCount),
  },
  {
    key: 'milkyWayCloudRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMilkyWayCloudRenderer({ device: deps.device, targetFormat: 'rgba16float' }),
  },
  {
    key: 'volumeFieldRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createVolumeFieldRenderer(deps.device, 'rgba16float', deps.fadeBgl),
  },
  {
    key: 'flowFieldRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createFlowFieldRenderer({ device: deps.device, targetFormat: 'rgba16float' }),
  },
  {
    key: 'volumeUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.device, 'rgba16float'),
  },
  {
    key: 'milkyWayAggregateUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.device, 'rgba16float'),
  },
  {
    key: 'zoneOfAvoidanceUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAdditiveUpsample(deps.device, 'rgba16float'),
  },
  {
    key: 'starAggregateUpsample',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarAggregateUpsample(deps.device, 'rgba16float'),
  },
  {
    key: 'bloomPyramid',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBloomPyramid(deps.device, 'rgba16float'),
  },
  {
    key: 'starRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'planetRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createPlanetRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    // The camera-free boot seed: the whole star list, positioned at the fixed
    // J2000 epoch (a star is a static anchor, so the epoch cannot move it).
    // Folded into `construct` per the plan's risk-register note — this is a
    // one-time boot seed with no other handle reading it in between.
    key: 'starPointRenderer',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) => {
      const bootBodyStates = deriveBodyStates(CONST_J2000);
      const starPointRenderer = createStarPointRenderer(deps.device, 'rgba16float');
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
      createBodyGlintRenderer(deps.device, 'rgba16float'),
  },
  {
    key: 'starCatalogRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarCatalogRenderer(deps.device, 'rgba16float'),
  },
  {
    // Cross-handle read: borrows the visual renderer's exposed BGLs + records
    // bind group so its own pick pipeline stays bind-group compatible.
    // `starCatalogRenderer` must be (and is) an earlier row.
    key: 'starCatalogPickRenderer',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createStarCatalogPickRenderer(
        deps.device,
        state.gpu.starCatalogRenderer!.pickResources(),
        SLAB_REVERSED_Z[NEAR0]!,
      ),
  },
  {
    key: 'bodyPickRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBodyPickRenderer(deps.device, SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'orbitTrailRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createOrbitTrailRenderer(deps.device, 'rgba16float'),
  },
  {
    key: 'earthRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createEarthRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'texturedBodyRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createTexturedBodyRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'ringRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createRingRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'cloudShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createCloudShellRenderer(deps.device, 'rgba16float', 'depth32float', SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'atmosphereShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createAtmosphereShellRenderer(
        deps.device,
        'rgba16float',
        'depth32float',
        SLAB_REVERSED_Z[NEAR0]!,
        ATMOSPHERE_PARAMS,
      ),
  },

  // ── wireInput.ts-phase rows, declared LAST ───────────────────────────────
  // Constructed once `focusUniform` exists (a later bootstrap phase), and
  // declared last so reverse-order teardown destroys them FIRST — before
  // `focusUniform`, whose bind group `galaxyPickRenderer` captures below.
  {
    key: 'galaxyPickRenderer',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createGalaxyPickRenderer(
        deps.device,
        deps.fadeBgl,
        deps.sourceBgl,
        deps.focusBgl,
        state.gpu.focusUniform!.bindGroup,
        SLAB_REVERSED_Z[COSMO]!,
      ),
  },
  {
    key: 'pickProgram',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickProgram({ device: deps.device, canvas: deps.canvas, state, layers: CONTENT_LAYERS }),
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
