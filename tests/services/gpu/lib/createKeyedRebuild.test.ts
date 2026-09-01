import { describe, expect, it } from 'vitest';

import { createKeyedRebuild } from '../../../../src/services/gpu/lib/createKeyedRebuild';

/** A gate whose `wanted` axis the test drives independently of `invalidate`. */
function harness(initiallyWanted: boolean) {
  const state = { wanted: initiallyWanted, builds: 0 };
  const gate = createKeyedRebuild({
    wanted: () => state.wanted,
    build: () => {
      state.builds++;
    },
  });
  return { state, gate };
}

describe('createKeyedRebuild', () => {
  it('does not build while nothing wants the value', () => {
    const { state, gate } = harness(false);
    gate.invalidate();
    gate.ensureFresh();
    gate.ensureFresh();
    gate.ensureFresh();
    expect(state.builds).toBe(0);
  });

  it('builds once per invalidation, not once per ensureFresh', () => {
    const { state, gate } = harness(true);
    gate.invalidate();
    gate.ensureFresh();
    gate.ensureFresh();
    gate.ensureFresh();
    expect(state.builds).toBe(1);

    gate.invalidate();
    gate.ensureFresh();
    expect(state.builds).toBe(2);
  });

  it('retains an invalidation raised while nothing wanted the value', () => {
    // The bug this exists for: an `ensureFresh` that clears the dirty flag on
    // its way out of the unwanted branch silently drops the invalidation, so
    // the consumer that turns on next sees the pre-invalidation value.
    const { state, gate } = harness(false);
    gate.invalidate();
    gate.ensureFresh();
    state.wanted = true;
    gate.ensureFresh();
    expect(state.builds).toBe(1);
  });

  it('reports consumer liveness for the caller to gate its draw on', () => {
    const { state, gate } = harness(true);
    // Independent of the dirty flag: true on the call that builds and on the
    // call that finds nothing to do, false only when no consumer wants it.
    expect(gate.ensureFresh()).toBe(true);
    expect(gate.ensureFresh()).toBe(true);
    state.wanted = false;
    expect(gate.ensureFresh()).toBe(false);
    gate.invalidate();
    expect(gate.ensureFresh()).toBe(false);
    state.wanted = true;
    expect(gate.ensureFresh()).toBe(true);
  });
});
