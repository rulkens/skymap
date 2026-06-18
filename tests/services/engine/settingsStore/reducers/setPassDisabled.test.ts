import { describe, it, expect } from 'vitest';

import { setPassDisabled } from '../../../../../src/services/engine/settingsStore/reducers/setPassDisabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setPassDisabled', () => {
  it('marks the pass name disabled in a fresh record', () => {
    const state = makeSettingsFixture();
    const next = setPassDisabled(state, 'foo', true);

    expect(next.debug.disabledPasses).toEqual({ foo: true });
    // Copy-on-write: a new record, not the input mutated in place.
    expect(next.debug.disabledPasses).not.toBe(state.debug.disabledPasses);
    expect(state.debug.disabledPasses.foo).toBeUndefined();
  });

  it('maps the pass name to false when disabled is false', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, disabledPasses: { foo: true } },
    });
    const next = setPassDisabled(state, 'foo', false);

    expect(next.debug.disabledPasses).toEqual({ foo: false });
    expect(next.debug.disabledPasses).not.toBe(state.debug.disabledPasses);
  });

  it('copies-on-write the debug cluster and shares untouched clusters', () => {
    const state = makeSettingsFixture();
    const next = setPassDisabled(state, 'filaments', true);

    expect(next.debug).not.toBe(state.debug);
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('preserves the sibling debug leaves', () => {
    const state = makeSettingsFixture({
      debug: {
        ...makeSettingsFixture().debug,
        showPickBuffer: true,
        showDiskRadiusRing: true,
      },
    });
    const next = setPassDisabled(state, 'flow-field', true);

    expect(next.debug.showPickBuffer).toBe(true);
    expect(next.debug.showDiskRadiusRing).toBe(true);
  });
});
