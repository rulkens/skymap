/**
 * executeFrame — compute-row dispatch off the composed `state.computes` list,
 * replacing the deleted module-level COMPUTE table. `executeFrame.test.ts`
 * covers the render/composite machinery; this file pins the resolve-by-name
 * behaviour a Layer's contributed row exercises, mirroring `expandFrameOrder`'s
 * `resolve()`: an absent name drops rather than throws.
 */

import { describe, it, expect, vi } from 'vitest';
import { executeFrame } from '../../../../src/services/engine/frame/executeFrame';
import { flowCompute } from '../../../../src/layers/flow/computes/flowCompute';
import type { ContentCompute } from '../../../../src/@types/engine/frame/ContentCompute';
import type { ExecuteFrameArgs } from '../../../../src/@types/engine/frame/ExecuteFrameArgs';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FlowRuntime } from '../../../../src/layers/flow/types/FlowRuntime';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

/** A ready asset slot — `slotReady` reads `committed() !== null`. */
function readySlot() {
  return { committed: () => ({ kind: 'ready', req: undefined, value: undefined, loadedAtMs: 0 }) };
}

/**
 * `flowCompute` closes over its own Runtime, reading neither `state.gpu` nor
 * `state.assetSlots` — built directly here, exercising `executeFrame`'s
 * resolve-by-name dispatch with a real row.
 */
function makeRuntime(encodeCompute: ReturnType<typeof vi.fn>, ready: boolean): FlowRuntime {
  return {
    renderer: { label: 'flowFieldRenderer', encodeCompute },
    slot: ready ? readySlot() : { committed: () => null },
  } as unknown as FlowRuntime;
}

function makeCtx(): ReadyFrameContext {
  return { renderedTargets: new Set<string>(), nowMs: 12345 } as unknown as ReadyFrameContext;
}

function makeTiming(descriptorFor: ReturnType<typeof vi.fn> = vi.fn(() => undefined)) {
  return {
    enabled: false,
    beginFrame: vi.fn(),
    descriptorFor,
    endFrame: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as GpuTimingService;
}

function makeArgs(program: readonly FrameStep[], state: EngineState, timing?: GpuTimingService) {
  const args: ExecuteFrameArgs = {
    encoder: {} as GPUCommandEncoder,
    ctx: makeCtx(),
    state,
    program,
    strategy: 'merged',
    timing: timing ?? makeTiming(),
    swapView: {} as GPUTextureView,
  };
  return args;
}

describe('executeFrame — compute dispatch', () => {
  it('resolves a compute step against the composed state.computes list', () => {
    const encodeCompute = vi.fn();
    const state = {
      settings: { debug: { disabledPasses: {} }, flow: { enabled: true } },
    } as unknown as EngineState;
    state.computes = [flowCompute(makeRuntime(encodeCompute, true))];

    executeFrame(makeArgs([{ kind: 'compute', name: 'flow' }], state));

    expect(encodeCompute).toHaveBeenCalledTimes(1);
  });

  it('drops a compute step whose name no composed row claims, rather than throwing', () => {
    const state = {
      settings: { debug: { disabledPasses: {} } },
      computes: [] as readonly ContentCompute[],
    } as unknown as EngineState;

    expect(() => executeFrame(makeArgs([{ kind: 'compute', name: 'ghost' }], state))).not.toThrow();
  });

  // A compute step's toggle key is the SUFFIXED name (`computeTimingSlotName`),
  // never the bare step name — 'flow' also names the ribbon-draw pass, and one
  // checkbox must not disable both.
  it('a compute step toggles under its own suffixed name, not the bare step name', () => {
    const run = (disabledPasses: Record<string, boolean>): ReturnType<typeof vi.fn> => {
      const encodeCompute = vi.fn();
      const state = {
        settings: { debug: { disabledPasses }, flow: { enabled: true } },
      } as unknown as EngineState;
      state.computes = [flowCompute(makeRuntime(encodeCompute, true))];
      executeFrame(makeArgs([{ kind: 'compute', name: 'flow' }], state));
      return encodeCompute;
    };
    expect(run({ 'flow-compute': true })).not.toHaveBeenCalled();
    expect(run({ flow: true })).toHaveBeenCalledTimes(1);
  });

  // `descriptorFor` marks a slot live for the frame, and the query set keeps
  // its last write — so claiming for a step that then dispatches nothing would
  // make the panel report stale ticks as a live reading.
  it('claims a compute step’s timing slot only when the row actually dispatches', () => {
    const descriptorFor = vi.fn(() => undefined);
    const encodeCompute = vi.fn();
    const state = {
      settings: { debug: { disabledPasses: {} }, flow: { enabled: false } },
    } as unknown as EngineState;
    state.computes = [flowCompute(makeRuntime(encodeCompute, false))];

    executeFrame(makeArgs([{ kind: 'compute', name: 'flow' }], state, makeTiming(descriptorFor)));

    expect(descriptorFor).not.toHaveBeenCalled();
  });
});
