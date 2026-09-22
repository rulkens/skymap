/**
 * flow's `flowPlanner` — calls `reconcile` once per call with the live
 * settings, and votes: awake on the term `shouldKeepTicking` used to read off
 * core (`settings.flow.enabled && slotReady(assetSlots.flow)`), never settling.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowPlanner } from '../../../src/layers/flow/frame';
import type { FlowRuntime } from '../../../src/layers/flow/@types/FlowRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import { planOnce } from '../../helpers/engine/planOnce';

function committedSlot(loaded: boolean) {
  return { committed: () => (loaded ? { kind: 'ready', value: undefined } : null) };
}

function makeRuntime(loaded: boolean, reconcile = vi.fn()): FlowRuntime {
  return { renderer: { reconcile }, slot: committedSlot(loaded) } as unknown as FlowRuntime;
}

function stateStub(enabled: boolean): PassState {
  return { settings: { flow: { enabled, mode: 'advect', count: 4 } } } as unknown as PassState;
}

const snapshotStub = {} as ReadyFrameContext;
const viewsStub = [{} as FrameView];

describe('flow frame planner', () => {
  it('calls reconcile once with the live flow settings', () => {
    const reconcile = vi.fn();
    const runtime = makeRuntime(true, reconcile);
    const state = stateStub(true);
    planOnce(flowPlanner(runtime), snapshotStub, viewsStub, state);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(state.settings.flow);
  });

  it('votes awake exactly while enabled AND the cube is loaded', () => {
    expect(
      planOnce(flowPlanner(makeRuntime(true)), snapshotStub, viewsStub, stateStub(true)).awake,
    ).toBe(true);
    expect(
      planOnce(flowPlanner(makeRuntime(false)), snapshotStub, viewsStub, stateStub(true)).awake,
    ).toBe(false);
    expect(
      planOnce(flowPlanner(makeRuntime(true)), snapshotStub, viewsStub, stateStub(false)).awake,
    ).toBe(false);
  });

  it('never votes settling — flow draws in no capture roster, so a sky bake stays valid', () => {
    expect(
      planOnce(flowPlanner(makeRuntime(true)), snapshotStub, viewsStub, stateStub(true)).settling,
    ).toBe(false);
  });
});
