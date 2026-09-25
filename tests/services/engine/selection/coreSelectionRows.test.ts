import { describe, it, expect } from 'vitest';
import { coreSelectionRows } from '../../../../src/services/engine/selection/coreSelectionRows';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';

const EMPTY_DEPS: ResolveDeps = {
  structures: { byId: () => null, byCategory: () => [] },
};

describe('coreSelectionRows', () => {
  it('one row per core SelectionRef type; galaxyCatalog, star, zoneOfAvoidance and milkyWay are their own Layers’', () => {
    const types = coreSelectionRows(() => EMPTY_DEPS).map((r) => r.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(['body', 'structure'].sort());
  });
});
