import { describe, it, expect } from 'vitest';

import { selectToneMapCurve } from '../../../../../src/services/engine/settingsStore/selectors/selectToneMapCurve';
import { ToneMapCurve } from '../../../../../src/data/toneMapCurve';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectToneMapCurve', () => {
  it('returns tonemap.curve as a primitive enum value', () => {
    const state = makeSettingsFixture({
      tonemap: { ...makeSettingsFixture().tonemap, curve: ToneMapCurve.Asinh },
    });

    expect(selectToneMapCurve(state)).toBe(ToneMapCurve.Asinh);
  });
});
