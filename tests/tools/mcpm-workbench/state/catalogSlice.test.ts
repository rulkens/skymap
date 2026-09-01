/**
 * catalogSlice — `catalogLoaded` is `watchCatalogSaga`'s completed-load
 * transition (replacing the old Viewport-dispatched `setCatalogLoaded`), so
 * it's exercised here directly rather than through a saga.
 */
import { describe, expect, it } from 'vitest';
import {
  catalogSlice,
  defaultCatalogSlice,
} from '../../../../tools/mcpm-workbench/src/state/catalog/catalogSlice';

const { actions, reducer } = catalogSlice;

const points = {
  positions: new Float32Array([1, 2, 3]),
  log10StellarMass: new Float32Array([4]),
  count: 1,
  sources: [],
};

const weights = { weights: new Float32Array([1e6]), nanCount: 0, medianLog10Mass: 10 };

describe('catalogSlice setPackedCatalog', () => {
  it("installs the override — pointCount/nanFillCount/bounds are catalogLoaded's job, not this reducer's", () => {
    const next = reducer(defaultCatalogSlice, actions.setPackedCatalog({ points }));

    expect(next.packedOverride).toBe(points);
    expect(next.pointCount).toBe(defaultCatalogSlice.pointCount);
    expect(next.catalogBoundsMpc).toBe(defaultCatalogSlice.catalogBoundsMpc);
  });
});

describe('catalogSlice zero-point status', () => {
  it('catalogLoaded clears a stale statusMessage — a real load must supersede it', () => {
    const stale = reducer(
      defaultCatalogSlice,
      actions.setCatalogStatusMessage('no catalog points'),
    );

    const loaded = reducer(stale, actions.catalogLoaded({ points, weights, bounds: null }));

    expect(loaded.statusMessage).toBeNull();
  });

  it('catalogLoaded moves points into catalog state', () => {
    const loaded = reducer(
      defaultCatalogSlice,
      actions.catalogLoaded({ points, weights, bounds: null }),
    );

    expect(loaded.points).toBe(points);
    expect(loaded.pointCount).toBe(1);
    expect(loaded.nanFillCount).toBe(0);
  });
});

describe('catalogSlice setCatalogBuildError', () => {
  it('routes the thrown error message into statusMessage verbatim', () => {
    const refusalMessage =
      "createMcpmHarness: trace needs 900000000 bytes, over this device's " +
      '268435456-byte limit. Largest long axis that fits: 512.';

    const next = reducer(defaultCatalogSlice, actions.setCatalogBuildError(refusalMessage));

    expect(next.statusMessage).toBe(refusalMessage);
  });

  it('a later successful load clears it, same as any other statusMessage', () => {
    const failed = reducer(defaultCatalogSlice, actions.setCatalogBuildError('over budget'));

    const loaded = reducer(failed, actions.catalogLoaded({ points, weights, bounds: null }));

    expect(loaded.statusMessage).toBeNull();
  });
});
