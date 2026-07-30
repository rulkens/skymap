/**
 * buildSwapRenderers — the re-runnable seam for the eight renderers whose
 * pipelines are baked against the swap-chain colour-target format.
 *
 * Every `createX` factory builds a real `GPURenderPipeline` against
 * `device`, which JSDOM's stub `GPUDevice` can't service — mocked so
 * `buildSwapRenderers` runs to completion and its `state.gpu.*` writes +
 * label-director wiring can be observed directly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeStub() {
  return { destroy: vi.fn() };
}

vi.mock('../../../../src/services/gpu/renderers/labels/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/labels/markerLineRenderer', () => ({
  createMarkerLineRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/devTools/debugLineRenderer', () => ({
  createDebugLineRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/selectionRing/selectionRingRenderer', () => ({
  createSelectionRingRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/passes/pickDebugOverlay', () => ({
  createPickDebugOverlay: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/devTools/diskRadiusRing', () => ({
  createDiskRadiusRing: vi.fn(() => makeStub()),
}));

// Imported AFTER the mocks so buildSwapRenderers picks up the mocked factories.
import { buildSwapRenderers } from '../../../../src/services/engine/phases/buildSwapRenderers';

/**
 * The eight handle keys `buildSwapRenderers` owns on `state.gpu.*`, plus the
 * `uiCtx` / `fontAtlases` inputs it reads.
 */
function makeState(): EngineState {
  return {
    gpu: {
      // No `format` — `state.gpu.uiCtx` omits it (see EngineGpuHandles);
      // `buildSwapRenderers` composes the live value in itself.
      uiCtx: {
        device: { __mockDevice: true },
        context: { __mockContext: true },
        canvas: { __mockCanvas: true },
      },
      fontAtlases: { __mockAtlases: true },
      labelRenderer: null,
      markerLineRenderer: null,
      debugLineRenderer: null,
      selectionRingRenderer: null,
      pickDebugOverlay: null,
      diskRadiusRing: null,
      foregroundLabelRenderer: null,
      foregroundMarkerLineRenderer: null,
    },
    subsystems: {
      labelDirector: {
        attachRenderers: vi.fn(),
      },
    },
  } as unknown as EngineState;
}

describe('buildSwapRenderers', () => {
  it('destroys the previous renderers before replacing them', () => {
    const state = makeState();
    buildSwapRenderers(state, 'bgra8unorm');

    const firstRound = {
      labelRenderer: state.gpu.labelRenderer,
      markerLineRenderer: state.gpu.markerLineRenderer,
      debugLineRenderer: state.gpu.debugLineRenderer,
      selectionRingRenderer: state.gpu.selectionRingRenderer,
      pickDebugOverlay: state.gpu.pickDebugOverlay,
      diskRadiusRing: state.gpu.diskRadiusRing,
      foregroundLabelRenderer: state.gpu.foregroundLabelRenderer,
      foregroundMarkerLineRenderer: state.gpu.foregroundMarkerLineRenderer,
    } as const;

    buildSwapRenderers(state, 'rgba16float');

    for (const [key, prevHandle] of Object.entries(firstRound)) {
      const stub = prevHandle as unknown as { destroy: ReturnType<typeof vi.fn> };
      expect(stub.destroy).toHaveBeenCalledTimes(1);
      const current = state.gpu[key as keyof typeof firstRound];
      expect(current).not.toBe(prevHandle);
    }
  });

  it('re-attaches the label director to the new renderers', () => {
    const state = makeState();
    buildSwapRenderers(state, 'bgra8unorm');
    const firstLabelRenderer = state.gpu.labelRenderer;
    const firstMarkerLineRenderer = state.gpu.markerLineRenderer;

    buildSwapRenderers(state, 'rgba16float');

    const attachRenderers = state.subsystems.labelDirector.attachRenderers as ReturnType<
      typeof vi.fn
    >;
    // Must be re-wired onto the SECOND-round instances — attaching the stale
    // first-round refs would leave the director drawing into destroyed
    // buffers, so labels/marker-lines would silently stop appearing. Read the
    // LAST call's actual args (not `not.toHaveBeenCalledWith`, which would
    // also inspect the first, legitimately-first-round call) and check both
    // that they match the final field values and that they are NOT the
    // first-round instances.
    const [lastLabelArg, lastMarkerArg] = attachRenderers.mock.calls.at(-1)!;
    expect(lastLabelArg).toBe(state.gpu.labelRenderer);
    expect(lastMarkerArg).toBe(state.gpu.markerLineRenderer);
    expect(lastLabelArg).not.toBe(firstLabelRenderer);
    expect(lastMarkerArg).not.toBe(firstMarkerLineRenderer);
  });
});
