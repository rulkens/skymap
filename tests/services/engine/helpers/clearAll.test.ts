// tests/services/engine/helpers/clearAll.test.ts
/**
 * clearAll — unified dismiss helper (InfoCard × / Esc).
 *
 * Asserts:
 *   1. setSelected(null) + setFocused(null) always fire (setters own
 *      their own dedupe and render wake — callers don't guard).
 *   2. Focus is cleared so dismissing collapses the cluster-focus fade
 *      (distinct from a bare empty-space click, which only deselects).
 */

import { describe, it, expect, vi } from 'vitest';
import { clearAll } from '../../../../src/services/engine/helpers/clearAll';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeFixtures() {
  const setSelected = vi.fn();
  const setFocused = vi.fn();
  const state = {
    subsystems: {
      selection: { setSelected, setFocused },
    },
  } as unknown as EngineState;
  return { state, setSelected, setFocused };
}

describe('clearAll', () => {
  it('always calls setSelected(null) and setFocused(null)', () => {
    // Both setters own their own dedupe — callers pass null unconditionally.
    const f = makeFixtures();
    clearAll(f.state);
    expect(f.setSelected).toHaveBeenCalledWith(null);
    expect(f.setFocused).toHaveBeenCalledWith(null);
  });

  it('calls both setters so focus collapses alongside selection', () => {
    // Dismissing must clear the cluster-fade focus slot, not just deselect.
    const f = makeFixtures();
    clearAll(f.state);
    expect(f.setSelected).toHaveBeenCalledTimes(1);
    expect(f.setFocused).toHaveBeenCalledTimes(1);
  });
});
