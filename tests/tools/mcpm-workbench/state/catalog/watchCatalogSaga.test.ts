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
import { Source } from '../../../../../src/data/source';
import type { CatalogPoints } from '../../../../../tools/mcpm-workbench/@types/CatalogPoints';

const packedPoints: CatalogPoints = {
  positions: new Float32Array([1, 2, 3]),
  log10StellarMass: new Float32Array([4]),
  count: 1,
  sources: [Source.SDSS],
};

describe('resolveCatalogPointsPlan', () => {
  it('a packed override wins outright, even under the probe gate', () => {
    const plan = resolveCatalogPointsPlan(
      { packedOverride: packedPoints, sources: [Source.SDSS], tier: 'medium' },
      true,
    );

    expect(plan).toEqual({ kind: 'packedOverride', points: packedPoints });
  });

  it('the probe gate wins over a network fetch when there is no override', () => {
    const plan = resolveCatalogPointsPlan(
      { packedOverride: null, sources: [Source.SDSS], tier: 'medium' },
      true,
    );

    expect(plan).toEqual({ kind: 'synthetic' });
  });

  it('falls through to the network fetch with the live sources/tier', () => {
    const plan = resolveCatalogPointsPlan(
      { packedOverride: null, sources: [Source.SDSS, Source.Glade], tier: 'large' },
      false,
    );

    expect(plan).toEqual({ kind: 'network', sources: [Source.SDSS, Source.Glade], tier: 'large' });
  });
});
