/**
 * The field exhibits keep the famous galaxies on as landmarks while the surveys are off, so the
 * galaxies switch must read off there; a bare `survey` read would say on (any item is).
 */

import { describe, expect, it } from 'vitest';

import { GALAXIES_SWITCH } from '../../../src/compositions/exhibits/utils/galaxiesSwitch';
import { SURVEYS_OFF } from '../../../src/compositions/exhibits/utils/surveysOff';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { isExhibitSwitchOn } from '../../../src/utils/exhibits/isExhibitSwitchOn';
import { setVisibilityActionsFor } from '../../../src/utils/visibility/setVisibilityActionsFor';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';

const SURVEYS_OFF_SETTINGS: EngineSettingsState = {
  ...INITIAL_SETTINGS,
  galaxyCatalogs: SURVEYS_OFF,
};

const flipped = (from: EngineSettingsState, on: boolean) =>
  GALAXIES_SWITCH.addresses
    .flatMap((address) => setVisibilityActionsFor(from, address, on))
    .reduce(settingsReducer, from);

describe('isExhibitSwitchOn', () => {
  it('reads the galaxies switch off with the surveys off and the famous galaxies on', () => {
    expect(SURVEYS_OFF.items.famousGalaxy.enabled).toBe(true);
    expect(isExhibitSwitchOn(SURVEYS_OFF_SETTINGS, GALAXIES_SWITCH)).toBe(false);
  });

  it('reads on once its own writes switch every survey on, off again after, famous untouched', () => {
    const shown = flipped(SURVEYS_OFF_SETTINGS, true);
    expect(isExhibitSwitchOn(shown, GALAXIES_SWITCH)).toBe(true);
    const hidden = flipped(shown, false);
    expect(isExhibitSwitchOn(hidden, GALAXIES_SWITCH)).toBe(false);
    expect(hidden.galaxyCatalogs.items.famousGalaxy.enabled).toBe(true);
  });

  it('reads off while only some surveys are on', () => {
    const [sdssOn] = setVisibilityActionsFor(SURVEYS_OFF_SETTINGS, 'survey:sdss', true);
    const one = settingsReducer(SURVEYS_OFF_SETTINGS, sdssOn!);
    expect(isExhibitSwitchOn(one, GALAXIES_SWITCH)).toBe(false);
  });
});
