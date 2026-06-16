import { describe, it, expect } from 'vitest';

import { setPassDisabled } from '../../../../../src/services/engine/settingsStore/reducers/setPassDisabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setPassDisabled', () => {
  it('adds the pass name to a fresh disabled set', () => {
    const state = makeSettingsFixture();
    const next = setPassDisabled(state, 'point-sprites', true);

    expect(next.debug.disabledPasses.has('point-sprites')).toBe(true);
    // Copy-on-write: a new Set, not the input mutated in place.
    expect(next.debug.disabledPasses).not.toBe(state.debug.disabledPasses);
    expect(state.debug.disabledPasses.has('point-sprites')).toBe(false);
  });

  it('removes the pass name when disabled is false', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, disabledPasses: new Set(['labels']) },
    });
    const next = setPassDisabled(state, 'labels', false);

    expect(next.debug.disabledPasses.has('labels')).toBe(false);
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
