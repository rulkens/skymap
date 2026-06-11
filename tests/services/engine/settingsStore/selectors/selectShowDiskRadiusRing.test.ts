import { describe, it, expect } from 'vitest';

import { selectShowDiskRadiusRing } from '../../../../../src/services/engine/settingsStore/selectors/selectShowDiskRadiusRing';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectShowDiskRadiusRing', () => {
  it('returns debug.showDiskRadiusRing as a primitive boolean', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, showDiskRadiusRing: true },
    });

    expect(selectShowDiskRadiusRing(state)).toBe(true);
  });
});
