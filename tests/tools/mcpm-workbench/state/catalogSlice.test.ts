/**
 * catalogSlice — `packedDropId` must increment even across same-name drops
 * (review finding: the fork exports under one default filename every run),
 * so a re-drop is never mistaken for a no-op re-dispatch of the same action.
 * `catalogLoaded` is `watchCatalogSaga`'s completed-load transition
 * (replacing the old Viewport-dispatched `setCatalogLoaded`), so it's
 * exercised here directly rather than through a saga.
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
  it("installs the override and source name — pointCount/nanFillCount/bounds are catalogLoaded's job, not this reducer's", () => {
    const next = reducer(
      defaultCatalogSlice,
      actions.setPackedCatalog({ points, sourceName: 'sdssGalaxy_metadata.txt' }),
    );

    expect(next.packedOverride).toBe(points);
    expect(next.packedSourceName).toBe('sdssGalaxy_metadata.txt');
    expect(next.packedDropId).toBe(1);
    expect(next.pointCount).toBe(defaultCatalogSlice.pointCount);
    expect(next.catalogBoundsMpc).toBe(defaultCatalogSlice.catalogBoundsMpc);
  });

  it('bumps packedDropId on every install, even a same-filename re-drop', () => {
    const first = reducer(
      defaultCatalogSlice,
      actions.setPackedCatalog({ points, sourceName: 'sdssGalaxy_metadata.txt' }),
    );
    const second = reducer(
      first,
      actions.setPackedCatalog({ points, sourceName: 'sdssGalaxy_metadata.txt' }),
    );

    expect(second.packedDropId).toBe(2);
    expect(second.packedDropId).not.toBe(first.packedDropId);
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
  it('routes the thrown error message into statusMessage verbatim, marked error', () => {
    const refusalMessage =
      "createMcpmHarness: trace needs 900000000 bytes, over this device's " +
      '268435456-byte limit. Largest long axis that fits: 512.';

    const next = reducer(defaultCatalogSlice, actions.setCatalogBuildError(refusalMessage));

    expect(next.loadStatus).toBe('error');
    expect(next.statusMessage).toBe(refusalMessage);
  });

  it('a later successful load clears it, same as any other statusMessage', () => {
    const failed = reducer(defaultCatalogSlice, actions.setCatalogBuildError('over budget'));

    const loaded = reducer(failed, actions.catalogLoaded({ points, weights, bounds: null }));

    expect(loaded.loadStatus).toBe('loaded');
    expect(loaded.statusMessage).toBeNull();
  });
});
