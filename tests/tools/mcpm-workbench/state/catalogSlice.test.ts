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
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { UserCatalog } from '../../../../tools/mcpm-workbench/@types/UserCatalog';

const { actions, reducer } = catalogSlice;

const points: CatalogPoints = {
  positions: new Float32Array([1, 2, 3]),
  weight: new Float32Array([4]),
  count: 1,
  sources: [],
};

const weights = { weights: new Float32Array([1e6]), nanCount: 0, medianWeight: 10 };

const userCatalog: UserCatalog = {
  points,
  fileName: 'desi.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  weightStats: { min: 4, median: 4, max: 4 },
};

describe('catalogSlice user catalog', () => {
  it('loading a catalog switches every built-in source off and the catalog on', () => {
    const next = reducer(defaultCatalogSlice, actions.userCatalogLoaded(userCatalog));

    expect(next.userCatalog).toBe(userCatalog);
    expect(next.userCatalogOn).toBe(true);
    expect(next.sources).toEqual([]);
  });

  it('switching the loaded catalog off keeps it in the slice', () => {
    const loaded = reducer(defaultCatalogSlice, actions.userCatalogLoaded(userCatalog));

    const off = reducer(loaded, actions.setUserCatalogOn(false));

    expect(off.userCatalogOn).toBe(false);
    expect(off.userCatalog).toBe(userCatalog);
  });
});

describe('catalogSlice zero-point status', () => {
  it('catalogLoaded moves points into catalog state', () => {
    const loaded = reducer(
      defaultCatalogSlice,
      actions.catalogLoaded({ points, weights, bounds: null, userFile: null }),
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

    const loaded = reducer(
      failed,
      actions.catalogLoaded({ points, weights, bounds: null, userFile: null }),
    );

    expect(loaded.statusMessage).toBeNull();
  });
});
