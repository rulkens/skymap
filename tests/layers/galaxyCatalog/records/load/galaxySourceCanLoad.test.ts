import { describe, it, expect } from 'vitest';

import { galaxySourceCanLoad } from '../../../../../src/layers/galaxyCatalog/records/load/galaxySourceCanLoad';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';

function withToggle(id: string, enabled: boolean): EngineSettingsState {
  const { galaxyCatalogs } = INITIAL_SETTINGS;
  return {
    ...INITIAL_SETTINGS,
    galaxyCatalogs: {
      ...galaxyCatalogs,
      items: { ...galaxyCatalogs.items, [id]: { ...galaxyCatalogs.items[id as 'sdss'], enabled } },
    },
  };
}

describe('galaxySourceCanLoad', () => {
  it('is false for a source whose tier ships no file', () => {
    expect(galaxySourceCanLoad('sdss', 'small', withToggle('sdss', true))).toBe(false);
  });

  it('is true for a shipped, switched-on source', () => {
    expect(galaxySourceCanLoad('sdss', 'medium', withToggle('sdss', true))).toBe(true);
  });

  it('is false once its catalog toggle is off', () => {
    expect(galaxySourceCanLoad('sdss', 'medium', withToggle('sdss', false))).toBe(false);
  });

  it('is true for the famous catalog even switched off', () => {
    expect(galaxySourceCanLoad('famousGalaxy', 'small', withToggle('famousGalaxy', false))).toBe(
      true,
    );
  });
});
