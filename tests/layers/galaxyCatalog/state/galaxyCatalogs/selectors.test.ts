import { describe, it, expect } from 'vitest';

import { selectVisibleSourceMask } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import { settingsRoute } from '../../../../../src/store/constants';
import { Source, GALAXY_CATALOG_SOURCES } from '../../../../../src/data/sources';
import { maskHas } from '../../../../../src/utils/maskHas';
import { galaxyCatalogIdOf } from '../../../../../src/utils/galaxyCatalogIdOf';
import type { RootState } from '../../../../../src/store/types';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';

// Every test builds a RootState by mounting a fresh boot-settings literal at the
// settings route, optionally patched. The selectors are RootState-scoped, so
// they read through `state[settingsRoute]` exactly as the React/engine sides do.
function makeRoot(patch?: Partial<EngineSettingsState>): RootState {
  const settings = { ...INITIAL_SETTINGS, ...patch };
  return { [settingsRoute]: settings } as RootState;
}

describe('selectVisibleSourceMask', () => {
  it('sets exactly the bit of every enabled galaxy catalog', () => {
    const root = makeRoot();
    const mask = selectVisibleSourceMask(root);

    for (const s of GALAXY_CATALOG_SOURCES) {
      const { enabled } = root[settingsRoute].galaxyCatalogs.items[galaxyCatalogIdOf(s)];
      expect(maskHas(mask, s)).toBe(enabled);
    }
  });

  it('follows intent only — a disabled galaxy catalog is not in the mask', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: {
        ...base[settingsRoute].galaxyCatalogs,
        items: {
          ...base[settingsRoute].galaxyCatalogs.items,
          sdss: { ...base[settingsRoute].galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    const mask = selectVisibleSourceMask(state);

    expect(maskHas(mask, Source.SDSS)).toBe(false);
    expect(maskHas(mask, Source.TwoMRS)).toBe(true);
  });

  it('memoizes on galaxyCatalogs alone — recomputes only when that cluster changes', () => {
    selectVisibleSourceMask.resetRecomputations();
    const state = makeRoot();
    selectVisibleSourceMask(state);
    const baseline = selectVisibleSourceMask.recomputations();

    const stateWithUnrelatedWrite = makeRoot({
      tonemap: {
        ...state[settingsRoute].tonemap,
        exposure: state[settingsRoute].tonemap.exposure + 1,
      },
    });
    selectVisibleSourceMask(stateWithUnrelatedWrite);
    expect(selectVisibleSourceMask.recomputations()).toBe(baseline);

    const stateWithGalaxyCatalogsWrite = makeRoot({
      galaxyCatalogs: {
        ...state[settingsRoute].galaxyCatalogs,
        items: {
          ...state[settingsRoute].galaxyCatalogs.items,
          sdss: { ...state[settingsRoute].galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    selectVisibleSourceMask(stateWithGalaxyCatalogsWrite);
    expect(selectVisibleSourceMask.recomputations()).toBe(baseline + 1);
  });
});
