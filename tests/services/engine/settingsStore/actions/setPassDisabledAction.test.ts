import { describe, it, expect } from 'vitest';

import { setPassDisabledAction } from '../../../../../src/services/engine/settingsStore/actions/setPassDisabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectDisabledPasses } from '../../../../../src/services/engine/settingsStore/selectors/selectDisabledPasses';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setPassDisabledAction', () => {
  it('writes the disabled-pass membership through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().debug;

    setPassDisabledAction(store, 'point-sprites', true);

    expect(selectDisabledPasses(store.getState()).has('point-sprites')).toBe(true);
    expect(store.getState().debug).not.toBe(before);
  });

  it('removes a name on a false write', () => {
    const store = createSettingsStore(
      makeSettingsFixture({
        debug: { ...makeSettingsFixture().debug, disabledPasses: new Set(['labels']) },
      }),
    );

    setPassDisabledAction(store, 'labels', false);

    expect(selectDisabledPasses(store.getState()).has('labels')).toBe(false);
  });
});
