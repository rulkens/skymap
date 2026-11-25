/**
 * watchCatalogSaga — only `resolveCatalogPointsPlan`'s priority order is
 * tested here: a real bug in it (e.g. a probe drop starting the network
 * fetch anyway) would ship undetected past a saga-plumbing test that just
 * asserts `takeLatest` was called. The saga's own wiring isn't tested — a
 * mis-wired trigger breaks the app in an impossible-to-miss way (no catalog
 * ever loads).
 */
import { describe, expect, it } from 'vitest';
import { resolveCatalogPointsPlan } from '../../../../../tools/mcpm-workbench/src/state/catalog/watchCatalogSaga';
import type { CatalogPoints } from '../../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { UserCatalog } from '../../../../../tools/mcpm-workbench/@types/UserCatalog';

const userPoints: CatalogPoints = {
  positions: new Float32Array([1, 2, 3]),
  weight: new Float32Array([4]),
  count: 1,
  sources: [],
};

const userCatalog: UserCatalog = {
  points: userPoints,
  fileName: 'desi.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  weightStats: { min: 4, median: 4, max: 4 },
};

describe('resolveCatalogPointsPlan', () => {
  it("plan carries the loaded catalog's points when it is on", () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: true, sources: ['sdss'], tier: 'medium' },
      false,
    );

    expect(plan).toEqual({ kind: 'load', sources: ['sdss'], tier: 'medium', userPoints });
  });

  it('plan carries null user points when it is off', () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: false, sources: ['sdss', 'glade'], tier: 'large' },
      false,
    );

    expect(plan).toEqual({
      kind: 'load',
      sources: ['sdss', 'glade'],
      tier: 'large',
      userPoints: null,
    });
  });

  it('the probe gate still wins', () => {
    const plan = resolveCatalogPointsPlan(
      { userCatalog, userCatalogOn: true, sources: ['sdss'], tier: 'medium' },
      true,
    );

    expect(plan).toEqual({ kind: 'synthetic' });
  });
});
