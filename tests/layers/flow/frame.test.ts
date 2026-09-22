/**
 * flow's `frame` — calls `reconcile` once per call with the live settings, and
 * votes: awake on the term `shouldKeepTicking` used to read off core
 * (`settings.flow.enabled && slotReady(assetSlots.flow)`), never settling.
 */
import { describe, it, expect, vi } from 'vitest';
import { frame } from '../../../src/layers/flow/frame';
import type { FlowRuntime } from '../../../src/layers/flow/@types/FlowRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';

function committedSlot(loaded: boolean) {
  return { committed: () => (loaded ? { kind: 'ready', value: undefined } : null) };
}

function makeRuntime(loaded: boolean, reconcile = vi.fn()): FlowRuntime {
  return { renderer: { reconcile }, slot: committedSlot(loaded) } as unknown as FlowRuntime;
}

function stateStub(enabled: boolean): PassState {
  return { settings: { flow: { enabled, mode: 'advect', count: 4 } } } as unknown as PassState;
}

const ctxStub = {} as FrameView;

describe('flow frame', () => {
  it('calls reconcile once with the live flow settings', () => {
    const reconcile = vi.fn();
    const runtime = makeRuntime(true, reconcile);
    const state = stateStub(true);
    frame(runtime)([ctxStub], state);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(state.settings.flow);
  });

  it('votes awake exactly while enabled AND the cube is loaded', () => {
    expect(frame(makeRuntime(true))([ctxStub], stateStub(true)).awake).toBe(true);
    expect(frame(makeRuntime(false))([ctxStub], stateStub(true)).awake).toBe(false);
    expect(frame(makeRuntime(true))([ctxStub], stateStub(false)).awake).toBe(false);
  });

  it('never votes settling — flow draws in no capture roster, so a sky bake stays valid', () => {
    expect(frame(makeRuntime(true))([ctxStub], stateStub(true)).settling).toBe(false);
  });
});
