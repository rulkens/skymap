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
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { AssetKey } from '../../../../../src/@types/loading/AssetKey';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
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

function makeCtx(over: { settings?: unknown; tier?: Tier }): DemandCtx {
  return {
    settings: (over.settings ?? {}) as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
    drawPxPerRad: 0,
    tier: over.tier ?? 'large',
    selectedKinds: new Set(),
  };
}

describe('galaxyCatalogAssetRows demand', () => {
  it('a catalog the tier excludes is not demanded even when enabled, and is released', () => {
    const settings = {
      galaxyCatalogs: { items: { sdss: { enabled: true }, '2mrs': { enabled: true } } },
    };
    const at = (source: AssetKey, tier: Tier) =>
      evaluateAssetDemand(rowFor(source), makeCtx({ settings, tier }), galaxyCatalogVisibility);
    expect(at('sdss', 'small')).toEqual({ demand: false, release: true });
    expect(at('sdss', 'medium')).toEqual({ demand: true, release: false });
    // A source with no tier caps ships at every tier, the smallest included.
    expect(at('2mrs', 'small')).toEqual({ demand: true, release: false });
  });

  // Released, its ids stop resolving: the grand tour hid every survey, then waited forever
  // for beat 3's `m31` focus, whose show cue sits in the very clip that wait gates.
  it('the famous catalog stays resident while switched off, so its ids keep resolving', () => {
    const settings = { galaxyCatalogs: { items: { famousGalaxy: { enabled: false } } } };
    const verdict = evaluateAssetDemand(
      rowFor('famousGalaxy'),
      makeCtx({ settings }),
      galaxyCatalogVisibility,
    );
    expect(verdict).toEqual({ demand: true, release: false });
  });
});

describe('galaxyCatalogAssetRows req builders', () => {
  it('a tiered row carries its tier; an untiered one carries only its source', () => {
    expect(rowFor('sdss').req('medium')).toEqual({ source: 'sdss', tier: 'medium' });
    expect(rowFor('2mrs').req('large')).toEqual({ source: '2mrs' });
  });

  it("an untiered point source's request is identical across tiers", () => {
    for (const source of ['2mrs', 'famousGalaxy']) {
      const row = rowFor(source);
      expect(sameRequest(row.req('small'), row.req('large')), `${source} drifted`).toBe(true);
    }
  });

  it("the famous-meta row's request equals the famous point row's request at every tier", () => {
    const meta = rowFor('famousGalaxiesMeta');
    const point = rowFor('famousGalaxy');
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(sameRequest(meta.req(tier), point.req(tier)), `drifted at ${tier}`).toBe(true);
    }
  });
});
