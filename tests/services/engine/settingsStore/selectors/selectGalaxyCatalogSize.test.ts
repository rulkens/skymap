import { describe, it, expect } from 'vitest';

import { selectGalaxyCatalogSize } from '../../../../../src/services/engine/settingsStore/selectors/selectGalaxyCatalogSize';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectGalaxyCatalogSize', () => {
  it('returns the galaxy catalog point size', () => {
    const state = makeSettingsFixture({
      galaxyCatalogs: { ...makeSettingsFixture().galaxyCatalogs, sizePx: 6 },
    });

    expect(selectGalaxyCatalogSize(state)).toBe(6);
  });
});
