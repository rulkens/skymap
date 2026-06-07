// tests/services/engine/helpers/clearAll.test.ts
/**
 * clearAll — unified dismiss helper (InfoCard × / Esc).
 *
 * Asserts:
 *   1. setSelected(null) + setFocused(null) both fire when something
 *      was selected or focused (each setter owns its own callback
 *      fan-out — onSelectChange / onFocusChange — so this helper just
 *      kicks both slots).
 *   2. The focus slot is cleared too, so dismissing collapses the
 *      cluster-focus fade (distinct from a bare empty-space click,
 *      which only deselects).
 *   3. Idempotent: skips both setters when nothing was selected OR
 *      focused.
 *   4. requestRender is called so the cleared frame paints.
 */

import { describe, it, expect, vi } from 'vitest';
import { clearAll } from '../../../../src/services/engine/helpers/clearAll';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeFixtures(opts: { hasSelection?: boolean; hasFocus?: boolean } = {}) {
  const setSelected = vi.fn();
  const setFocused = vi.fn();
  const selected = vi.fn(() =>
    opts.hasSelection ? ({ kind: 'galaxy', source: 0, localIdx: 1 } as const) : null,
  );
  const focused = vi.fn(() =>
    opts.hasFocus ? ({ kind: 'structure', id: 'virgo' } as const) : null,
  );
  const requestRender = vi.fn();
  const state = {
    subsystems: {
      selection: { selected, focused, setSelected, setFocused },
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, setSelected, setFocused, requestRender };
}

describe('clearAll', () => {
  it('clears both the selection and focus slots when something was selected', () => {
    const f = makeFixtures({ hasSelection: true });
    clearAll(f.state);
    expect(f.setSelected).toHaveBeenCalledWith(null);
    expect(f.setFocused).toHaveBeenCalledWith(null);
  });

  it('clears focus even when only the focus slot was set (no live selection)', () => {
    // Empty-space click earlier dropped the selection but left the fade
    // up; a subsequent Esc / × must still collapse it.
    const f = makeFixtures({ hasSelection: false, hasFocus: true });
    clearAll(f.state);
    expect(f.setFocused).toHaveBeenCalledWith(null);
  });

  it('skips both setters when nothing was selected or focused', () => {
    const f = makeFixtures({ hasSelection: false, hasFocus: false });
    clearAll(f.state);
    expect(f.setSelected).not.toHaveBeenCalled();
    expect(f.setFocused).not.toHaveBeenCalled();
  });

  it('calls requestRender so the cleared frame paints', () => {
    const f = makeFixtures({ hasSelection: true });
    clearAll(f.state);
    expect(f.requestRender).toHaveBeenCalled();
  });
});
