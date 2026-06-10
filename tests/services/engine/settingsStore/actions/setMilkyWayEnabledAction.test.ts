import { describe, it, expect } from 'vitest';

import { setMilkyWayEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setMilkyWayEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectMilkyWayEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectMilkyWayEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setMilkyWayEnabledAction', () => {
  it('writes the milkyWay-enabled flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().milkyWay;

    setMilkyWayEnabledAction(store, false);

    expect(selectMilkyWayEnabled(store.getState())).toBe(false);
    expect(store.getState().milkyWay).not.toBe(before);
  });
});
