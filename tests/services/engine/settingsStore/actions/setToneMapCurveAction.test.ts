import { describe, it, expect } from 'vitest';

import { setToneMapCurveAction } from '../../../../../src/services/engine/settingsStore/actions/setToneMapCurveAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectToneMapCurve } from '../../../../../src/services/engine/settingsStore/selectors/selectToneMapCurve';
import { ToneMapCurve } from '../../../../../src/data/toneMapCurve';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setToneMapCurveAction', () => {
  it('writes the curve through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().tonemap;

    setToneMapCurveAction(store, ToneMapCurve.Gamma2);

    expect(selectToneMapCurve(store.getState())).toBe(ToneMapCurve.Gamma2);
    expect(store.getState().tonemap).not.toBe(before);
  });
});
