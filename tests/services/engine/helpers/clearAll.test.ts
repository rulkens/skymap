// tests/services/engine/helpers/clearAll.test.ts
/**
 * clearAll — unified selection teardown helper.
 *
 * Mirrors the testing style of commitFocus.test.ts.  Asserts:
 *   1. Galaxy selection cleared (when present) + onFocusChange(null) fired.
 *   2. POI selection cleared + onPoiFocusChange(null) fired.
 *   3. requestRender called at least once for the combined teardown
 *      (both teardowns paint in the same frame).
 *   4. Idempotent: with neither selected, still fires the POI teardown
 *      (mirrors the existing clearPoiFocus semantic — it doesn't gate
 *      on presence), but skips the galaxy callback (current
 *      clearSelection only fires onFocusChange when something was set).
 *   5. Order: galaxy teardown first, POI teardown second.
 */

import { describe, it, expect, vi } from 'vitest';
import { clearAll } from '../../../../src/services/engine/helpers/clearAll';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';

function makeFixtures(opts: { hasGalaxySelection: boolean }) {
  const setSelected = vi.fn();
  const setSelectedPoi = vi.fn();
  const selected = vi.fn(() =>
    opts.hasGalaxySelection ? { source: 0, localIdx: 1 } : null,
  );
  const requestRender = vi.fn();
  const onFocusChange = vi.fn();
  const onPoiFocusChange = vi.fn();
  const state = {
    subsystems: {
      selection: { selected, setSelected },
      pois: { setSelectedPoi },
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  const cb = {
    camera: { onFocusChange, onPoiFocusChange },
  } as unknown as EngineCallbacks;
  return {
    state,
    cb,
    setSelected,
    setSelectedPoi,
    requestRender,
    onFocusChange,
    onPoiFocusChange,
  };
}

describe('clearAll', () => {
  it('clears galaxy + POI when galaxy is selected', () => {
    const f = makeFixtures({ hasGalaxySelection: true });
    clearAll(f.state, f.cb);
    expect(f.setSelected).toHaveBeenCalledWith(null);
    expect(f.onFocusChange).toHaveBeenCalledWith(null);
    expect(f.setSelectedPoi).toHaveBeenCalledWith(null);
    expect(f.onPoiFocusChange).toHaveBeenCalledWith(null);
  });

  it('skips galaxy-clear branch when nothing is selected, still fires POI clear', () => {
    const f = makeFixtures({ hasGalaxySelection: false });
    clearAll(f.state, f.cb);
    expect(f.setSelected).not.toHaveBeenCalled();
    expect(f.onFocusChange).not.toHaveBeenCalled();
    expect(f.setSelectedPoi).toHaveBeenCalledWith(null);
    expect(f.onPoiFocusChange).toHaveBeenCalledWith(null);
  });

  it('calls requestRender at least once (combined teardown is one render)', () => {
    const f = makeFixtures({ hasGalaxySelection: true });
    clearAll(f.state, f.cb);
    expect(f.requestRender).toHaveBeenCalled();
  });

  it('fires galaxy teardown BEFORE POI teardown (observer sees clean collapse)', () => {
    const f = makeFixtures({ hasGalaxySelection: true });
    const order: string[] = [];
    f.setSelected.mockImplementation(() => order.push('galaxy'));
    f.setSelectedPoi.mockImplementation(() => order.push('poi'));
    clearAll(f.state, f.cb);
    expect(order).toEqual(['galaxy', 'poi']);
  });
});
