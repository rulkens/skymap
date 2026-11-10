/**
 * The read side of `setVisibilityActionsFor`: a scoped address reads its one item, a bare
 * per-item one reads like its write lands (section switch where the cluster has one, else any item).
 */

import { describe, expect, it } from 'vitest';

import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { isVisibilityAddressOn } from '../../../src/utils/visibility/isVisibilityAddressOn';
import type { SetVisibilityPayload } from '../../../src/@types/settings/SetVisibilityPayload';

const write = (...payloads: SetVisibilityPayload[]) =>
  payloads.reduce((s, p) => settingsReducer(s, setVisibility(p)), INITIAL_SETTINGS);

describe('isVisibilityAddressOn', () => {
  it('a scoped address reads its own item, a bare one any item', () => {
    const settings = write({
      cluster: 'galaxyCatalogs',
      item: 'sdss',
      field: 'enabled',
      on: false,
    });
    expect(isVisibilityAddressOn(settings, 'survey:sdss')).toBe(false);
    expect(isVisibilityAddressOn(settings, 'survey:glade')).toBe(true);
    expect(isVisibilityAddressOn(settings, 'survey')).toBe(true);
  });

  it('a scoped item under an off section switch reads off', () => {
    const settings = write(
      { cluster: 'cosmicWebDensity', field: 'enabled', on: false },
      { cluster: 'cosmicWebDensity', item: 'mcpm', field: 'enabled', on: true },
    );
    expect(isVisibilityAddressOn(settings, 'cosmicWebDensity:mcpm')).toBe(false);
  });

  it('a label address reads labelEnabled, not the show switch', () => {
    const settings = write({
      cluster: 'galaxyCatalogs',
      item: 'famousGalaxy',
      field: 'labelEnabled',
      on: false,
    });
    expect(isVisibilityAddressOn(settings, 'label:famousGalaxy:famousGalaxy')).toBe(false);
    expect(isVisibilityAddressOn(settings, 'survey:famousGalaxy')).toBe(true);
  });
});
