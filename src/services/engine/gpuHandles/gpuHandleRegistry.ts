/**
 * GPU_HANDLE_ROWS — the table `constructGpuHandles` / `destroyGpuHandles` walk.
 * One row per `GpuHandleKey`, `focusUniform` first; `pickProgram`
 * (`constructPhase: 'wireInput'`) is LAST so reverse-order teardown destroys it
 * first. `rebuildOnSwapFormat: true` marks rows `buildSwapRenderers.ts` rebuilds.
 */

import { createCompositor } from '../../gpu/passes/compositor';
import { createRenderTargets } from '../../gpu/renderTargets';
import { composeRenderTargetRows } from '../layer/composeRenderTargetRows';
import { createHorizonShellRenderer } from '../../../layers/cosmicHorizon/render/horizonShellRenderer';
import { createBloomPyramid } from '../../gpu/passes/bloomPyramid';
import { createMeshBodyRenderer } from '../../gpu/renderers/bodies/meshBodyRenderer';
import { createCubeFaceBlitRenderer } from '../../gpu/renderers/cubeFaceBlit/cubeFaceBlitRenderer';
import { createDomeResampleRenderer } from '../../gpu/renderers/domeResample/domeResampleRenderer';
import { createBodyPickRenderer } from '../../gpu/renderers/bodies/bodyPickRenderer';
import { createOrbitTrailRenderer } from '../../gpu/renderers/bodies/orbitTrailRenderer';
import { SLAB_REVERSED_Z, NEAR0, COSMO } from '../frame/slabs';
import { createFocusUniformBuffer } from '../../gpu/resources/createFocusUniformBuffer';
import { createLabelRenderer } from '../../gpu/renderers/labels/labelRenderer';
import { createLabelPickRenderer } from '../../gpu/renderers/labels/labelPickRenderer';
import { createLabel3DRenderer } from '../../gpu/renderers/labels3d/label3DRenderer';
import { createMarkerLineRenderer } from '../../gpu/renderers/labels/markerLineRenderer';
import { createDebugLineRenderer } from '../../gpu/renderers/devTools/debugLineRenderer';
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRing/selectionRingRenderer';
import { createPickDebugOverlay } from '../../gpu/passes/pickDebugOverlay';
import { createPickProgram, pickDepthFormat } from '../frame/pickProgram';
import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../../data/renderTargetFormats';

import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { EngineState } from '../../../@types/engine/state/EngineState';

// `as const satisfies`, not an annotation: an annotation widens `key` back to
// `GpuHandleKey`, making the totality check below vacuously true. `as const`
// gives `construct` no contextual type, so rows spell out their parameter types.
export const GPU_HANDLE_ROWS = [
  // focusUniform first: teardown reverses the array and destroys it LAST, because a
  // Layer's pick renderer captures its bind group at construction.
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
    // `state`, not a defaults constant: `mw-aggregate`'s `scale` is a function of
    // `settings.milkyWay.aggregateDivisor`, which every reconcile re-reads.
    key: 'renderTargets',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createRenderTargets(
        deps.ctx.device,
        composeRenderTargetRows(deps.ctx.format, state.layerTargets),
        { width: deps.ctx.canvas.width, height: deps.ctx.canvas.height },
        state,
      ),
  },
  // The 8 swap-chain-format rows, in buildSwapRenderers.ts order.
  {
    key: 'labelRendererCosmo',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(deps.ctx, {
        targetFormat: deps.ctx.format,
        atlases: deps.fontAtlases,
        occludeAgainstScene: true,
      }),
  },
  {
    key: 'markerLineRendererCosmo',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMarkerLineRenderer(deps.ctx, deps.ctx.format, {
        occludeAgainstScene: true,
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
        occludeAgainstScene: true,
      }),
  },
  {
    key: 'pickDebugOverlay',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickDebugOverlay(deps.ctx.device, deps.ctx.format),
  },
  {
    key: 'labelRendererNear',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelRenderer(deps.ctx, {
        targetFormat: deps.ctx.format,
        atlases: deps.fontAtlases,
        occludeAgainstScene: true,
      }),
  },
  {
    key: 'markerLineRendererNear',
    rebuildOnSwapFormat: true,
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMarkerLineRenderer(deps.ctx, deps.ctx.format, {
        occludeAgainstScene: true,
      }),
  },

  // The two label pick providers are NOT `rebuildOnSwapFormat` rows: they draw into the
  // pick program's fixed-format r32uint targets, so an HDR toggle leaves them valid.
  // Depth format comes from `pickDepthFormat`, the function that sizes the target.
  {
    key: 'labelPickRendererCosmo',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelPickRenderer(deps.ctx.device, pickDepthFormat(COSMO), SLAB_REVERSED_Z[COSMO]!),
  },
  {
    key: 'labelPickRendererNear',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabelPickRenderer(deps.ctx.device, pickDepthFormat(NEAR0), SLAB_REVERSED_Z[NEAR0]!),
  },
  {
    key: 'horizonShellRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createHorizonShellRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
  },
  {
    // Draws into HDR (rgba16float), not the swap chain: no rebuildOnSwapFormat.
    key: 'label3DRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createLabel3DRenderer(deps.ctx.device, HDR_TARGET_FORMAT, deps.fontAtlases),
  },
  {
    key: 'bloomPyramid',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createBloomPyramid(deps.ctx.device, HDR_TARGET_FORMAT),
  },
  {
    // Draws into a probe's cube (`meshBodyRenderer` mints it in this format).
    key: 'cubeFaceBlitRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createCubeFaceBlitRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
  },
  {
    key: 'domeResampleRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createDomeResampleRenderer({ device: deps.ctx.device, targetFormat: HDR_TARGET_FORMAT }),
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
  {
    // Mesh bodies ride a host's body slab: pipeline formats are the `foreground:0`
    // row's own (data/renderTargetFormats.ts).
    key: 'meshBodyRenderer',
    construct: (_state: EngineState, deps: GpuHandleConstructDeps) =>
      createMeshBodyRenderer({
        device: deps.ctx.device,
        targetFormat: HDR_TARGET_FORMAT,
        depthFormat: FOREGROUND_DEPTH_FORMAT,
        reversedZ: SLAB_REVERSED_Z[NEAR0]!,
        envBrdfLut: deps.envBrdfLut,
      }),
  },

  // wireInput-phase rows: constructed once `focusUniform` exists, declared LAST so
  // reverse-order teardown destroys them FIRST.
  {
    key: 'pickProgram',
    constructPhase: 'wireInput',
    construct: (state: EngineState, deps: GpuHandleConstructDeps) =>
      createPickProgram({
        device: deps.ctx.device,
        canvas: deps.ctx.canvas,
        state,
        passes: state.passes,
      }),
  },
] as const satisfies readonly GpuHandleRow[];

// Compile-time totality: fails `tsc` if a `GpuHandleKey` has no row. No `as` cast:
// `as X extends true ? true : never` accepts either direction of assignability, so
// it silently succeeds even when a row is missing.
type _AssertEveryKeyCovered = GpuHandleKey extends (typeof GPU_HANDLE_ROWS)[number]['key']
  ? true
  : [
      'missing a GPU_HANDLE_ROWS row for',
      Exclude<GpuHandleKey, (typeof GPU_HANDLE_ROWS)[number]['key']>,
    ];
const _totalityCheck: _AssertEveryKeyCovered = true;
