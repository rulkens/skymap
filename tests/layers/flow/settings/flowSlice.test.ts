/**
 * flowSlice — the partial-merge behaviour `settingsSlice.test.ts` used to pin
 * at the composed-root level. Kept here: an untouched leaf surviving a patch
 * is real behaviour a bug in the merge could silently break.
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
