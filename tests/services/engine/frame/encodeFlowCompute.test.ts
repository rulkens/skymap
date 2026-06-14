import { describe, it, expect, vi } from 'vitest';
import { encodeFlowCompute } from '../../../../src/services/engine/frame/encodeFlowCompute';
import type { FlowFieldRenderer } from '../../../../src/@types/rendering/FlowFieldRenderer';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';

/** A spy flow renderer — only `encodeCompute` is exercised by these tests. */
function spyRenderer(): FlowFieldRenderer & { encodeCompute: ReturnType<typeof vi.fn> } {
  return {
    label: 'flowFieldRenderer',
    upload: vi.fn(),
    maybeReseed: vi.fn(),
    isAnimating: vi.fn(() => false),
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

const encoder = {} as unknown as GPUCommandEncoder;

describe('encodeFlowCompute', () => {
  it('skips when the renderer is null', () => {
    // No renderer to call — must not throw, just return.
    expect(() =>
      encodeFlowCompute({ encoder, flowFieldRenderer: null, flow: flowStub(), loaded: true }),
    ).not.toThrow();
  });

  it('skips when flow.enabled is false', () => {
    const renderer = spyRenderer();
    encodeFlowCompute({
      encoder,
      flowFieldRenderer: renderer,
      flow: flowStub({ enabled: false }),
      loaded: true,
    });
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('skips when the cube is not loaded', () => {
    const renderer = spyRenderer();
    encodeFlowCompute({
      encoder,
      flowFieldRenderer: renderer,
      flow: flowStub({ enabled: true }),
      loaded: false,
    });
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('delegates to encodeCompute when enabled + loaded', () => {
    const renderer = spyRenderer();
    const flow = flowStub({ enabled: true });
    encodeFlowCompute({ encoder, flowFieldRenderer: renderer, flow, loaded: true });
    expect(renderer.encodeCompute).toHaveBeenCalledTimes(1);
    expect(renderer.encodeCompute).toHaveBeenCalledWith(encoder, flow);
  });
});
