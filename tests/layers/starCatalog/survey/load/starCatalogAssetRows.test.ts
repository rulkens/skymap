/**
 * starCatalogAssetRows — the Layer's request cases.
 */

import { describe, it, expect } from 'vitest';

import { starCatalogAssetRows } from '../../../../../src/layers/starCatalog/survey/load/starCatalogAssetRows';
import { expandCompanionRows } from '../../../../../src/utils/loading/expandCompanionRows';
import { Source } from '../../../../../src/data/source';
import type { AssetKey } from '../../../../../src/@types/loading/AssetKey';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';

// The rows as the demand loop sees them — `createLayers` folds companions over
// core's authored table plus every Layer's, and the fold is per-key local.
const RUNTIME = { catalogs: new Map(), famousStarsMeta: {} } as unknown as StarCatalogRuntime;
const EXPANDED_ROWS = expandCompanionRows(starCatalogAssetRows(RUNTIME));

function rowFor(key: AssetKey) {
  const r = EXPANDED_ROWS.find((row) => row.key === key);
  if (!r) throw new Error(`no star asset row for key ${String(key)}`);
  return r;
}

describe('starCatalogAssetRows req builders', () => {
  it("the famous-stars-meta row's request is undefined at every tier", () => {
    const row = rowFor('famousStarsMeta');
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(row.req(tier)).toBeUndefined();
    }
  });

  it('gaiaStars carries its source + tier', () => {
    expect(rowFor(Source.GaiaStars).req('medium')).toEqual({
      source: Source.GaiaStars,
      tier: 'medium',
    });
  });
});
