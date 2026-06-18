import { describe, it, expect } from 'vitest';

import { selectDisabledPasses } from '../../../../../src/services/engine/settingsStore/selectors/selectDisabledPasses';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectDisabledPasses', () => {
  it('returns the debug.disabledPasses record', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, disabledPasses: { 'point-sprites': true } },
    });

    expect(selectDisabledPasses(state)).toEqual({ 'point-sprites': true });
  });

  it('returns the same reference for a stable snapshot (cheap useSyncExternalStore compare)', () => {
    const state = makeSettingsFixture();

    // Same input → same reference, so an unrelated store write that preserves
    // the debug cluster does not re-fire the subscription.
    expect(selectDisabledPasses(state)).toBe(state.debug.disabledPasses);
  });
});
