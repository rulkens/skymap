import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { visibilitySwitchOf } from '../../../src/utils/visibility/visibilitySwitchOf';
import type { VisibilityEntry } from '../../../src/@types/engine/layer/VisibilityEntry';
import type { SetVisibilityPayload } from '../../../src/@types/settings/SetVisibilityPayload';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY;
const showEntry = (key: string): VisibilityEntry =>
  ENTRIES.find((e) => 'key' in e && e.key === key)!;
const write = (...payloads: SetVisibilityPayload[]) =>
  payloads.reduce((s, p) => settingsReducer(s, setVisibility(p)), INITIAL_SETTINGS);

describe('visibilitySwitchOf', () => {
  it('a per-item show switch is off when its section switch is off', () => {
    const stars = write(
      { cluster: 'starCatalogs', field: 'enabled', on: false },
      { cluster: 'starCatalogs', item: 'famousStar', field: 'enabled', on: true },
    );
    expect(visibilitySwitchOf(stars, showEntry('starCatalog'), 'famousStar')).toBe(false);
    const density = write(
      { cluster: 'cosmicWebDensity', field: 'enabled', on: false },
      { cluster: 'cosmicWebDensity', item: 'mcpm', field: 'enabled', on: true },
    );
    expect(visibilitySwitchOf(density, showEntry('cosmicWebDensity'), 'mcpm')).toBe(false);
    const densityOn = write(
      { cluster: 'cosmicWebDensity', field: 'enabled', on: true },
      { cluster: 'cosmicWebDensity', item: 'mcpm', field: 'enabled', on: true },
    );
    expect(visibilitySwitchOf(densityOn, showEntry('cosmicWebDensity'), 'mcpm')).toBe(true);
  });

  it('a cluster without a section switch resolves on the item alone', () => {
    const settings = write({ cluster: 'galaxyCatalogs', item: 'sdss', field: 'enabled', on: true });
    expect(visibilitySwitchOf(settings, showEntry('survey'), 'sdss')).toBe(true);
  });

  it("every entry's switch resolves in the initial settings", () => {
    for (const entry of ENTRIES) {
      for (const item of entry.items ?? [undefined]) {
        expect(typeof visibilitySwitchOf(INITIAL_SETTINGS, entry, item)).toBe('boolean');
      }
    }
  });
});
