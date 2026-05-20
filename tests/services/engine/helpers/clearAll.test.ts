// tests/services/engine/helpers/clearAll.test.ts
/**
 * clearAll — unified selection teardown helper.
 *
 * Asserts:
 *   1. setSelected(null) is called when something was selected
 *      (selectionSubsystem itself fans out onSelectChange(null) +
 *      onPoiFocusChange(null), so this helper just kicks the slot
 *      and adds the focus-callback layer on top).
 *   2. onFocusChange(null) fires alongside the slot clear.
 *   3. Idempotent: skips both branches when nothing was selected.
 *   4. requestRender is called so the cleared frame paints.
 */

import { describe, it, expect, vi } from 'vitest';
import { clearAll } from '../../../../src/services/engine/helpers/clearAll';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';

function makeFixtures(opts: { hasSelection: boolean }) {
  const setSelected = vi.fn();
  const selected = vi.fn(() =>
    opts.hasSelection ? ({ kind: 'galaxy', source: 0, localIdx: 1 } as const) : null,
  );
  const requestRender = vi.fn();
  const onFocusChange = vi.fn();
  const state = {
    subsystems: {
      selection: { selected, setSelected },
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  const cb = {
    camera: { onFocusChange },
  } as unknown as EngineCallbacks;
  return { state, cb, setSelected, requestRender, onFocusChange };
}

describe('clearAll', () => {
  it('clears the selection slot + fires onFocusChange when something was selected', () => {
    const f = makeFixtures({ hasSelection: true });
    clearAll(f.state, f.cb);
    expect(f.setSelected).toHaveBeenCalledWith(null);
    expect(f.onFocusChange).toHaveBeenCalledWith(null);
  });

  it('skips both branches when nothing was selected', () => {
    const f = makeFixtures({ hasSelection: false });
    clearAll(f.state, f.cb);
    expect(f.setSelected).not.toHaveBeenCalled();
    expect(f.onFocusChange).not.toHaveBeenCalled();
  });

  it('calls requestRender so the cleared frame paints', () => {
    const f = makeFixtures({ hasSelection: true });
    clearAll(f.state, f.cb);
    expect(f.requestRender).toHaveBeenCalled();
  });
});
