import { describe, expect, it } from 'vitest';
import { APP_SETTINGS_SLICES } from '../../src/compositions/appSettingsSlices';
import { CORE_SETTINGS_SLICES } from '../../src/state/settings/coreSettingsSlices';

describe('APP_SETTINGS_SLICES', () => {
  // combineSlices would silently let the later slice win the key; the old
  // composeInitialSettings threw for the same reason.
  it('claims each settings-root key once, and none core claims', () => {
    const paths = APP_SETTINGS_SLICES.map((s) => s.reducerPath);
    expect(new Set(paths).size).toBe(paths.length);
    const core = new Set(CORE_SETTINGS_SLICES.map((s) => s.reducerPath));
    expect(paths.filter((p) => core.has(p))).toEqual([]);
  });

  it('namespaces every action under settings/', () => {
    for (const slice of APP_SETTINGS_SLICES) {
      expect(slice.name).toBe(`settings/${slice.reducerPath}`);
    }
  });
});
