import { describe, it, expect } from 'vitest';

import { layerSwitchesFrom } from '../../../src/utils/url/layerSwitchesFrom';
import { encodeLayerSwitches } from '../../../src/utils/url/encodeLayerSwitches';
import { parseLayerSwitches } from '../../../src/utils/url/parseLayerSwitches';
import { setVisibilityActionsFor } from '../../../src/utils/visibility/setVisibilityActionsFor';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { LayerSwitch } from '../../../src/@types/url/LayerSwitch';

const applied = (from: EngineSettingsState, switches: readonly LayerSwitch[]) =>
  switches.reduce(
    (settings, { address, on }) =>
      setVisibilityActionsFor(settings, address, on).reduce(settingsReducer, settings),
    from,
  );

describe('layerSwitchesFrom', () => {
  it('layerSwitchesFrom is empty for the boot settings', () => {
    expect(layerSwitchesFrom(INITIAL_SETTINGS, INITIAL_SETTINGS)).toEqual([]);
  });

  it('layer switches round-trip through the link', () => {
    const shared = applied(INITIAL_SETTINGS, [
      { address: 'cosmicWebFilaments', on: true },
      { address: 'starCatalog', on: false },
      { address: 'survey:desiWedge', on: true },
      { address: 'label:structure', on: false },
    ]);
    const original = layerSwitchesFrom(shared, INITIAL_SETTINGS);
    const link = encodeLayerSwitches(original);
    const opened = applied(INITIAL_SETTINGS, parseLayerSwitches(link).switches);

    expect(original).not.toEqual([]);
    expect(layerSwitchesFrom(opened, INITIAL_SETTINGS)).toEqual(original);
  });
});
