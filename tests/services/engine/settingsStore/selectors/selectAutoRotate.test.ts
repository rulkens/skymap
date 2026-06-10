import { describe, it, expect } from 'vitest';

import { selectAutoRotate } from '../../../../../src/services/engine/settingsStore/selectors/selectAutoRotate';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectAutoRotate', () => {
  it('returns camera.autoRotate as a primitive boolean', () => {
    const state = makeSettingsFixture({
      camera: { ...makeSettingsFixture().camera, autoRotate: true },
    });

    expect(selectAutoRotate(state)).toBe(true);
  });
});
