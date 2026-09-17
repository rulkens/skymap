import { describe, it, expect, vi } from 'vitest';
import { flowCompute } from '../../../../src/services/engine/frame/computes/flowCompute';
import type { FlowFieldRenderer } from '../../../../src/@types/rendering/FlowFieldRenderer';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

/** A spy flow renderer — only `encodeCompute` is exercised by these tests. */
function spyRenderer(): FlowFieldRenderer & { encodeCompute: ReturnType<typeof vi.fn> } {
  return {
    label: 'flowFieldRenderer',
    upload: vi.fn(),
    reconcile: vi.fn(),
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

/** A ready asset slot — `slotReady` reads `committed() !== null`. */
function readySlot() {
  return { committed: () => ({ kind: 'ready', req: undefined, value: undefined, loadedAtMs: 0 }) };
}

/**
 * Assemble the minimal `PassState` `flowCompute.encode` reads: the renderer
 * handle off `gpu`, the toggle off `settings.flow`, and the load status off
 * `assetSlots.flow`.
 */
function stateStub(init: {
  renderer: FlowFieldRenderer | null;
  flow?: Partial<FlowSettings>;
  slot?: unknown;
}): PassState {
  return {
    gpu: { flowFieldRenderer: init.renderer },
    settings: { flow: flowStub(init.flow) },
    // `'slot' in init` (not `??`) so a caller can pass `slot: null` to model
    // the pre-wireSlots window — `null ?? readySlot()` would swallow it.
    assetSlots: { flow: 'slot' in init ? init.slot : readySlot() },
  } as unknown as PassState;
}

const encoder = {} as unknown as GPUCommandEncoder;

const NOW_MS = 12345;
const ctxStub = { nowMs: NOW_MS } as unknown as ReadyFrameContext;

describe('flowCompute', () => {
  it('skips when flow.enabled is false', () => {
    const renderer = spyRenderer();
    flowCompute.encode(
      encoder,
      ctxStub,
      stateStub({ renderer, flow: { enabled: false } }),
      () => ({}),
    );
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('skips when the cube is not loaded', () => {
    const renderer = spyRenderer();
    flowCompute.encode(encoder, ctxStub, stateStub({ renderer, slot: null }), () => ({}));
    expect(renderer.encodeCompute).not.toHaveBeenCalled();
  });

  it('delegates to encodeCompute when enabled + loaded, forwarding nowMs and the timing slot', () => {
    const renderer = spyRenderer();
    const state = stateStub({ renderer, flow: { enabled: true } });
    // The step's own GPU-timing slot rides through to the renderer — without it
    // the prelude's dispatch is untimed and its cost drains into whichever
    // render pass opens next, reading there as that pass regressing.
    const claim = () => ({});
    flowCompute.encode(encoder, ctxStub, state, claim);
    expect(renderer.encodeCompute).toHaveBeenCalledTimes(1);
    expect(renderer.encodeCompute).toHaveBeenCalledWith(
      encoder,
      (state as unknown as { settings: { flow: FlowSettings } }).settings.flow,
      NOW_MS,
      claim,
    );
  });
});
