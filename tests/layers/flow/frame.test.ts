/**
 * flow's `flowPlanner` — calls `reconcile` once per call with the live
 * settings, and votes: awake while its handed value is above 0 and the cube is
 * loaded (the switch alone decides nothing), never settling.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowPlanner } from '../../../src/layers/flow/frame';
import type { FlowRuntime } from '../../../src/layers/flow/@types/FlowRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

function committedSlot(loaded: boolean) {
  return { committed: () => (loaded ? { kind: 'ready', value: undefined } : null) };
}

function makeRuntime(loaded: boolean, reconcile = vi.fn()): FlowRuntime {
  return { renderer: { reconcile }, slot: committedSlot(loaded) } as unknown as FlowRuntime;
}

function stateStub(enabled = true): PassState {
  return { settings: { flow: { enabled, mode: 'advect', count: 4 } } } as unknown as PassState;
}

const snapshotStub = {} as ReadyFrameContext;
const viewsStub = [{} as FrameView];

describe('flow frame planner', () => {
  it('calls reconcile once with the live flow settings', () => {
    const reconcile = vi.fn();
    const runtime = makeRuntime(true, reconcile);
    const state = stateStub(true);
    flowPlanner(runtime).plan(snapshotStub, viewsStub, state, 1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(state.settings.flow);
  });

  it('votes awake exactly while the handed value is above 0 AND the cube is loaded', () => {
    const awake = (loaded: boolean, fade: number, enabled = true) =>
      flowPlanner(makeRuntime(loaded)).plan(snapshotStub, viewsStub, stateStub(enabled), fade)
        .awake;
    expect(awake(true, 1)).toBe(true);
    expect(awake(false, 1)).toBe(false);
    expect(awake(true, 0)).toBe(false);
    // Switched off but still fading out: the frame loop must keep ticking the fade.
    expect(awake(true, 0.4, false)).toBe(true);
  });

  it('never votes settling — flow draws in no capture roster, so a sky bake stays valid', () => {
    expect(
      flowPlanner(makeRuntime(true)).plan(snapshotStub, viewsStub, stateStub(), 1).settling,
    ).toBe(false);
  });
});
