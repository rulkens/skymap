/**
 * A partial `setFlowTuning` patch must leave every knob it omits alone — the
 * reducer writes cluster-deep, so a merge bug silently resets unnamed knobs.
 */
import { describe, it, expect } from 'vitest';

import { flowSlice, setFlow } from '../../../../src/layers/flow/settings/flowSlice';

describe('flowSlice', () => {
  it('setFlow partial-merges leaf-by-leaf', () => {
    const before = flowSlice.getInitialState();
    const next = flowSlice.reducer(before, setFlow({ flowSpeed: 9.5 }));
    expect(next.flowSpeed).toBe(9.5);
    // An untouched leaf is preserved.
    expect(next.count).toBe(before.count);
  });
});
