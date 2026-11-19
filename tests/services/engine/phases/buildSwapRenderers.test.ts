/**
 * buildSwapRenderers — the re-runnable seam for the eight
 * `rebuildOnSwapFormat` renderers `GPU_HANDLE_ROWS` flags. Each factory
 * builds a real `GPURenderPipeline` against `device`, which JSDOM's stub
 * `GPUDevice` can't service — mocked so the run completes and its
 * `state.gpu.*` writes can be observed directly.
 * Importing this file also imports the REST of `GPU_HANDLE_ROWS`'s
 * factories transitively; those stay unmocked safely because only the 8
 * flagged rows' `construct` ever runs here.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeStub() {
  return { destroy: vi.fn() };
}

vi.mock('../../../../src/services/gpu/renderers/labels/labelRenderer', () => ({
  createLabelRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/devTools/debugLineRenderer', () => ({
  createDebugLineRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/letterbox/letterboxRenderer', () => ({
  createLetterboxRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/renderers/selectionRing/selectionRingRenderer', () => ({
  createSelectionRingRenderer: vi.fn(() => makeStub()),
}));
vi.mock('../../../../src/services/gpu/passes/pickDebugOverlay', () => ({
  createPickDebugOverlay: vi.fn(() => makeStub()),
}));

// Imported AFTER the mocks so buildSwapRenderers picks up the mocked factories.
import { buildSwapRenderers } from '../../../../src/services/engine/phases/buildSwapRenderers';

/**
 * The six handle keys `buildSwapRenderers` owns on `state.gpu.*`, plus the
 * `uiCtx` / `fontAtlases` inputs it reads, plus one NOT-flagged row
 * (`label3DRenderer`) — the untouched-identity proof's subject.
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
      labelRendererCosmo: null,
      debugLineRenderer: null,
      letterboxRenderer: null,
      selectionRingRenderer: null,
      pickDebugOverlay: null,
      labelRendererNear: null,
      label3DRenderer: makeStub(),
    },
  } as unknown as EngineState;
}

describe('buildSwapRenderers', () => {
  it('destroys the previous renderers before replacing them', () => {
    const state = makeState();
    buildSwapRenderers(state, 'bgra8unorm');

    const firstRound = {
      labelRendererCosmo: state.gpu.labelRendererCosmo,
      debugLineRenderer: state.gpu.debugLineRenderer,
      letterboxRenderer: state.gpu.letterboxRenderer,
      selectionRingRenderer: state.gpu.selectionRingRenderer,
      pickDebugOverlay: state.gpu.pickDebugOverlay,
      labelRendererNear: state.gpu.labelRendererNear,
    } as const;

    buildSwapRenderers(state, 'rgba16float');

    for (const [key, prevHandle] of Object.entries(firstRound)) {
      const stub = prevHandle as unknown as { destroy: ReturnType<typeof vi.fn> };
      expect(stub.destroy).toHaveBeenCalledTimes(1);
      const current = state.gpu[key as keyof typeof firstRound];
      expect(current).not.toBe(prevHandle);
    }
  });

  it("a non-swap-format row's handle identity is unchanged across a rebuild", () => {
    const state = makeState();
    const label3DRenderer = state.gpu.label3DRenderer;

    buildSwapRenderers(state, 'bgra8unorm');
    buildSwapRenderers(state, 'rgba16float');

    // Proves the rebuildOnSwapFormat filter is exact, not a superset: a row
    // absent from GPU_HANDLE_ROWS's flagged 8 must survive two rebuilds
    // untouched — same reference, destroy() never called.
    const stub = label3DRenderer as unknown as { destroy: ReturnType<typeof vi.fn> };
    expect(state.gpu.label3DRenderer).toBe(label3DRenderer);
    expect(stub.destroy).not.toHaveBeenCalled();
  });
});
