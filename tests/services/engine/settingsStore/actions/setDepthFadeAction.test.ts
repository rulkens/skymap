import { describe, it, expect } from 'vitest';

import { setDepthFadeAction } from '../../../../../src/services/engine/settingsStore/actions/setDepthFadeAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectDepthFade } from '../../../../../src/services/engine/settingsStore/selectors/selectDepthFade';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setDepthFadeAction', () => {
  it('writes the depth-fade flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().surveys;
    const next = !before.depthFade;

    setDepthFadeAction(store, next);

    expect(selectDepthFade(store.getState())).toBe(next);
    expect(store.getState().surveys).not.toBe(before);
  });
});
