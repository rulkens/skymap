/**
 * galaxyCatalogAssetRows — the Layer's demand + request cases. The registry is
 * pure data, so each row's declared demand is evaluated against a stub `DemandCtx`
 * without a full engine.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { galaxyCatalogVisibility } from '../../../../../src/layers/galaxyCatalog/visibility';

import { galaxyCatalogAssetRows } from '../../../../../src/layers/galaxyCatalog/records/load/galaxyCatalogAssetRows';
import { expandCompanionRows } from '../../../../../src/utils/loading/expandCompanionRows';
import { sameRequest } from '../../../../../src/utils/loading/sameRequest';
import { Source } from '../../../../../src/data/source';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { AssetKey } from '../../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../../src/@types/loading/LoadState';
import type { Tier } from '../../../../../src/@types/data/Tier';
import type { UiState } from '../../../../../src/@types/ui/UiState';
import type { GalaxyCatalogRuntime } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

// The rows as the demand loop sees them — `createLayers` folds companions over
// core's authored table plus every Layer's, and the fold is per-key local.
const RUNTIME = { points: new Map() } as unknown as GalaxyCatalogRuntime;
const EXPANDED_ROWS = expandCompanionRows(galaxyCatalogAssetRows(RUNTIME));

function rowFor(key: AssetKey) {
  const r = EXPANDED_ROWS.find((row) => row.key === key);
  if (!r) throw new Error(`no galaxy asset row for key ${String(key)}`);
  return r;
}

function makeCtx(over: {
  settings?: unknown;
  paletteOpen?: boolean;
  slotStates?: Partial<Record<AssetKey, LoadState<unknown>['kind']>>;
  tier?: Tier;
}): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    ui: { paletteOpen: over.paletteOpen ?? false } as Readonly<UiState>,
    slotState: (k) => over.slotStates?.[k] ?? 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
    tier: over.tier ?? 'large',
    selectedKinds: new Set(),
  };
}

describe('galaxyCatalogAssetRows demand', () => {
  it("galaxy catalog rows demand the galaxy catalog's enabled bit; switched off, they release", () => {
    const sdss = rowFor(Source.SDSS);
    const at = (enabled: boolean) =>
      evaluateAssetDemand(
        sdss,
        makeCtx({ settings: { galaxyCatalogs: { items: { sdss: { enabled } } } } }),
        galaxyCatalogVisibility,
      );
    expect(at(true)).toEqual({ demand: true, release: false });
    expect(at(false)).toEqual({ demand: false, release: true });
  });

  it('a catalog the tier excludes is not demanded even when enabled, and is released', () => {
    const settings = {
      galaxyCatalogs: { items: { sdss: { enabled: true }, '2mrs': { enabled: true } } },
    };
    const at = (source: AssetKey, tier: Tier) =>
      evaluateAssetDemand(rowFor(source), makeCtx({ settings, tier }), galaxyCatalogVisibility);
    expect(at(Source.SDSS, 'small')).toEqual({ demand: false, release: true });
    expect(at(Source.SDSS, 'medium')).toEqual({ demand: true, release: false });
    // A source with no tier caps ships at every tier, the smallest included.
    expect(at(Source.TwoMRS, 'small')).toEqual({ demand: true, release: false });
  });

  it('famousGalaxiesMeta demands when the Famous slot is not idle', () => {
    const famousGalaxiesMeta = rowFor('famousGalaxiesMeta');
    expect(
      evaluateAssetDemand(
        famousGalaxiesMeta,
        makeCtx({ slotStates: { [Source.FamousGalaxy]: 'loading' } }),
        galaxyCatalogVisibility,
      ).demand,
    ).toBe(true);
    expect(
      evaluateAssetDemand(
        famousGalaxiesMeta,
        makeCtx({ slotStates: { [Source.FamousGalaxy]: 'idle' } }),
        galaxyCatalogVisibility,
      ).demand,
    ).toBe(false);
  });

  it('pgcAlias demands only while the palette is open', () => {
    const pgc = rowFor('pgcAlias');
    expect(
      evaluateAssetDemand(pgc, makeCtx({ paletteOpen: true }), galaxyCatalogVisibility).demand,
    ).toBe(true);
    expect(
      evaluateAssetDemand(pgc, makeCtx({ paletteOpen: false }), galaxyCatalogVisibility).demand,
    ).toBe(false);
  });
});

describe('galaxyCatalogAssetRows req builders', () => {
  it('a tiered row carries its tier; an untiered one carries only its source', () => {
    expect(rowFor(Source.SDSS).req('medium')).toEqual({ source: Source.SDSS, tier: 'medium' });
    expect(rowFor(Source.TwoMRS).req('large')).toEqual({ source: Source.TwoMRS });
  });

  it("an untiered point source's request is identical across tiers", () => {
    for (const source of [Source.TwoMRS, Source.FamousGalaxy]) {
      const row = rowFor(source);
      expect(sameRequest(row.req('small'), row.req('large')), `${source} drifted`).toBe(true);
    }
  });

  it("the famous-meta row's request equals the famous point row's request at every tier", () => {
    const meta = rowFor('famousGalaxiesMeta');
    const point = rowFor(Source.FamousGalaxy);
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(sameRequest(meta.req(tier), point.req(tier)), `drifted at ${tier}`).toBe(true);
    }
  });
});
