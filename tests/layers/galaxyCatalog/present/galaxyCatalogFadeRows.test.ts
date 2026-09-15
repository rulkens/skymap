/**
 * The Layer's two fade rows: the load-bearing pair is that `survey` seeds at 0
 * (so a catalog's first-load `fadeTo(1)` still fades IN) while `surveyLabel`
 * seeds from the persisted famous-label toggle (so a labels-off session does not
 * flash them on at frame 1). The seed assertions run THROUGH `seedFades` over
 * the composed manifest, not the row's `seed` in isolation.
 */

import { describe, it, expect, vi } from 'vitest';

import { galaxyCatalogFadeRows } from '../../../../src/layers/galaxyCatalog/present/galaxyCatalogFadeRows';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { seedFades } from '../../../../src/services/engine/wiring/fadeLayers';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';

function runtimeWith(loaded: readonly string[]): GalaxyCatalogRuntime {
  return {
    pointRenderer: { hasCatalog: (id: string) => loaded.includes(id) },
  } as unknown as GalaxyCatalogRuntime;
}

function makeSettings(opts: { labelEnabled?: boolean; sdssEnabled?: boolean } = {}) {
  const items: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of GALAXY_CATALOG_IDS) {
    items[id] = { enabled: id === 'sdss' ? (opts.sdssEnabled ?? true) : true, labelEnabled: false };
  }
  items.famousGalaxy = { enabled: true, labelEnabled: opts.labelEnabled ?? true };
  return { galaxyCatalogs: { items } } as unknown as EngineSettingsState;
}

function makeState(opts: { labelEnabled?: boolean } = {}): EngineState {
  return {
    settings: makeSettings(opts),
    subsystems: { fades: createFadeRegistry({ requestRender: vi.fn<() => void>() }) },
    fadeRows: galaxyCatalogFadeRows(runtimeWith([])),
  } as unknown as EngineState;
}

const rowFor = (key: 'survey' | 'surveyLabel') =>
  galaxyCatalogFadeRows(runtimeWith(['2mrs'])).find((r) => r.key === key)!;

describe('galaxyCatalogFadeRows', () => {
  it('seeds every galaxy catalog at 0 so a first load still fades in', () => {
    const state = makeState();
    seedFades(state);
    for (const id of GALAXY_CATALOG_IDS) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', id }),
        `galaxyCatalog{${id}} should seed at 0`,
      ).toBe(0);
    }
  });

  it('seeds the surveyLabel (galaxy) handle from famousGalaxy.labelEnabled', () => {
    const off = makeState({ labelEnabled: false });
    seedFades(off);
    expect(off.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' })).toBe(0);

    const on = makeState();
    seedFades(on);
    expect(on.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' })).toBe(1);
  });

  it('survey row intent reads galaxyCatalogs.items[id].enabled', () => {
    const row = rowFor('survey');
    expect(row.intent?.(makeSettings({ sdssEnabled: false }), 'sdss')).toBe(false);
    expect(row.intent?.(makeSettings({ sdssEnabled: true }), 'sdss')).toBe(true);
  });

  it('surveyLabel row intent reads famousGalaxy.labelEnabled', () => {
    const row = rowFor('surveyLabel');
    expect(row.intent?.(makeSettings({ labelEnabled: false }), undefined)).toBe(false);
    expect(row.intent?.(makeSettings({ labelEnabled: true }), undefined)).toBe(true);
  });

  it('survey row guard gates on the renderer holding the catalog', () => {
    // Same demand-loaded pattern as flow/filaments/volumeField: a catalog whose
    // .bin is still downloading must not burn its fade window.
    const row = rowFor('survey');
    const state = {} as unknown as EngineState;
    expect(row.guard?.(state, 'sdss')).toBe(false);
    expect(row.guard?.(state, '2mrs')).toBe(true);
  });

  it('survey row has no post — masks are a pure per-frame derivation', () => {
    // `deriveSourceMasks` projects the draw/pick bitmasks on read (per frame in
    // `runFrame`, fresh at click time), so a toggle just fades the catalog
    // handle and the next frame's derivation picks up the new enabled set.
    expect(rowFor('survey').post).toBeUndefined();
  });
});
