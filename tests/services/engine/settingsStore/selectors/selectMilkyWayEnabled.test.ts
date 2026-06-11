import { describe, it, expect } from 'vitest';

import { selectMilkyWayEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectMilkyWayEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectMilkyWayEnabled', () => {
  it('returns milkyWay.enabled as a primitive boolean', () => {
    const state = makeSettingsFixture({
      milkyWay: { ...makeSettingsFixture().milkyWay, enabled: false },
    });

    expect(selectMilkyWayEnabled(state)).toBe(false);
  });
});
