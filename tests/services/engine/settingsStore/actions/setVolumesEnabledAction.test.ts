import { describe, it, expect } from 'vitest';

import { setVolumesEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setVolumesEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectVolumesEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectVolumesEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setVolumesEnabledAction', () => {
  it('writes the volumes-enabled flag through the reducer', () => {
    const store = createSettingsStore(
      makeSettingsFixture({ volumes: { enabled: true, items: {} } }),
    );
    const before = store.getState().volumes;

    setVolumesEnabledAction(store, false);

    expect(selectVolumesEnabled(store.getState())).toBe(false);
    expect(store.getState().volumes).not.toBe(before);
  });
});
