import { describe, it, expect } from 'vitest';

import { selectVolumesEnabled } from '../../../../../src/services/engine/settingsStore/selectors/selectVolumesEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectVolumesEnabled', () => {
  it('returns volumes.enabled as a primitive boolean', () => {
    const on = makeSettingsFixture({
      volumes: { ...makeSettingsFixture().volumes, enabled: true },
    });
    const off = makeSettingsFixture({
      volumes: { ...makeSettingsFixture().volumes, enabled: false },
    });

    expect(selectVolumesEnabled(on)).toBe(true);
    expect(selectVolumesEnabled(off)).toBe(false);
  });
});
