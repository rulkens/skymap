import { describe, it, expect, vi } from 'vitest';
import { encodeFlowCompute } from '../../../../src/services/engine/frame/encodeFlowCompute';
import type { FlowFieldRenderer } from '../../../../src/@types/rendering/FlowFieldRenderer';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

/** A spy flow renderer — only `encodeCompute` is exercised by these tests. */
function spyRenderer(): FlowFieldRenderer & { encodeCompute: ReturnType<typeof vi.fn> } {
  return {
    label: 'flowFieldRenderer',
    upload: vi.fn(),
    maybeReseed: vi.fn(),
    encodeCompute: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  } as unknown as FlowFieldRenderer & { encodeCompute: ReturnType<typeof vi.fn> };
}

function flowStub(over: Partial<FlowSettings> = {}): FlowSettings {
  return {
    enabled: true,
    mode: 'advect',
    intensity: 0.7,
    count: 40000,
    trail: 0.003,
    flowSpeed: 0.06,
    densityBias: 1,
    wander: 0.15,
    boundaryFadeWidth: 0.1,
    ...over,
  };
}

/** A ready asset slot — `slotReady` reads `state().kind === 'ready'`. */
function readySlot() {
  return { state: () => ({ kind: 'ready' }) };
}

/**
 * Assemble the minimal `EngineState` the refactored `encodeFlowCompute` reads:
 * the renderer handle off `gpu`, the toggle off `settings.flow`, and the load
 * status off `assetSlots.flow`.
 */
function stateStub(init: {
  renderer: FlowFieldRenderer | null;
  flow?: Partial<FlowSettings>;
  slot?: unknown;
}): EngineState {
  return {
    gpu: { flowFieldRenderer: init.renderer },
    settings: { flow: flowStub(init.flow) },
    // `'slot' in init` (not `??`) so a caller can pass `slot: null` to model
    // the pre-wireSlots window — `null ?? readySlot()` would swallow it.
    assetSlots: { flow: 'slot' in init ? init.slot : readySlot() },
  } as unknown as EngineState;
}

const encoder = {} as unknown as GPUCommandEncoder;

const NOW_MS = 12345;

describe('encodeFlowCompute', () => {
  it('skips when the renderer is null', () => {
    // No renderer to call — must not throw, just return.
    expect(() => encodeFlowCompute(encoder, stateStub({ renderer: null }), NOW_MS)).not.toThrow();
  });

  it('skips when flow.enabled is false', () => {
    const renderer = spyRenderer();
    encodeFlowCompute(encoder, stateStub({ renderer, flow: { enabled: false } }), NOW_MS);
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('skips when the cube is not loaded', () => {
    const renderer = spyRenderer();
    encodeFlowCompute(encoder, stateStub({ renderer, slot: null }), NOW_MS);
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('delegates to encodeCompute when enabled + loaded, forwarding nowMs', () => {
    const renderer = spyRenderer();
    const state = stateStub({ renderer, flow: { enabled: true } });
    encodeFlowCompute(encoder, state, NOW_MS);
    expect(renderer.encodeCompute).toHaveBeenCalledTimes(1);
    expect(renderer.encodeCompute).toHaveBeenCalledWith(encoder, state.settings.flow, NOW_MS);
  });
});
