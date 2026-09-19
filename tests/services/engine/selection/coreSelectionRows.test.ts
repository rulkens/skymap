import { describe, it, expect } from 'vitest';
import { coreSelectionRows } from '../../../../src/services/engine/selection/coreSelectionRows';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';

const EMPTY_DEPS: ResolveDeps = {
  structures: { byId: () => null, byCategory: () => [] },
  stars: { current: () => null },
};

describe('coreSelectionRows', () => {
  it('one row per core SelectionRef type; galaxyCatalog and zoneOfAvoidance are their own Layers’', () => {
    const types = coreSelectionRows(() => EMPTY_DEPS).map((r) => r.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(['body', 'milkyWay', 'star', 'structure'].sort());
  });
});
