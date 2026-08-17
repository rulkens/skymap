/**
 * applySwapFormat tests — the pre-bootstrap guard, the half-initialised-engine
 * guard, the repeated-dispatch no-op, the reconfigure→repoint→rebuild call
 * order (a pipeline baked against the wrong colour-target format fails
 * WebGPU validation, per the plan's live-browser probe — see
 * task-7-brief.md), and the render-request that wakes the passive scheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RenderTargetSpec } from '../../../../src/@types/engine/frame/RenderTargetSpec';

vi.mock('../../../../src/services/engine/phases/buildSwapRenderers', () => ({
  buildSwapRenderers: vi.fn(),
}));

// Imported after the mock so applySwapFormat picks up the stub.
import { applySwapFormat } from '../../../../src/services/engine/phases/applySwapFormat';
import { buildSwapRenderers } from '../../../../src/services/engine/phases/buildSwapRenderers';

function makeSwapSpec(format: GPUTextureFormat): RenderTargetSpec {
  return { id: 'swap', format, depth: null, scale: 1 };
}

function makeState(liveFormat: GPUTextureFormat, requestRender: () => void) {
  return {
    gpu: {
      renderTargets: { specs: [makeSwapSpec(liveFormat)], setSwapFormat: vi.fn() },
      uiCtx: { device: {}, context: { configure: vi.fn() }, canvas: {} },
    },
    subsystems: { scheduler: { requestRender } },
  } as unknown as EngineState;
}

describe('applySwapFormat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not throw when dispatched before renderTargets/uiCtx exist (boot ordering)', () => {
    // Mirrors the real boot sequence: initGpu dispatches
    // engineHdrCapabilityChanged (device.ts's watchHdrCapability snapshot)
    // before it constructs either handle — both are still null.
    const state = { gpu: { renderTargets: null, uiCtx: null } } as unknown as EngineState;

    expect(() => applySwapFormat(state, 'bgra8unorm')).not.toThrow();
  });

  it('does not throw and does not reconfigure when uiCtx exists but fontAtlases is still null (half-initialised engine)', () => {
    // Mirrors a leaked watchHdrCapability listener firing between initGpu's
    // uiCtx assignment and its (later) loadFontAtlases await landing: without
    // this guard the call reaches buildSwapRenderers, which dereferences
    // `state.gpu.fontAtlases!` and throws inside a takeEvery worker.
    const configure = vi.fn();
    const setSwapFormat = vi.fn();
    const state = {
      gpu: {
        renderTargets: { specs: [makeSwapSpec('bgra8unorm')], setSwapFormat },
        uiCtx: { device: {}, context: { configure }, canvas: {} },
        fontAtlases: null,
      },
      subsystems: { scheduler: { requestRender: vi.fn() } },
    } as unknown as EngineState;

    expect(() => applySwapFormat(state, 'rgba16float')).not.toThrow();
    expect(configure).not.toHaveBeenCalled();
    expect(setSwapFormat).not.toHaveBeenCalled();
    expect(buildSwapRenderers).not.toHaveBeenCalled();
  });

  it('is a no-op when the desired format already matches the live format', () => {
    const configure = vi.fn();
    const setSwapFormat = vi.fn();
    const state = {
      gpu: {
        renderTargets: { specs: [makeSwapSpec('bgra8unorm')], setSwapFormat },
        uiCtx: { device: {}, context: { configure }, canvas: {} },
      },
    } as unknown as EngineState;

    applySwapFormat(state, 'bgra8unorm');

    expect(configure).not.toHaveBeenCalled();
    expect(setSwapFormat).not.toHaveBeenCalled();
  });

  it('reconfigures the context, then repoints the swap spec, then rebuilds — in that order', () => {
    const calls: string[] = [];
    const configure = vi.fn(() => calls.push('configure'));
    const setSwapFormat = vi.fn(() => calls.push('setSwapFormat'));
    vi.mocked(buildSwapRenderers).mockImplementation(() => calls.push('buildSwapRenderers'));
    const state = {
      gpu: {
        renderTargets: { specs: [makeSwapSpec('bgra8unorm')], setSwapFormat },
        uiCtx: { device: {}, context: { configure }, canvas: {} },
      },
      subsystems: { scheduler: { requestRender: vi.fn() } },
    } as unknown as EngineState;

    applySwapFormat(state, 'rgba16float');

    expect(calls).toEqual(['configure', 'setSwapFormat', 'buildSwapRenderers']);
  });

  // The reconfigure schedules no frame on its own: context.configure() swaps
  // the drawing buffer, and neither trigger (setHdrEnabled,
  // engineHdrCapabilityChanged) is a WAKE_ROUTE (see watchWakeSaga). With the
  // clock paused, missing this leaves the canvas blank until the next
  // interaction rather than merely flashing.

  it('requests a render when the format actually changes', () => {
    const requestRender = vi.fn();
    const state = makeState('bgra8unorm', requestRender);

    applySwapFormat(state, 'rgba16float');

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('does not request a render when the desired format already matches live', () => {
    const requestRender = vi.fn();
    const state = makeState('bgra8unorm', requestRender);

    applySwapFormat(state, 'bgra8unorm');

    expect(requestRender).not.toHaveBeenCalled();
  });

  // The toneMapping spread IS the feature: it's what makes the swap chain
  // display extended range instead of clamping at paper white. Call-order and
  // call-count assertions above don't touch the argument shape, so a mutated
  // or inverted conditional would pass every test above this one.

  it('going to rgba16float requests extended tone mapping alongside the right device/format/alphaMode', () => {
    const device = {};
    const configure = vi.fn();
    const state = {
      gpu: {
        renderTargets: { specs: [makeSwapSpec('bgra8unorm')], setSwapFormat: vi.fn() },
        uiCtx: { device, context: { configure }, canvas: {} },
      },
      subsystems: { scheduler: { requestRender: vi.fn() } },
    } as unknown as EngineState;

    applySwapFormat(state, 'rgba16float');

    expect(configure).toHaveBeenCalledWith({
      device,
      format: 'rgba16float',
      alphaMode: 'premultiplied',
      toneMapping: { mode: 'extended' },
    });
  });

  it('going to the preferred SDR format requests no toneMapping key at all', () => {
    const device = {};
    const configure = vi.fn();
    const state = {
      gpu: {
        renderTargets: { specs: [makeSwapSpec('rgba16float')], setSwapFormat: vi.fn() },
        uiCtx: { device, context: { configure }, canvas: {} },
      },
      subsystems: { scheduler: { requestRender: vi.fn() } },
    } as unknown as EngineState;

    applySwapFormat(state, 'bgra8unorm');

    // Object.keys, not toHaveProperty/toEqual: those treat an explicit
    // `toneMapping: undefined` as equivalent to the key being absent, and an
    // explicit undefined is a materially different request to the browser
    // than omitting the key.
    const call = configure.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toEqual({ device, format: 'bgra8unorm', alphaMode: 'premultiplied' });
    expect(Object.keys(call)).not.toContain('toneMapping');
  });
});
