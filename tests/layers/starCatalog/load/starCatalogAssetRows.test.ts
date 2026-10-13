/**
 * starCatalogAssetRows — the Layer's demand + request cases. The registry is
 * pure data, so each row's predicate is exercised against a stub `DemandCtx`
 * without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { starCatalogAssetRows } from '../../../../src/layers/starCatalog/load/starCatalogAssetRows';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { Source } from '../../../../src/data/sources';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { UiState } from '../../../../src/@types/ui/UiState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';

// The rows as the demand loop sees them — `createLayers` folds companions over
// core's authored table plus every Layer's, and the fold is per-key local.
const RUNTIME = { catalogs: new Map(), famousStarsMeta: {} } as unknown as StarCatalogRuntime;
const EXPANDED_ROWS = expandCompanionRows(starCatalogAssetRows(RUNTIME));

function rowFor(key: AssetKey) {
  const r = EXPANDED_ROWS.find((row) => row.key === key);
  if (!r) throw new Error(`no star asset row for key ${String(key)}`);
  return r;
}

function makeCtx(over: {
  settings?: unknown;
  slotStates?: Partial<Record<AssetKey, LoadState<unknown>['kind']>>;
}): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: (k) => over.slotStates?.[k] ?? 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('starCatalogAssetRows demand predicates', () => {
  it('gaiaStars demand follows settings.starCatalogs (master gate AND per-item bit)', () => {
    // The star-catalog cluster mirrors the galaxy-catalog cluster: a coarse
    // master gate (`starCatalogs.enabled`) AND a per-catalog `items[id].enabled`
    // bit must BOTH be true for the layer to load.
    const gaia = rowFor(Source.GaiaStars);
    const on = (starCatalogs: unknown) => gaia.demand(makeCtx({ settings: { starCatalogs } }));
    // Master on + item on ⇒ demanded.
    expect(on({ enabled: true, items: { gaiaStars: { enabled: true } } })).toBe(true);
    // Master off overrides an enabled item ⇒ not demanded.
    expect(on({ enabled: false, items: { gaiaStars: { enabled: true } } })).toBe(false);
    // Item off under an on master ⇒ not demanded.
    expect(on({ enabled: true, items: { gaiaStars: { enabled: false } } })).toBe(false);
    // Absent item row (nothing seeded) ⇒ not demanded.
    expect(on({ enabled: true, items: {} })).toBe(false);
  });

  it('famousStarsMeta is eagerly demanded, unconditionally', () => {
    const meta = rowFor('famousStarsMeta');
    expect(meta.demand(makeCtx({}))).toBe(true);
  });
});

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
