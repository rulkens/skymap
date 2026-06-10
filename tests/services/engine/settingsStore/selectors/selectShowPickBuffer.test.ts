import { describe, it, expect } from 'vitest';

import { selectShowPickBuffer } from '../../../../../src/services/engine/settingsStore/selectors/selectShowPickBuffer';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectShowPickBuffer', () => {
  it('returns debug.showPickBuffer as a primitive boolean', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, showPickBuffer: true },
    });

    expect(selectShowPickBuffer(state)).toBe(true);
  });
});
