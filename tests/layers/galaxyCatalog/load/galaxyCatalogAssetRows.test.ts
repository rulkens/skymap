/**
 * galaxyCatalogAssetRows — the Layer's demand + request cases. The registry is
 * pure data, so each row's predicate is exercised against a stub `DemandCtx`
 * without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { galaxyCatalogAssetRows } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogAssetRows';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';
import { Source } from '../../../../src/data/sources';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { UiState } from '../../../../src/@types/ui/UiState';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';

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
}): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    ui: { paletteOpen: over.paletteOpen ?? false } as Readonly<UiState>,
    slotState: (k) => over.slotStates?.[k] ?? 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('galaxyCatalogAssetRows demand predicates', () => {
  it("galaxy catalog rows demand the galaxy catalog's enabled settings bit", () => {
    const sdss = rowFor(Source.SDSS);
    expect(
      sdss.demand(
        makeCtx({ settings: { galaxyCatalogs: { items: { sdss: { enabled: true } } } } }),
      ),
    ).toBe(true);
    // Absent items row (or disabled bit) ⇒ not demanded.
    expect(sdss.demand(makeCtx({ settings: { galaxyCatalogs: { items: {} } } }))).toBe(false);
  });

  it('famousGalaxiesMeta demands when the Famous slot is not idle', () => {
    const famousGalaxiesMeta = rowFor('famousGalaxiesMeta');
    expect(
      famousGalaxiesMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'loading' } })),
    ).toBe(true);
    expect(
      famousGalaxiesMeta.demand(makeCtx({ slotStates: { [Source.FamousGalaxy]: 'idle' } })),
    ).toBe(false);
  });

  it('pgcAlias demands only while the palette is open', () => {
    const pgc = rowFor('pgcAlias');
    expect(pgc.demand(makeCtx({ paletteOpen: true }))).toBe(true);
    expect(pgc.demand(makeCtx({ paletteOpen: false }))).toBe(false);
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
