import { describe, it, expect } from 'vitest';

import { selectVisibleCatalogs } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import { settingsRoute } from '../../../../../src/store/constants';
import { Source } from '../../../../../src/data/source';
import { GALAXY_CATALOG_SOURCES } from '../../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import type { RootState } from '../../../../../src/store/types';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';

// Every test builds a RootState by mounting a fresh boot-settings literal at the
// settings route, optionally patched. The selectors are RootState-scoped, so
// they read through `state[settingsRoute]` exactly as the React/engine sides do.
function makeRoot(patch?: Partial<EngineSettingsState>): RootState {
  const settings = { ...INITIAL_SETTINGS, ...patch };
  return { [settingsRoute]: settings } as RootState;
}

describe('selectVisibleCatalogs', () => {
  it('lists exactly the id of every enabled galaxy catalog', () => {
    const root = makeRoot();
    const visible = selectVisibleCatalogs(root);

    for (const s of GALAXY_CATALOG_SOURCES) {
      const { enabled } = root[settingsRoute].galaxyCatalogs.items[s];
      expect(visible.has(s)).toBe(enabled);
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
    const visible = selectVisibleCatalogs(state);

    expect(visible.has('sdss')).toBe(false);
    expect(visible.has('2mrs')).toBe(true);
  });

  it('memoizes on galaxyCatalogs alone — recomputes only when that cluster changes', () => {
    selectVisibleCatalogs.resetRecomputations();
    const state = makeRoot();
    selectVisibleCatalogs(state);
    const baseline = selectVisibleCatalogs.recomputations();

    const stateWithUnrelatedWrite = makeRoot({
      tonemap: {
        ...state[settingsRoute].tonemap,
        exposure: state[settingsRoute].tonemap.exposure + 1,
      },
    });
    selectVisibleCatalogs(stateWithUnrelatedWrite);
    expect(selectVisibleCatalogs.recomputations()).toBe(baseline);

    const stateWithGalaxyCatalogsWrite = makeRoot({
      galaxyCatalogs: {
        ...state[settingsRoute].galaxyCatalogs,
        items: {
          ...state[settingsRoute].galaxyCatalogs.items,
          sdss: { ...state[settingsRoute].galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    selectVisibleCatalogs(stateWithGalaxyCatalogsWrite);
    expect(selectVisibleCatalogs.recomputations()).toBe(baseline + 1);
  });
});
