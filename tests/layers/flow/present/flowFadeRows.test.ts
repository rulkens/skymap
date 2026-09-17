/**
 * flowFadeRows — the fade row's `guard` is the renderer's own `fieldLoaded()`,
 * not a `state.gpu` reach (unguarded, a tour reveal whose download is still in
 * flight would fade over an empty renderer — see the row's own header).
 */
import { describe, it, expect } from 'vitest';
import { flowFadeRows } from '../../../../src/layers/flow/present/flowFadeRows';
import type { FlowRuntime } from '../../../../src/layers/flow/types/FlowRuntime';

function makeRuntime(fieldLoaded: boolean): FlowRuntime {
  return { renderer: { fieldLoaded: () => fieldLoaded } } as unknown as FlowRuntime;
}

describe('flowFadeRows', () => {
  it("guard mirrors the renderer's fieldLoaded(), independent of state", () => {
    const loaded = flowFadeRows(makeRuntime(true))[0]!;
    const unloaded = flowFadeRows(makeRuntime(false))[0]!;
    expect(loaded.guard?.({} as never, undefined)).toBe(true);
    expect(unloaded.guard?.({} as never, undefined)).toBe(false);
  });
});
